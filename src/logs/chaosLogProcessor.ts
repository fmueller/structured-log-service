import { trace } from '@opentelemetry/api';

import { type LogProcessor, sleep } from './logProcessor';
import { type ChaosPolicyConfig, type Rng, decideChaosOutcome } from './chaosPolicy';
import { TransientProcessingError } from './transientProcessingError';
import type { LogRecord } from './types';

export class ChaosLogProcessor implements LogProcessor {
  constructor(
    private readonly inner: LogProcessor,
    private readonly policy: ChaosPolicyConfig,
    private readonly rng: Rng = Math.random,
  ) {}

  async process(record: LogRecord): Promise<void> {
    const outcome = decideChaosOutcome(this.rng, this.policy);
    const span = trace.getActiveSpan();
    span?.setAttribute('chaos.injected_latency_ms', outcome.latencyMs);
    span?.setAttribute('chaos.injected_failure_kind', outcome.failureKind);

    if (outcome.latencyMs > 0) {
      await sleep(outcome.latencyMs);
    }

    if (outcome.failureKind === 'transient') {
      throw new TransientProcessingError('chaos: simulated transient failure');
    }

    if (outcome.failureKind === 'permanent') {
      throw new Error('chaos: simulated permanent failure');
    }

    await this.inner.process(record);
  }
}
