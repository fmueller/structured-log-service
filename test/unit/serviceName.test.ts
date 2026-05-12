import { ROOT_CONTEXT } from '@opentelemetry/api';
import { describe, expect, it } from 'vitest';

import { getServiceName } from '../../src/logs/serviceName';
import type { LogRecord, QueuedLogEntry } from '../../src/logs/types';

function makeEntry(meta: LogRecord['meta'] = {}): QueuedLogEntry {
  return {
    id: 'entry-1',
    clientId: 'client-1',
    receivedAt: new Date(),
    record: {
      timestamp: '2024-01-01T00:00:00.000Z',
      level: 'info',
      message: 'hello',
      meta,
    },
    parentContext: ROOT_CONTEXT,
  };
}

describe('getServiceName', () => {
  it('returns the service when meta.service is a non-empty string', () => {
    expect(getServiceName(makeEntry({ service: 'orders' }))).toBe('orders');
  });

  it('returns "unknown" when meta.service is an empty string', () => {
    expect(getServiceName(makeEntry({ service: '' }))).toBe('unknown');
  });

  it('returns "unknown" when meta.service is missing', () => {
    expect(getServiceName(makeEntry())).toBe('unknown');
  });

  it('returns "unknown" when meta.service is not a string', () => {
    expect(getServiceName(makeEntry({ service: 42 }))).toBe('unknown');
    expect(getServiceName(makeEntry({ service: null }))).toBe('unknown');
    expect(getServiceName(makeEntry({ service: { name: 'orders' } }))).toBe('unknown');
  });
});
