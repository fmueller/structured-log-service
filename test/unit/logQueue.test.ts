import { ROOT_CONTEXT } from '@opentelemetry/api';
import { describe, expect, it } from 'vitest';

import { LogQueue } from '../../src/logs/logQueue';
import type { QueuedLogEntry } from '../../src/logs/types';

function makeEntry(id: string): QueuedLogEntry {
  return {
    id,
    clientId: 'client-1',
    receivedAt: new Date('2024-01-01T00:00:00.000Z'),
    record: {
      timestamp: '2024-01-01T00:00:00.000Z',
      level: 'info',
      message: `msg-${id}`,
      meta: {},
    },
    parentContext: ROOT_CONTEXT,
  };
}

describe('LogQueue', () => {
  it('constructor rejects 0', () => {
    expect(() => new LogQueue(0)).toThrow(/positive integer/);
  });

  it('constructor rejects negative', () => {
    expect(() => new LogQueue(-1)).toThrow(/positive integer/);
  });

  it('constructor rejects fractional', () => {
    expect(() => new LogQueue(1.5)).toThrow(/positive integer/);
  });

  it('constructor rejects non-finite', () => {
    expect(() => new LogQueue(Number.POSITIVE_INFINITY)).toThrow(/positive integer/);
    expect(() => new LogQueue(Number.NaN)).toThrow(/positive integer/);
  });

  it('dequeue is FIFO', () => {
    const queue = new LogQueue(10);
    const a = makeEntry('a');
    const b = makeEntry('b');
    const c = makeEntry('c');

    queue.enqueueMany([a, b, c]);

    expect(queue.dequeue()?.id).toBe('a');
    expect(queue.dequeue()?.id).toBe('b');
    expect(queue.dequeue()?.id).toBe('c');
  });

  it('depth() and capacity() match after fills and drains', () => {
    const queue = new LogQueue(5);
    expect(queue.depth()).toBe(0);
    expect(queue.capacity()).toBe(5);

    queue.enqueueMany([makeEntry('a'), makeEntry('b')]);
    expect(queue.depth()).toBe(2);
    expect(queue.capacity()).toBe(5);

    queue.dequeue();
    expect(queue.depth()).toBe(1);
    expect(queue.capacity()).toBe(5);
  });

  it('fills to capacity', () => {
    const queue = new LogQueue(3);
    const result = queue.enqueueMany([makeEntry('a'), makeEntry('b'), makeEntry('c')]);

    expect(result).toEqual({ accepted: true, acceptedCount: 3, queueDepth: 3 });
    expect(queue.depth()).toBe(queue.capacity());
  });

  it('rejects above capacity (all-or-nothing)', () => {
    const queue = new LogQueue(2);
    queue.enqueueMany([makeEntry('a')]);

    const result = queue.enqueueMany([makeEntry('b'), makeEntry('c')]);

    expect(result).toEqual({
      accepted: false,
      reason: 'queue_full',
      queueDepth: 1,
      capacity: 2,
    });
    expect(queue.depth()).toBe(1);
  });

  it('dequeue on empty returns undefined', () => {
    const queue = new LogQueue(3);
    expect(queue.dequeue()).toBeUndefined();
  });

  it('enqueueMany([]) is a no-op success', () => {
    const queue = new LogQueue(3);
    queue.enqueueMany([makeEntry('a')]);

    const result = queue.enqueueMany([]);

    expect(result).toEqual({ accepted: true, acceptedCount: 0, queueDepth: 1 });
    expect(queue.depth()).toBe(1);
  });

  it('enqueueMany([]) on a full queue returns accepted with acceptedCount 0', () => {
    const queue = new LogQueue(2);
    queue.enqueueMany([makeEntry('a'), makeEntry('b')]);

    const result = queue.enqueueMany([]);

    expect(result).toEqual({ accepted: true, acceptedCount: 0, queueDepth: 2 });
    expect(queue.depth()).toBe(2);
  });
});
