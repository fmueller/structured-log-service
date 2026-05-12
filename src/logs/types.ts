import type { Context } from '@opentelemetry/api';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type LogRecord = {
  timestamp: string;
  level: LogLevel;
  message: string;
  meta: Record<string, unknown>;
};

export type QueuedLogEntry = {
  id: string;
  clientId: string;
  receivedAt: Date;
  record: LogRecord;
  parentContext: Context;
};

export type ProcessingResult =
  | { ok: true; attempts: number }
  | { ok: false; attempts: number; error: Error };
