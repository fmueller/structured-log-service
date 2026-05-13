import { logger } from '../observability/logger';
import type { LogRecord } from './types';

export interface LogProcessor {
  process(record: LogRecord): Promise<void>;
}

export interface StdoutLogProcessorOptions {
  baseMs: number;
  jitterMs: number;
  failureRatePercent: number;
  random?: () => number;
}

export class StdoutLogProcessor implements LogProcessor {
  private readonly baseMs: number;
  private readonly jitterMs: number;
  private readonly failureRatePercent: number;
  private readonly random: () => number;

  constructor(options: StdoutLogProcessorOptions) {
    this.baseMs = options.baseMs;
    this.jitterMs = options.jitterMs;
    this.failureRatePercent = options.failureRatePercent;
    this.random = options.random ?? Math.random;
  }

  async process(record: LogRecord): Promise<void> {
    const delay = this.baseMs + Math.floor(this.random() * (this.jitterMs + 1));
    if (delay > 0) await sleep(delay);

    if (record.meta.simulate_processing_failure === true) {
      throw new Error('Simulated log processing failure');
    }

    if (this.failureRatePercent > 0 && this.random() * 100 < this.failureRatePercent) {
      throw new Error('Injected artificial processing failure');
    }

    logger.info(
      {
        type: 'processed_log',
        processedAt: new Date().toISOString(),
        originalTimestamp: record.timestamp,
        level: record.level,
        message: record.message,
        meta: record.meta,
      },
      'log processed',
    );
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
