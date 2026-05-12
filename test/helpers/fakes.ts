import type { LogProcessor } from '../../src/logs/logProcessor';
import type { LogRecord } from '../../src/logs/types';

export type FakeProcessorOptions = {
  failTimes?: number;
  delayMs?: number;
};

export class FakeProcessor implements LogProcessor {
  public readonly processed: LogRecord[] = [];
  public attempts = 0;
  public concurrentNow = 0;
  public maxConcurrent = 0;

  constructor(private readonly options: FakeProcessorOptions = {}) {}

  async process(record: LogRecord): Promise<void> {
    this.attempts += 1;
    this.concurrentNow += 1;
    if (this.concurrentNow > this.maxConcurrent) {
      this.maxConcurrent = this.concurrentNow;
    }

    try {
      const delayMs = this.options.delayMs ?? 0;
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      if (this.attempts <= (this.options.failTimes ?? 0)) {
        throw new Error('Fake processing failure');
      }

      if (record.meta.simulate_processing_failure === true) {
        throw new Error('Simulated processing failure');
      }

      this.processed.push(record);
    } finally {
      this.concurrentNow -= 1;
    }
  }
}
