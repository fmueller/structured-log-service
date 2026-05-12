import { z } from 'zod';

import { config } from '../config';

export const LogRecordSchema = z.object({
  timestamp: z.iso.datetime(),
  level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']),
  message: z.string().min(1).max(10_000),
  meta: z.record(z.string(), z.unknown()).optional().default({}),
});

export const LogBatchSchema = z.array(LogRecordSchema).min(1).max(config.logs.maxBatchSize);

export type ParsedLogRecord = z.infer<typeof LogRecordSchema>;
