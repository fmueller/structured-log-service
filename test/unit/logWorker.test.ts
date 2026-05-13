import { randomUUID } from 'node:crypto';

import { ROOT_CONTEXT } from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LogQueue } from '../../src/logs/logQueue';
import { LogWorker } from '../../src/logs/logWorker';
import type { LogWorkerConfig } from '../../src/logs/logWorkerConfig';
import type { LogRecord, QueuedLogEntry } from '../../src/logs/types';
import { logger } from '../../src/observability/logger';
import { FakeProcessor, makePermanentFailProcessor } from '../helpers/fakes';
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

  it('permanent error (non-TransientProcessingError) fails on first attempt without retrying', async () => {
    const queue = new LogQueue(10);
    const permanent = makePermanentFailProcessor();
    worker = new LogWorker(queue, permanent, baseConfig);

    worker.start();
    queue.enqueueMany([makeEntry()]);
    worker.notify();

    await waitUntil(() => permanent.attempts === 1);
    // Yield so the final logger.error call completes.
    await new Promise((r) => setTimeout(r, 20));
    expect(permanent.attempts).toBe(1);
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

  it('isRunning() returns false before start()', () => {
    const queue = new LogQueue(10);
    const fake = new FakeProcessor();
    worker = new LogWorker(queue, fake, baseConfig);

    expect(worker.isRunning()).toBe(false);
  });

  it('isRunning() returns true after start()', () => {
    const queue = new LogQueue(10);
    const fake = new FakeProcessor();
    worker = new LogWorker(queue, fake, baseConfig);

    worker.start();

    expect(worker.isRunning()).toBe(true);
  });

  it('start() called twice does not reset the running state', () => {
    const queue = new LogQueue(10);
    const fake = new FakeProcessor();
    worker = new LogWorker(queue, fake, baseConfig);

    worker.start();
    worker.start();

    expect(worker.isRunning()).toBe(true);
  });

  it('notify() before start() does not process queued entries', async () => {
    const queue = new LogQueue(10);
    const fake = new FakeProcessor();
    worker = new LogWorker(queue, fake, baseConfig);

    queue.enqueueMany([makeEntry()]);
    worker.notify();

    await new Promise((r) => setTimeout(r, 150));

    expect(fake.processed).toHaveLength(0);
  });

  it('continues polling and processes a late-arriving entry without notify()', async () => {
    const queue = new LogQueue(10);
    const fake = new FakeProcessor();
    worker = new LogWorker(queue, fake, { ...baseConfig, pollIntervalMs: 50 });

    worker.start();
    queue.enqueueMany([makeEntry()]);
    worker.notify();
    await waitUntil(() => fake.processed.length === 1, 1_000);

    queue.enqueueMany([makeEntry()]);

    await waitUntil(() => fake.processed.length === 2, 500);
    expect(fake.processed).toHaveLength(2);
  });

  it('notify() short-circuits a long poll interval after the queue has gone quiet', async () => {
    const queue = new LogQueue(10);
    const fake = new FakeProcessor();
    worker = new LogWorker(queue, fake, { ...baseConfig, pollIntervalMs: 5_000 });

    worker.start();
    // Give the initial start-time tick time to run against an empty queue,
    // so it schedules the next tick 5s away.
    await new Promise((r) => setTimeout(r, 30));

    const startedAt = Date.now();
    queue.enqueueMany([makeEntry()]);
    worker.notify();
    await waitUntil(() => fake.processed.length === 1, 1_000);
    const elapsed = Date.now() - startedAt;

    expect(elapsed).toBeLessThan(500);
  });
});

describe('LogWorker observability', () => {
  let worker: LogWorker | undefined;
  let info: ReturnType<typeof vi.spyOn>;
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    info = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    if (worker) {
      await worker.drain(500);
    }
    vi.restoreAllMocks();
  });

  it('emits log_processing_succeeded with entryId, clientId, retryCount, processingMs on success', async () => {
    const queue = new LogQueue(10);
    const fake = new FakeProcessor();
    worker = new LogWorker(queue, fake, baseConfig);

    const entry = makeEntry();
    worker.start();
    queue.enqueueMany([entry]);
    worker.notify();

    await waitUntil(() => fake.processed.length === 1);

    const successCall = info.mock.calls.find(
      (call) => (call[0] as { type?: string }).type === 'log_processing_succeeded',
    );
    expect(successCall).toBeDefined();
    const [payload, msg] = successCall as [Record<string, unknown>, string];
    expect(msg).toBe('log processing succeeded');
    expect(payload).toMatchObject({
      type: 'log_processing_succeeded',
      entryId: entry.id,
      clientId: entry.clientId,
      retryCount: 0,
    });
    expect(typeof payload.processingMs).toBe('number');
    expect(payload.processingMs).toBeGreaterThanOrEqual(0);
  });

  it('emits log_processing_attempt_failed for each retry with finalAttempt: false until exhaustion', async () => {
    const queue = new LogQueue(10);
    const fake = new FakeProcessor({ failTimes: 2 });
    worker = new LogWorker(queue, fake, baseConfig);

    const entry = makeEntry();
    worker.start();
    queue.enqueueMany([entry]);
    worker.notify();

    await waitUntil(() => fake.processed.length === 1);

    const attemptFailed = warn.mock.calls.filter(
      (call) => (call[0] as { type?: string }).type === 'log_processing_attempt_failed',
    );
    expect(attemptFailed).toHaveLength(2);
    expect(attemptFailed[0]?.[0]).toMatchObject({
      type: 'log_processing_attempt_failed',
      entryId: entry.id,
      clientId: entry.clientId,
      retryCount: 0,
      finalAttempt: false,
    });
    expect(attemptFailed[1]?.[0]).toMatchObject({
      retryCount: 1,
      finalAttempt: false,
    });
  });

  it('emits log_processing_failed with attempts and the full record when retries are exhausted', async () => {
    const queue = new LogQueue(10);
    const fake = new FakeProcessor({ failTimes: Number.POSITIVE_INFINITY });
    worker = new LogWorker(queue, fake, baseConfig);

    const entry = makeEntry(
      makeRecord({ message: 'unique-msg', meta: { service: 'svc-x', other: 1 } }),
    );
    worker.start();
    queue.enqueueMany([entry]);
    worker.notify();

    await waitUntil(() => fake.attempts === 4);
    // Yield the event loop so the final logger.error call completes.
    await new Promise((r) => setTimeout(r, 20));

    expect(error).toHaveBeenCalledTimes(1);
    const [payload, msg] = error.mock.calls[0] as [Record<string, unknown>, string];
    expect(msg).toBe('log processing failed');
    expect(payload).toMatchObject({
      type: 'log_processing_failed',
      entryId: entry.id,
      clientId: entry.clientId,
      attempts: 4,
      record: {
        timestamp: entry.record.timestamp,
        level: entry.record.level,
        message: 'unique-msg',
        meta: { service: 'svc-x', other: 1 },
      },
    });
  });

  it('with retryBackoffBaseMs: 0, drain after a failure completes promptly (no backoff sleep)', async () => {
    const queue = new LogQueue(10);
    const fake = new FakeProcessor({ failTimes: 2 });
    worker = new LogWorker(queue, fake, { ...baseConfig, retryBackoffBaseMs: 0 });

    const startedAt = Date.now();
    worker.start();
    queue.enqueueMany([makeEntry()]);
    worker.notify();
    await waitUntil(() => fake.processed.length === 1);
    const elapsed = Date.now() - startedAt;

    expect(elapsed).toBeLessThan(50);
    expect(fake.attempts).toBe(3);
  });

  it('applies exponential backoff across three failures (base * 2^retryCount)', async () => {
    const queue = new LogQueue(10);
    const fake = new FakeProcessor({ failTimes: 3 });
    worker = new LogWorker(queue, fake, { ...baseConfig, retryBackoffBaseMs: 20 });

    const startedAt = Date.now();
    worker.start();
    queue.enqueueMany([makeEntry()]);
    worker.notify();
    await waitUntil(() => fake.processed.length === 1, 3_000);
    const elapsed = Date.now() - startedAt;

    // Three failures -> sleeps of 20*2^0 + 20*2^1 + 20*2^2 = 20+40+80 = 140ms.
    expect(elapsed).toBeGreaterThanOrEqual(140);
    expect(fake.attempts).toBe(4);
  });

  it('emits log_processing_failed with attempts: 1 for a permanent (non-transient) error', async () => {
    const queue = new LogQueue(10);
    const permanent = makePermanentFailProcessor();
    worker = new LogWorker(queue, permanent, baseConfig);

    const entry = makeEntry();
    worker.start();
    queue.enqueueMany([entry]);
    worker.notify();

    await waitUntil(() => permanent.attempts === 1);
    await new Promise((r) => setTimeout(r, 20));

    expect(error).toHaveBeenCalledTimes(1);
    const [payload, msg] = error.mock.calls[0] as [Record<string, unknown>, string];
    expect(msg).toBe('log processing failed');
    expect(payload).toMatchObject({
      type: 'log_processing_failed',
      entryId: entry.id,
      clientId: entry.clientId,
      attempts: 1,
    });
  });
});
