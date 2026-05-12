import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app';
import type { LogWorker } from '../../src/logs/logWorker';

const validRecord = {
  timestamp: '2024-01-01T00:00:00.000Z',
  level: 'info',
  message: 'hello',
};

describe('POST /logs/json', () => {
  const workers: LogWorker[] = [];

  afterEach(async () => {
    await Promise.all(workers.splice(0).map((worker) => worker.drain(1000)));
  });

  it('returns 401 when the Authorization header is missing', async () => {
    const { app, worker } = createApp();
    workers.push(worker);

    const response = await request(app).post('/logs/json').send([validRecord]);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'missing_authorization_header' });
  });

  it('returns 202 accepted on a valid batch with a valid Bearer token', async () => {
    const { app, worker } = createApp();
    workers.push(worker);

    const response = await request(app)
      .post('/logs/json')
      .set('Authorization', 'Bearer dev-api-key')
      .send([validRecord]);

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({ accepted: 1 });
    expect(typeof response.body.queueDepth).toBe('number');
  });
});
