import { logger } from '../observability/logger';
import type { LogRecord } from './types';

export interface LogProcessor {
  process(record: LogRecord): Promise<void>;
}

export class StdoutLogProcessor implements LogProcessor {
  constructor(private readonly processingDelayMs: number) {}

  async process(record: LogRecord): Promise<void> {
    await sleep(this.processingDelayMs);

    if (record.meta.simulate_processing_failure === true) {
      throw new Error('Simulated log processing failure');
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
