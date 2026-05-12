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

  it('returns 401 invalid_authorization_header when scheme is not Bearer', async () => {
    const { app, worker } = createApp();
    workers.push(worker);

    const response = await request(app)
      .post('/logs/json')
      .set('Authorization', 'Token abc')
      .send([validRecord]);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'invalid_authorization_header' });
  });

  it('returns 401 invalid_api_key when token is unknown', async () => {
    const { app, worker } = createApp();
    workers.push(worker);

    const response = await request(app)
      .post('/logs/json')
      .set('Authorization', 'Bearer wrong-key')
      .send([validRecord]);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'invalid_api_key' });
  });

  it('returns 429 rate_limit_exceeded with Retry-After once the window cap is reached', async () => {
    const { app, worker } = createApp(
      makeConfig({ RATE_LIMIT_MAX_REQUESTS: '2', RATE_LIMIT_WINDOW_MS: '60000' }),
    );
    workers.push(worker);

    const makeRequest = () =>
      request(app)
        .post('/logs/json')
        .set('Authorization', 'Bearer dev-api-key')
        .send([validRecord]);

    await makeRequest();
    await makeRequest();
    const response = await makeRequest();

    expect(response.status).toBe(429);
    expect(response.body).toEqual({ error: 'rate_limit_exceeded' });
    const retryAfter = Number(response.headers['retry-after']);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
  });

  it('returns 400 invalid_payload with Zod details when the record is malformed', async () => {
    const { app, worker } = createApp();
    workers.push(worker);

    const response = await request(app)
      .post('/logs/json')
      .set('Authorization', 'Bearer dev-api-key')
      .send([{ timestamp: 'not-an-iso', level: 'info', message: 'x' }]);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_payload');
    expect(response.body.details.length).toBeGreaterThan(0);
    expect(response.body.details[0]).toMatchObject({
      path: expect.any(Array),
      message: expect.any(String),
    });
  });

  it('returns 503 queue_full when the batch exceeds remaining capacity', async () => {
    const { app, worker } = createApp(
      makeConfig({ LOG_QUEUE_MAX_SIZE: '1', LOG_READINESS_HIGH_WATER_MARK_RATIO: '1' }),
    );
    workers.push(worker);

    const response = await request(app)
      .post('/logs/json')
      .set('Authorization', 'Bearer dev-api-key')
      .send([validRecord, validRecord]);

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('queue_full');
    expect(response.body.capacity).toBe(1);
    expect(response.body.queueDepth).toBe(0);
  });
});
