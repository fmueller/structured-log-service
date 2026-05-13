import { context, SpanKind, SpanStatusCode, trace, type Tracer } from '@opentelemetry/api';

import { logger } from '../observability/logger';
import { LogQueue } from './logQueue';
import { sleep, type LogProcessor } from './logProcessor';
import { TransientProcessingError } from './transientProcessingError';
import { classifyFailureKind, type FailureKind } from './failureKind';
import { validateWorkerConfig, type LogWorkerConfig } from './logWorkerConfig';
import { getServiceName } from './serviceName';
import type { ProcessingResult, QueuedLogEntry } from './types';

export class LogWorker {
  private readonly tracer: Tracer;
  private readonly config: LogWorkerConfig;

  private activeCount = 0;
  private stopped = true;
  private tickTimer: NodeJS.Timeout | undefined;
  private readonly inFlight = new Set<Promise<unknown>>();

  constructor(
    private readonly queue: LogQueue,
    private readonly processor: LogProcessor,
    config: LogWorkerConfig,
  ) {
    this.config = validateWorkerConfig(config);
    this.tracer = trace.getTracer('log-ingestion-service.worker');
  }

  start(): void {
    if (!this.stopped) {
      return;
    }
    this.stopped = false;
    this.scheduleTick(0);
  }

  async drain(timeoutMs: number): Promise<{ timedOut: boolean; remainingQueueDepth: number }> {
    this.stopped = true;

    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = undefined;
    }

    const allDone = Promise.allSettled(Array.from(this.inFlight));
    const timeout = new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), Math.max(0, timeoutMs)),
    );

    const result = await Promise.race([allDone, timeout]);

    return {
      timedOut: result === 'timeout',
      remainingQueueDepth: this.queue.depth(),
    };
  }

  isRunning(): boolean {
    return !this.stopped;
  }

  notify(): void {
    this.scheduleTick(0);
  }

  getActiveCount(): number {
    return this.activeCount;
  }

  private scheduleTick(delayMs: number): void {
    if (this.stopped) {
      return;
    }

    if (this.tickTimer) {
      // A timer is already pending. If the new request is also delayed, keep
      // the existing schedule; only replace when the new request is immediate.
      if (delayMs > 0) {
        return;
      }
      clearTimeout(this.tickTimer);
      this.tickTimer = undefined;
    }

    this.tickTimer = setTimeout(() => {
      this.tickTimer = undefined;
      this.tick();
    }, delayMs);
  }

  private tick(): void {
    if (this.stopped) {
      return;
    }

    let dispatchedCount = 0;
    while (this.activeCount < this.config.concurrency) {
      const entry = this.queue.dequeue();
      if (!entry) {
        break;
      }

      this.activeCount += 1;
      dispatchedCount += 1;

      const dispatched: Promise<unknown> = this.processWithRetries(entry)
        .catch((error: unknown) => {
          // processWithRetries should always resolve to ProcessingResult; this
          // is the last-resort safety net for unexpected throws.
          logger.error(
            {
              type: 'worker_unhandled_error',
              entryId: entry.id,
              clientId: entry.clientId,
              err: normalizeError(error),
            },
            'worker unhandled error',
          );
        })
        .finally(() => {
          this.activeCount -= 1;
          this.inFlight.delete(dispatched);
          this.scheduleTick(0);
        });

      this.inFlight.add(dispatched);
    }

    if (this.queue.depth() === 0) {
      this.scheduleTick(this.config.pollIntervalMs);
      return;
    }

    // Queue still has work. If we dispatched anything, follow up immediately;
    // otherwise we're at capacity — wait for `.finally()` to reschedule when a
    // slot frees, instead of spinning the event loop.
    if (dispatchedCount > 0) {
      this.scheduleTick(0);
    }
  }

  private async processWithRetries(entry: QueuedLogEntry): Promise<ProcessingResult> {
    for (let retryCount = 0; retryCount <= this.config.maxRetries; retryCount++) {
      try {
        await this.processAttempt(entry, retryCount);
        return { ok: true, attempts: retryCount + 1 };
      } catch (error) {
        const lastError = normalizeError(error);
        const isFinalAttempt =
          retryCount >= this.config.maxRetries || !(lastError instanceof TransientProcessingError);

        logger.warn(
          {
            type: 'log_processing_attempt_failed',
            entryId: entry.id,
            clientId: entry.clientId,
            retryCount,
            finalAttempt: isFinalAttempt,
            err: lastError,
          },
          'log processing attempt failed',
        );

        if (isFinalAttempt) {
          logger.error(
            {
              type: 'log_processing_failed',
              entryId: entry.id,
              clientId: entry.clientId,
              attempts: retryCount + 1,
              err: lastError,
              record: {
                timestamp: entry.record.timestamp,
                level: entry.record.level,
                message: entry.record.message,
                meta: entry.record.meta,
              },
            },
            'log processing failed',
          );

          return { ok: false, attempts: retryCount + 1, error: lastError };
        }

        await sleep(this.backoffMs(retryCount));
      }
    }

    throw new Error('unreachable: retry loop must return on success or final attempt');
  }

  private async processAttempt(entry: QueuedLogEntry, retryCount: number): Promise<void> {
    return context.with(entry.parentContext, () =>
      this.tracer.startActiveSpan(
        'log.process',
        {
          kind: SpanKind.INTERNAL,
          attributes: {
            'log.level': entry.record.level,
            'log.service': getServiceName(entry),
            'log.message.length': entry.record.message.length,
            'queue.depth': this.queue.depth(),
            'worker.retry_count': retryCount,
            'log.entry_id': entry.id,
            'client.id': entry.clientId,
          },
        },
        async (span) => {
          const startedAt = Date.now();
          try {
            await this.processor.process(entry.record);

            span.setAttribute('worker.failure_kind', 'none' satisfies FailureKind);
            span.setStatus({ code: SpanStatusCode.OK });

            logger.info(
              {
                type: 'log_processing_succeeded',
                entryId: entry.id,
                clientId: entry.clientId,
                retryCount,
                processingMs: Date.now() - startedAt,
              },
              'log processing succeeded',
            );
          } catch (error) {
            const normalized = normalizeError(error);
            span.setAttribute('worker.failure_kind', classifyFailureKind(normalized));
            span.recordException(normalized);
            span.setStatus({ code: SpanStatusCode.ERROR, message: normalized.message });
            throw normalized;
          } finally {
            span.setAttribute('worker.processing_ms', Date.now() - startedAt);
            span.end();
          }
        },
      ),
    );
  }

  private backoffMs(retryCount: number): number {
    if (this.config.retryBackoffBaseMs === 0) {
      return 0;
    }
    return this.config.retryBackoffBaseMs * 2 ** retryCount;
  }
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}
