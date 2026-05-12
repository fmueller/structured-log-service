import type { QueuedLogEntry } from './types';

export function getServiceName(entry: QueuedLogEntry): string {
  const value = entry.record.meta.service;
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return 'unknown';
}
