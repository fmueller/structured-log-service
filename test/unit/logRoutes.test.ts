import express, { type NextFunction, type Response } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedRequest } from '../../src/auth/authMiddleware';
import { LogQueue } from '../../src/logs/logQueue';
import { StdoutLogProcessor } from '../../src/logs/logProcessor';
import { createLogRoutes } from '../../src/logs/logRoutes';
import { LogWorker } from '../../src/logs/logWorker';
import type { LogWorkerConfig } from '../../src/logs/logWorkerConfig';

const baseWorkerConfig: LogWorkerConfig = {
  concurrency: 1,
  maxRetries: 0,
  pollIntervalMs: 1_000,
  retryBackoffBaseMs: 0,
};

const validRecord = {
  timestamp: '2024-01-01T00:00:00.000Z',
  level: 'info',
  message: 'hello',
};

type Harness = {
  app: express.Application;
  queue: LogQueue;
  worker: LogWorker;
};

function buildHarness({
  injectClient = true,
  queueSize = 100,
  retryAfterSeconds = 1,
}: {
  injectClient?: boolean;
  queueSize?: number;
  retryAfterSeconds?: number;
} = {}): Harness {
  const queue = new LogQueue(queueSize);
  const processor = new StdoutLogProcessor(0);
  const worker = new LogWorker(queue, processor, baseWorkerConfig);

  const app = express();
  app.use(express.json());
  app.use((req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (injectClient) {
      req.client = { id: 'client-1', name: 'Client 1' };
    } else {
      // Node's IncomingMessage exposes a deprecated `client` alias for `socket`,
      // so the defensive `!req.client` check in the handler only fires when we
      // explicitly clear it.
      (req as { client: undefined }).client = undefined;
    }
    next();
  });
  app.use(createLogRoutes(queue, worker, retryAfterSeconds));

  return { app, queue, worker };
}

describe('createLogRoutes POST /logs/json', () => {
  it('returns 401 unauthorized when req.client is missing', async () => {
    const { app } = buildHarness({ injectClient: false });

    const response = await request(app).post('/logs/json').send([validRecord]);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'unauthorized' });
  });

  it('returns 400 invalid_payload with details when body is not an array', async () => {
    const { app } = buildHarness();

    const response = await request(app).post('/logs/json').send({ not: 'an array' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_payload');
    expect(Array.isArray(response.body.details)).toBe(true);
    expect(response.body.details.length).toBeGreaterThan(0);
    for (const detail of response.body.details) {
      expect(detail).toHaveProperty('path');
      expect(typeof detail.message).toBe('string');
    }
  });

  it('returns 400 invalid_payload with details pointing to the failing field', async () => {
    const { app } = buildHarness();

    const response = await request(app)
      .post('/logs/json')
      .send([{ timestamp: validRecord.timestamp, level: 'info' }]);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_payload');
    const messagePath = response.body.details.find((d: { path: unknown[] }) =>
      d.path.includes('message'),
    );
    expect(messagePath).toBeDefined();
  });

  it('returns 202 accepted with acceptedCount and queueDepth on a valid batch', async () => {
    const { app } = buildHarness();

    const response = await request(app)
      .post('/logs/json')
      .send([validRecord, validRecord, validRecord]);

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ accepted: 3, queueDepth: 3 });
  });

  it('calls worker.notify() exactly once on a valid batch', async () => {
    const { app, worker } = buildHarness();
    const notify = vi.spyOn(worker, 'notify').mockImplementation(() => undefined);

    await request(app).post('/logs/json').send([validRecord]);

    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('does not call worker.notify() when the queue rejects the batch', async () => {
    const { app, queue, worker } = buildHarness({ queueSize: 2, retryAfterSeconds: 7 });
    // Pre-fill the queue so the next batch is rejected.
    queue.enqueueMany([
      {
        id: 'a',
        clientId: 'client-1',
        receivedAt: new Date(),
        record: { ...validRecord, meta: {} },
        parentContext: {} as never,
      },
      {
        id: 'b',
        clientId: 'client-1',
        receivedAt: new Date(),
        record: { ...validRecord, meta: {} },
        parentContext: {} as never,
      },
    ]);
    const notify = vi.spyOn(worker, 'notify').mockImplementation(() => undefined);

    const response = await request(app).post('/logs/json').send([validRecord]);

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'queue_full', queueDepth: 2, capacity: 2 });
    expect(response.headers['retry-after']).toBe('7');
    expect(notify).not.toHaveBeenCalled();
  });

  it('enqueues entries with clientId from req.client', async () => {
    const { app, queue } = buildHarness();

    await request(app).post('/logs/json').send([validRecord]);

    const entry = queue.dequeue();
    expect(entry).toBeDefined();
    expect(entry?.clientId).toBe('client-1');
  });
});
