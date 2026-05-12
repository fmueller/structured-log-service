import { randomUUID } from 'node:crypto';

import { context } from '@opentelemetry/api';
import { Router, type Response } from 'express';

import type { AuthenticatedRequest } from '../auth/authMiddleware';
import { LogQueue } from './logQueue';
import { LogBatchSchema } from './logRecordSchema';
import { LogWorker } from './logWorker';
import type { QueuedLogEntry } from './types';

export function createLogRoutes(
  queue: LogQueue,
  worker: LogWorker,
  queueFullRetryAfterSeconds: number,
): Router {
  const router = Router();

  router.post('/logs/json', (req: AuthenticatedRequest, res: Response) => {
    // Defensive 401 + type narrowing: auth middleware always sets req.client
    // before reaching this handler, but the type is optional.
    if (!req.client) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    const parsed = LogBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'invalid_payload',
        details: parsed.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      });
      return;
    }

    const parentContext = context.active();
    const receivedAt = new Date();
    const clientId = req.client.id;
    const entries: QueuedLogEntry[] = parsed.data.map((record) => ({
      id: randomUUID(),
      clientId,
      receivedAt,
      record,
      parentContext,
    }));

    const result = queue.enqueueMany(entries);
    if (!result.accepted) {
      res.setHeader('Retry-After', String(queueFullRetryAfterSeconds));
      res.status(503).json({
        error: 'queue_full',
        queueDepth: result.queueDepth,
        capacity: result.capacity,
      });
      return;
    }

    worker.notify();
    res.status(202).json({
      accepted: result.acceptedCount,
      queueDepth: result.queueDepth,
    });
  });

  return router;
}
