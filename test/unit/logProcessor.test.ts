import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

function makeProcessor(
  overrides: Partial<{
    baseMs: number;
    jitterMs: number;
    failureRatePercent: number;
    random: () => number;
  }> = {},
): StdoutLogProcessor {
  return new StdoutLogProcessor({
    baseMs: 0,
    jitterMs: 0,
    failureRatePercent: 0,
    ...overrides,
  });
}

describe('StdoutLogProcessor', () => {
  beforeEach(() => {
    vi.spyOn(logger, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws "Simulated log processing failure" when meta.simulate_processing_failure is true', async () => {
    const processor = makeProcessor();
    const record = makeRecord({ meta: { simulate_processing_failure: true } });

    await expect(processor.process(record)).rejects.toThrow('Simulated log processing failure');
  });

  it('does not call logger.info when the record simulates a processing failure', async () => {
    const processor = makeProcessor();
    const record = makeRecord({ meta: { simulate_processing_failure: true } });

    await expect(processor.process(record)).rejects.toThrow();

    expect(vi.mocked(logger.info)).not.toHaveBeenCalled();
  });

  it('logs exactly once with the expected structured payload on success', async () => {
    const processor = makeProcessor();
    const record = makeRecord({
      timestamp: '2024-06-01T12:34:56.789Z',
      level: 'warn',
      message: 'real-message',
      meta: { service: 'svc-a', requestId: 'req-1' },
    });

    await processor.process(record);

    expect(vi.mocked(logger.info)).toHaveBeenCalledTimes(1);
    const [payload, msg] = vi.mocked(logger.info).mock.calls[0] as [
      Record<string, unknown>,
      string,
    ];
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
    const processor = makeProcessor();
    const record = makeRecord({ meta: { simulate_processing_failure: 'true' } });

    await expect(processor.process(record)).resolves.toBeUndefined();
  });

  it('waits at least baseMs before resolving when jitter is 0', async () => {
    const processor = makeProcessor({ baseMs: 25 });

    const startedAt = Date.now();
    await processor.process(makeRecord());
    const elapsed = Date.now() - startedAt;

    expect(elapsed).toBeGreaterThanOrEqual(20);
  });

  it('with baseMs 0 and jitterMs 0 resolves promptly', async () => {
    const processor = makeProcessor();

    const startedAt = Date.now();
    await processor.process(makeRecord());
    const elapsed = Date.now() - startedAt;

    expect(elapsed).toBeLessThan(20);
  });

  it('with random returning 0 delays by exactly baseMs', async () => {
    const processor = makeProcessor({ baseMs: 30, jitterMs: 100, random: () => 0 });

    const startedAt = Date.now();
    await processor.process(makeRecord());
    const elapsed = Date.now() - startedAt;

    expect(elapsed).toBeGreaterThanOrEqual(25);
    expect(elapsed).toBeLessThan(60);
  });

  it('with random returning 0.9999999 delays by approximately baseMs + jitterMs', async () => {
    const processor = makeProcessor({ baseMs: 10, jitterMs: 40, random: () => 0.9999999 });

    const startedAt = Date.now();
    await processor.process(makeRecord());
    const elapsed = Date.now() - startedAt;

    expect(elapsed).toBeGreaterThanOrEqual(45);
    expect(elapsed).toBeLessThan(80);
  });

  it('with jitterMs 0 ignores random output and resolves promptly', async () => {
    const processor = makeProcessor({ baseMs: 0, jitterMs: 0, random: () => 0.9 });

    const startedAt = Date.now();
    await processor.process(makeRecord());
    const elapsed = Date.now() - startedAt;

    expect(elapsed).toBeLessThan(20);
  });

  it('invokes random exactly once per process() call when failure rate is 0', async () => {
    const random = vi.fn(() => 0);
    const processor = makeProcessor({ jitterMs: 10, random });

    await processor.process(makeRecord());
    await processor.process(makeRecord());
    await processor.process(makeRecord());

    expect(random).toHaveBeenCalledTimes(3);
  });

  it('does not throw when failureRatePercent is 0 even with an extreme-low random draw', async () => {
    const processor = makeProcessor({ failureRatePercent: 0, random: () => 0 });

    await expect(processor.process(makeRecord())).resolves.toBeUndefined();
  });

  it('throws "Injected artificial processing failure" when failureRatePercent is 100', async () => {
    const processor = makeProcessor({ failureRatePercent: 100, random: () => 0.9999 });

    await expect(processor.process(makeRecord())).rejects.toThrow(
      'Injected artificial processing failure',
    );
  });

  it('throws when random()*100 is strictly below failureRatePercent', async () => {
    const processor = makeProcessor({ failureRatePercent: 50, random: () => 0.4 });

    await expect(processor.process(makeRecord())).rejects.toThrow(
      'Injected artificial processing failure',
    );
  });

  it('does not throw when random()*100 equals failureRatePercent (boundary is exclusive)', async () => {
    const processor = makeProcessor({ failureRatePercent: 50, random: () => 0.5 });

    await expect(processor.process(makeRecord())).resolves.toBeUndefined();
  });

  it('does not throw when random()*100 is above failureRatePercent', async () => {
    const processor = makeProcessor({ failureRatePercent: 50, random: () => 0.6 });

    await expect(processor.process(makeRecord())).resolves.toBeUndefined();
  });

  it('does not call logger.info when an artificial failure is injected', async () => {
    const processor = makeProcessor({ failureRatePercent: 100, random: () => 0 });

    await expect(processor.process(makeRecord())).rejects.toThrow();

    expect(vi.mocked(logger.info)).not.toHaveBeenCalled();
  });

  it('deterministic simulate_processing_failure wins over a 0% rate', async () => {
    const processor = makeProcessor({ failureRatePercent: 0, random: () => 0 });
    const record = makeRecord({ meta: { simulate_processing_failure: true } });

    await expect(processor.process(record)).rejects.toThrow('Simulated log processing failure');
  });

  it('invokes random twice per process() call when failureRatePercent > 0 (jitter + failure decision)', async () => {
    const random = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(0.99);
    const processor = makeProcessor({ jitterMs: 10, failureRatePercent: 1, random });

    await processor.process(makeRecord());

    expect(random).toHaveBeenCalledTimes(2);
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
