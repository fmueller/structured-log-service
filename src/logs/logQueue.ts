import type { QueuedLogEntry } from './types';

export type EnqueueResult =
  | { accepted: true; acceptedCount: number; queueDepth: number }
  | { accepted: false; reason: 'queue_full'; queueDepth: number; capacity: number };

export class LogQueue {
  private readonly items: QueuedLogEntry[] = [];

  constructor(private readonly maxSize: number) {
    if (!Number.isInteger(maxSize) || maxSize <= 0) {
      throw new Error('LogQueue maxSize must be a positive integer');
    }
  }

  enqueueMany(entries: QueuedLogEntry[]): EnqueueResult {
    if (this.items.length + entries.length > this.maxSize) {
      return {
        accepted: false,
        reason: 'queue_full',
        queueDepth: this.items.length,
        capacity: this.maxSize,
      };
    }

    this.items.push(...entries);
    return {
      accepted: true,
      acceptedCount: entries.length,
      queueDepth: this.items.length,
    };
  }

  dequeue(): QueuedLogEntry | undefined {
    return this.items.shift();
  }

  depth(): number {
    return this.items.length;
  }

  capacity(): number {
    return this.maxSize;
  }
}
