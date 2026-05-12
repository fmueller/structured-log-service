import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app';
import type { LogWorker } from '../../src/logs/logWorker';
import { makeConfig } from '../helpers/config';

const validRecord = {
  timestamp: '2024-01-01T00:00:00.000Z',
  level: 'info',
  message: 'hello',
};

describe('health probes', () => {
  const workers: LogWorker[] = [];

  afterEach(async () => {
    await Promise.all(workers.splice(0).map((worker) => worker.drain(1000)));
  });

  it('GET /livez returns 200 alive without auth', async () => {
    const { app, worker } = createApp();
    workers.push(worker);

    const response = await request(app).get('/livez');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'alive' });
  });

  it('GET /readyz returns 200 ready when worker running and queue is below HWM', async () => {
    const { app, worker } = createApp(
      makeConfig({ LOG_QUEUE_MAX_SIZE: '200', LOG_READINESS_HIGH_WATER_MARK_RATIO: '0.5' }),
    );
    workers.push(worker);

    const response = await request(app).get('/readyz');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ready');
    expect(response.body.queueDepth).toBe(0);
    expect(response.body.highWaterMark).toBe(100);
    expect(typeof response.body.workerActiveCount).toBe('number');
  });

  it('GET /readyz returns 503 queue_above_high_water_mark when depth >= HWM', async () => {
    const { app, worker } = createApp(
      makeConfig({ LOG_QUEUE_MAX_SIZE: '200', LOG_READINESS_HIGH_WATER_MARK_RATIO: '0.25' }),
    );
    workers.push(worker);

    const batch = Array.from({ length: 100 }, () => validRecord);
    const postResponse = await request(app)
      .post('/logs/json')
      .set('Authorization', 'Bearer dev-api-key')
      .send(batch);

    expect(postResponse.status).toBe(202);

    const response = await request(app).get('/readyz');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('not_ready');
    expect(response.body.reason).toBe('queue_above_high_water_mark');
    expect(typeof response.body.queueDepth).toBe('number');
    expect(response.body.queueDepth).toBeGreaterThanOrEqual(50);
    expect(response.body.highWaterMark).toBe(50);
    expect(typeof response.body.workerActiveCount).toBe('number');
  });

  it('GET /readyz returns 503 worker_stopped after worker stops', async () => {
    const { app, worker } = createApp();
    workers.push(worker);

    await worker.drain(0);

    const response = await request(app).get('/readyz');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('not_ready');
    expect(response.body.reason).toBe('worker_stopped');
  });
});
