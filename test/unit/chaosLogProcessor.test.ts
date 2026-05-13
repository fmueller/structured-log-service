import { trace } from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChaosLogProcessor } from '../../src/logs/chaosLogProcessor';
import { type ChaosPolicyConfig, createSeededRng } from '../../src/logs/chaosPolicy';
import type { LogProcessor } from '../../src/logs/logProcessor';
import { TransientProcessingError } from '../../src/logs/transientProcessingError';
import type { LogRecord } from '../../src/logs/types';

function makeRecord(overrides: Partial<LogRecord> = {}): LogRecord {
  return {
    timestamp: '2024-01-01T00:00:00.000Z',
    level: 'info',
    message: 'hello',
    meta: {},
    ...overrides,
  };
}

function makeInnerProcessor(): LogProcessor & { processed: LogRecord[] } {
  const processed: LogRecord[] = [];
  return {
    processed,
    async process(record: LogRecord): Promise<void> {
      processed.push(record);
    },
  };
}

const noFailurePolicy: ChaosPolicyConfig = {
  latencyMedianMs: 20,
  latencyP99Ms: 500,
  outlierRate: 0,
  outlierMinMs: 2000,
  outlierMaxMs: 5000,
  transientFailureRate: 0,
  permanentFailureRate: 0,
};

const alwaysTransientPolicy: ChaosPolicyConfig = {
  ...noFailurePolicy,
  latencyMedianMs: 1,
  latencyP99Ms: 1,
  transientFailureRate: 1,
};

const alwaysPermanentPolicy: ChaosPolicyConfig = {
  ...noFailurePolicy,
  latencyMedianMs: 1,
  latencyP99Ms: 1,
  permanentFailureRate: 1,
};

describe('ChaosLogProcessor', () => {
  let setAttribute: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    setAttribute = vi.fn();
    vi.spyOn(trace, 'getActiveSpan').mockReturnValue({
      setAttribute,
    } as unknown as ReturnType<typeof trace.getActiveSpan>);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sets span attributes and delegates to inner when outcome is none', async () => {
    const inner = makeInnerProcessor();
    const rng = createSeededRng(42);
    const chaos = new ChaosLogProcessor(inner, noFailurePolicy, rng);
    const record = makeRecord();

    const promise = chaos.process(record);
    await vi.runAllTimersAsync();
    await promise;

    expect(setAttribute).toHaveBeenCalledWith('chaos.injected_latency_ms', expect.any(Number));
    expect(setAttribute).toHaveBeenCalledWith('chaos.injected_failure_kind', 'none');
    expect(inner.processed).toHaveLength(1);
    expect(inner.processed[0]).toBe(record);
  });

  it('advances the clock for the injected latency', async () => {
    const inner = makeInnerProcessor();
    const zeroLatencyPolicy: ChaosPolicyConfig = {
      ...noFailurePolicy,
      latencyMedianMs: 1,
      latencyP99Ms: 1,
    };
    const chaos = new ChaosLogProcessor(inner, zeroLatencyPolicy, () => 0.5);

    const promise = chaos.process(makeRecord());
    await vi.runAllTimersAsync();
    await promise;

    expect(inner.processed).toHaveLength(1);
  });

  it('throws TransientProcessingError and does not call inner on transient failure', async () => {
    const inner = makeInnerProcessor();
    const chaos = new ChaosLogProcessor(inner, alwaysTransientPolicy, () => 0.5);

    const assertion = expect(chaos.process(makeRecord())).rejects.toBeInstanceOf(
      TransientProcessingError,
    );
    await vi.runAllTimersAsync();
    await assertion;

    expect(inner.processed).toHaveLength(0);
    expect(setAttribute).toHaveBeenCalledWith('chaos.injected_failure_kind', 'transient');
  });

  it('throws plain Error (not TransientProcessingError) on permanent failure', async () => {
    const inner = makeInnerProcessor();
    const chaos = new ChaosLogProcessor(inner, alwaysPermanentPolicy, () => 0.5);

    const promise = chaos.process(makeRecord());
    // Attach a noop catch to prevent unhandled rejection before the assertion runs.
    promise.catch(() => undefined);

    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow('chaos: simulated permanent failure');
    await expect(promise).rejects.not.toBeInstanceOf(TransientProcessingError);
    expect(inner.processed).toHaveLength(0);
    expect(setAttribute).toHaveBeenCalledWith('chaos.injected_failure_kind', 'permanent');
  });

  it('does not crash when getActiveSpan returns undefined', async () => {
    vi.spyOn(trace, 'getActiveSpan').mockReturnValue(undefined);
    const inner = makeInnerProcessor();
    const chaos = new ChaosLogProcessor(inner, noFailurePolicy, createSeededRng(1));

    const promise = chaos.process(makeRecord());
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBeUndefined();
    expect(inner.processed).toHaveLength(1);
  });

  it('sets span attributes before the sleep so they are recorded even on timeout', async () => {
    const inner = makeInnerProcessor();
    // Use a policy that produces a large latency and no failure
    const slowPolicy: ChaosPolicyConfig = {
      ...noFailurePolicy,
      outlierRate: 1,
      outlierMinMs: 5000,
      outlierMaxMs: 5000,
    };
    const chaos = new ChaosLogProcessor(inner, slowPolicy, () => 0.5);

    // Start process but don't advance timers yet
    const promise = chaos.process(makeRecord());

    // Attributes should already be set before the sleep resolves
    expect(setAttribute).toHaveBeenCalledWith('chaos.injected_latency_ms', 5000);
    expect(setAttribute).toHaveBeenCalledWith('chaos.injected_failure_kind', 'none');

    await vi.runAllTimersAsync();
    await promise;
  });
});
