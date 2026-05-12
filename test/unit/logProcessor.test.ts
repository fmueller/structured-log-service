import { afterEach, describe, expect, it, vi } from 'vitest';

import { sleep, StdoutLogProcessor } from '../../src/logs/logProcessor';
import type { LogRecord } from '../../src/logs/types';
import { logger } from '../../src/observability/logger';

function makeRecord(overrides: Partial<LogRecord> = {}): LogRecord {
  return {
    timestamp: '2024-01-01T00:00:00.000Z',
    level: 'info',
    message: 'hello',
    meta: {},
    ...overrides,
  };
}

describe('StdoutLogProcessor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws "Simulated log processing failure" when meta.simulate_processing_failure is true', async () => {
    const processor = new StdoutLogProcessor(0);
    const record = makeRecord({ meta: { simulate_processing_failure: true } });

    await expect(processor.process(record)).rejects.toThrow('Simulated log processing failure');
  });

  it('does not call logger.info when the record simulates a processing failure', async () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    const processor = new StdoutLogProcessor(0);
    const record = makeRecord({ meta: { simulate_processing_failure: true } });

    await expect(processor.process(record)).rejects.toThrow();

    expect(info).not.toHaveBeenCalled();
  });

  it('logs exactly once with the expected structured payload on success', async () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    const processor = new StdoutLogProcessor(0);
    const record = makeRecord({
      timestamp: '2024-06-01T12:34:56.789Z',
      level: 'warn',
      message: 'real-message',
      meta: { service: 'svc-a', requestId: 'req-1' },
    });

    await processor.process(record);

    expect(info).toHaveBeenCalledTimes(1);
    const [payload, msg] = info.mock.calls[0] as [Record<string, unknown>, string];
    expect(msg).toBe('log processed');
    expect(payload).toMatchObject({
      type: 'processed_log',
      originalTimestamp: '2024-06-01T12:34:56.789Z',
      level: 'warn',
      message: 'real-message',
      meta: { service: 'svc-a', requestId: 'req-1' },
    });
    expect(payload.processedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('does not treat truthy-but-not-true simulate flags as failures', async () => {
    vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    const processor = new StdoutLogProcessor(0);
    const record = makeRecord({ meta: { simulate_processing_failure: 'true' } });

    await expect(processor.process(record)).resolves.toBeUndefined();
  });

  it('waits at least processingDelayMs before resolving', async () => {
    vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    const processor = new StdoutLogProcessor(25);

    const startedAt = Date.now();
    await processor.process(makeRecord());
    const elapsed = Date.now() - startedAt;

    expect(elapsed).toBeGreaterThanOrEqual(20);
  });

  it('with processingDelayMs of 0 resolves promptly', async () => {
    vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    const processor = new StdoutLogProcessor(0);

    const startedAt = Date.now();
    await processor.process(makeRecord());
    const elapsed = Date.now() - startedAt;

    expect(elapsed).toBeLessThan(20);
  });
});

describe('sleep', () => {
  it('resolves no earlier than the given ms', async () => {
    const startedAt = Date.now();
    await sleep(25);
    const elapsed = Date.now() - startedAt;

    expect(elapsed).toBeGreaterThanOrEqual(20);
  });

  it('with 0 resolves on the next tick', async () => {
    const startedAt = Date.now();
    await sleep(0);
    const elapsed = Date.now() - startedAt;

    expect(elapsed).toBeLessThan(20);
  });
});
