import { randomUUID } from 'node:crypto';

import { ROOT_CONTEXT } from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LogQueue } from '../../src/logs/logQueue';
import { LogWorker } from '../../src/logs/logWorker';
import type { LogWorkerConfig } from '../../src/logs/logWorkerConfig';
import type { LogRecord, QueuedLogEntry } from '../../src/logs/types';
import { FakeProcessor } from '../helpers/fakes';
import { waitUntil } from '../helpers/waitUntil';

function makeRecord(overrides: Partial<LogRecord> = {}): LogRecord {
  return {
    timestamp: '2024-01-01T00:00:00.000Z',
    level: 'info',
    message: 'hello',
    meta: {},
    ...overrides,
  };
}

function makeEntry(record: LogRecord = makeRecord()): QueuedLogEntry {
  return {
    id: randomUUID(),
    clientId: 'client-1',
    receivedAt: new Date(),
    record,
    parentContext: ROOT_CONTEXT,
  };
}

const baseConfig: LogWorkerConfig = {
  concurrency: 5,
  maxRetries: 3,
  pollIntervalMs: 100,
  retryBackoffBaseMs: 0,
};

describe('LogWorker', () => {
  let worker: LogWorker | undefined;

  beforeEach(() => {
    worker = undefined;
  });

  afterEach(async () => {
    if (worker) {
      await worker.drain(500);
    }
  });

  it('drains queued entries', async () => {
    const queue = new LogQueue(100);
    const fake = new FakeProcessor();
    worker = new LogWorker(queue, fake, baseConfig);

    worker.start();
    const entries = Array.from({ length: 10 }, () => makeEntry());
    queue.enqueueMany(entries);
    worker.notify();

    await waitUntil(() => fake.processed.length === 10);
    expect(fake.processed).toHaveLength(10);
  });

  it('does not exceed configured concurrency', async () => {
    const queue = new LogQueue(100);
    const fake = new FakeProcessor({ delayMs: 50 });
    worker = new LogWorker(queue, fake, { ...baseConfig, concurrency: 2 });

    worker.start();
    queue.enqueueMany(Array.from({ length: 10 }, () => makeEntry()));
    worker.notify();

    await waitUntil(() => fake.processed.length === 10, 5_000);

    expect(fake.maxConcurrent).toBeGreaterThan(0);
    expect(fake.maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('retries failed processing', async () => {
    const queue = new LogQueue(10);
    const fake = new FakeProcessor({ failTimes: 2 });
    worker = new LogWorker(queue, fake, baseConfig);

    worker.start();
    queue.enqueueMany([makeEntry()]);
    worker.notify();

    await waitUntil(() => fake.processed.length === 1);
    expect(fake.attempts).toBe(3);
    expect(fake.processed).toHaveLength(1);
  });

  it('applies exponential backoff between retries', async () => {
    const queue = new LogQueue(10);
    const fake = new FakeProcessor({ failTimes: 2 });
    worker = new LogWorker(queue, fake, { ...baseConfig, retryBackoffBaseMs: 30 });

    const startedAt = Date.now();
    worker.start();
    queue.enqueueMany([makeEntry()]);
    worker.notify();

    await waitUntil(() => fake.processed.length === 1, 2_000);
    const elapsed = Date.now() - startedAt;

    // Two failures → sleeps of base*2^0 (30ms) + base*2^1 (60ms) = 90ms minimum.
    expect(elapsed).toBeGreaterThanOrEqual(90);
    expect(fake.attempts).toBe(3);
  });

  it('gives up after maxRetries', async () => {
    const queue = new LogQueue(10);
    const fake = new FakeProcessor({ failTimes: Number.POSITIVE_INFINITY });
    worker = new LogWorker(queue, fake, baseConfig);

    worker.start();
    queue.enqueueMany([makeEntry()]);
    worker.notify();

    await waitUntil(() => fake.attempts === 4);
    expect(fake.processed).toHaveLength(0);
    expect(fake.attempts).toBe(4);
  });

  it('continues processing other entries after one fails', async () => {
    const queue = new LogQueue(20);
    const fake = new FakeProcessor();
    worker = new LogWorker(queue, fake, baseConfig);

    const poison = makeEntry(makeRecord({ meta: { simulate_processing_failure: true } }));
    const normal = Array.from({ length: 9 }, () => makeEntry());

    worker.start();
    queue.enqueueMany([poison, ...normal]);
    worker.notify();

    await waitUntil(() => fake.processed.length === 9, 2_000);
    expect(fake.processed).toHaveLength(9);
    expect(fake.processed).not.toContain(poison.record);
  });

  it('notify() collapses delayed poll', async () => {
    const queue = new LogQueue(10);
    const fake = new FakeProcessor();
    worker = new LogWorker(queue, fake, { ...baseConfig, pollIntervalMs: 5_000 });

    worker.start();
    queue.enqueueMany([makeEntry()]);
    worker.notify();

    const startedAt = Date.now();
    await waitUntil(() => fake.processed.length === 1, 1_000);
    const elapsed = Date.now() - startedAt;
    expect(elapsed).toBeLessThan(500);
  });

  it('drain returns within budget on timeout', async () => {
    const queue = new LogQueue(10);
    const fake = new FakeProcessor({ delayMs: 200 });
    worker = new LogWorker(queue, fake, { ...baseConfig, concurrency: 1 });

    worker.start();
    queue.enqueueMany(Array.from({ length: 5 }, () => makeEntry()));
    worker.notify();

    // Give the worker a moment to start processing at least one entry.
    await waitUntil(() => worker!.getActiveCount() === 1, 1_000);

    const startedAt = Date.now();
    const result = await worker.drain(50);
    const elapsed = Date.now() - startedAt;

    expect(elapsed).toBeLessThan(150);
    expect(result.timedOut).toBe(true);
    expect(result.remainingQueueDepth).toBeGreaterThanOrEqual(4);

    worker = undefined;
  });

  it('drain returns timedOut: false when in-flight finishes', async () => {
    const queue = new LogQueue(10);
    const fake = new FakeProcessor({ delayMs: 50 });
    worker = new LogWorker(queue, fake, baseConfig);

    worker.start();
    queue.enqueueMany([makeEntry()]);
    worker.notify();
    await waitUntil(() => worker!.getActiveCount() === 1, 1_000);

    const result = await worker.drain(500);
    expect(result.timedOut).toBe(false);
    expect(result.remainingQueueDepth).toBe(0);

    worker = undefined;
  });

  it("post-drain ticks don't fire", async () => {
    const queue = new LogQueue(10);
    const fake = new FakeProcessor();
    worker = new LogWorker(queue, fake, baseConfig);

    worker.start();
    queue.enqueueMany([makeEntry()]);
    worker.notify();

    await waitUntil(() => fake.processed.length === 1);
    await worker.drain(500);

    const processedBefore = fake.processed.length;
    queue.enqueueMany([makeEntry()]);
    worker.notify();
    await new Promise((r) => setTimeout(r, 200));

    expect(fake.processed.length).toBe(processedBefore);
    worker = undefined;
  });

  it('rejects invalid worker config at construction', () => {
    const queue = new LogQueue(10);
    const fake = new FakeProcessor();

    expect(() => new LogWorker(queue, fake, { ...baseConfig, concurrency: 0 })).toThrow(
      /concurrency/,
    );
    expect(() => new LogWorker(queue, fake, { ...baseConfig, maxRetries: -1 })).toThrow(
      /maxRetries/,
    );
    expect(() => new LogWorker(queue, fake, { ...baseConfig, pollIntervalMs: 0 })).toThrow(
      /pollIntervalMs/,
    );
    expect(() => new LogWorker(queue, fake, { ...baseConfig, retryBackoffBaseMs: -1 })).toThrow(
      /retryBackoffBaseMs/,
    );
  });
});
