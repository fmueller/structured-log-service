import { Router, type Request, type Response } from 'express';

import type { LogQueue } from '../logs/logQueue';
import type { LogWorker } from '../logs/logWorker';

export interface ReadinessInput {
  isWorkerRunning: boolean;
  queueDepth: number;
  highWaterMark: number;
  workerActiveCount: number;
}

export interface ReadinessDecision {
  status: number;
  body: Record<string, unknown>;
}

export function decideReadiness(input: ReadinessInput): ReadinessDecision {
  const { isWorkerRunning, queueDepth, highWaterMark, workerActiveCount } = input;

  if (!isWorkerRunning) {
    return {
      status: 503,
      body: {
        status: 'not_ready',
        reason: 'worker_stopped',
        queueDepth,
        workerActiveCount,
      },
    };
  }

  if (queueDepth >= highWaterMark) {
    return {
      status: 503,
      body: {
        status: 'not_ready',
        reason: 'queue_above_high_water_mark',
        queueDepth,
        highWaterMark,
        workerActiveCount,
      },
    };
  }

  return {
    status: 200,
    body: {
      status: 'ready',
      queueDepth,
      highWaterMark,
      workerActiveCount,
    },
  };
}

export function createHealthRoutes(queue: LogQueue, worker: LogWorker, ratio: number): Router {
  const highWaterMark = Math.floor(queue.capacity() * ratio);
  if (highWaterMark < 1) {
    throw new Error(
      `readiness highWaterMark resolved to ${String(highWaterMark)}; check queue maxSize (${String(queue.capacity())}) and ratio (${String(ratio)})`,
    );
  }
  const router = Router();

  router.get('/livez', (_req: Request, res: Response) => {
    res.json({ status: 'alive' });
  });

  router.get('/readyz', (_req: Request, res: Response) => {
    const decision = decideReadiness({
      isWorkerRunning: worker.isRunning(),
      queueDepth: queue.depth(),
      highWaterMark,
      workerActiveCount: worker.getActiveCount(),
    });
    res.status(decision.status).json(decision.body);
  });

  return router;
}
