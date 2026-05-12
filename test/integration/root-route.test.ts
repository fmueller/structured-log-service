import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app';
import type { LogWorker } from '../../src/logs/logWorker';

describe('GET /', () => {
  const workers: LogWorker[] = [];

  afterEach(async () => {
    await Promise.all(workers.splice(0).map((worker) => worker.drain(1000)));
  });

  it('returns scaffold status payload', async () => {
    const { app, worker } = createApp();
    workers.push(worker);

    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ name: 'structured-log-service', status: 'ok' });
  });

  it('does not match arbitrary non-root paths', async () => {
    const { app, worker } = createApp();
    workers.push(worker);

    const response = await request(app).get('/not-root').set('Authorization', 'Bearer dev-api-key');

    expect(response.status).toBe(404);
  });
});
