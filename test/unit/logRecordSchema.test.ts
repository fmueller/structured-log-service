import { describe, expect, it } from 'vitest';

import { config } from '../../src/config';
import { LogBatchSchema, LogRecordSchema } from '../../src/logs/logRecordSchema';

const validRecord = {
  timestamp: '2024-01-01T00:00:00.000Z',
  level: 'info' as const,
  message: 'hello',
};

describe('LogRecordSchema', () => {
  it('accepts a valid record and defaults meta to {}', () => {
    const result = LogRecordSchema.parse(validRecord);

    expect(result.meta).toEqual({});
  });

  it('rejects invalid timestamp', () => {
    const result = LogRecordSchema.safeParse({ ...validRecord, timestamp: 'yesterday' });

    expect(result.success).toBe(false);
  });

  it('rejects invalid level', () => {
    const result = LogRecordSchema.safeParse({ ...validRecord, level: 'verbose' });

    expect(result.success).toBe(false);
  });

  it('rejects missing message', () => {
    const result = LogRecordSchema.safeParse({
      timestamp: '2024-01-01T00:00:00.000Z',
      level: 'info',
    });

    expect(result.success).toBe(false);
  });

  it('rejects empty message', () => {
    const result = LogRecordSchema.safeParse({ ...validRecord, message: '' });

    expect(result.success).toBe(false);
  });

  it('rejects message longer than 10_000 chars', () => {
    const result = LogRecordSchema.safeParse({ ...validRecord, message: 'a'.repeat(10_001) });

    expect(result.success).toBe(false);
  });

  it('rejects meta when not an object', () => {
    const result = LogRecordSchema.safeParse({ ...validRecord, meta: 'not an object' });

    expect(result.success).toBe(false);
  });

  it('accepts meta with nested object/array values', () => {
    const meta = { nested: { a: 1 }, arr: [1, 'two'] };
    const result = LogBatchSchema.parse([{ ...validRecord, meta }]);

    expect(result[0].meta).toEqual(meta);
  });
});

describe('LogBatchSchema', () => {
  it('accepts valid batch and defaults meta to {}', () => {
    const result = LogBatchSchema.parse([validRecord]);

    expect(result).toHaveLength(1);
    expect(result[0].meta).toEqual({});
  });

  it('rejects non-array payload', () => {
    const result = LogBatchSchema.safeParse({
      timestamp: '2024-01-01T00:00:00.000Z',
      level: 'info',
      message: 'hello',
    });

    expect(result.success).toBe(false);
  });

  it('rejects empty array', () => {
    const result = LogBatchSchema.safeParse([]);

    expect(result.success).toBe(false);
  });

  it('rejects batch larger than maxBatchSize', () => {
    const oversized = Array.from({ length: config.logs.maxBatchSize + 1 }, () => validRecord);
    const result = LogBatchSchema.safeParse(oversized);

    expect(result.success).toBe(false);
  });
});
