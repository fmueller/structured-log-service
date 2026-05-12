import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app';
import type { LogWorker } from '../../src/logs/logWorker';

describe('app error handlers', () => {
  const workers: LogWorker[] = [];

  afterEach(async () => {
    await Promise.all(workers.splice(0).map((worker) => worker.drain(1000)));
  });

  it('returns 400 invalid_json when the body is malformed JSON', async () => {
    const { app, worker } = createApp();
    workers.push(worker);

    const response = await request(app)
      .post('/logs/json')
      .set('Authorization', 'Bearer dev-api-key')
      .set('Content-Type', 'application/json')
      .send('{ not json');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_json' });
  });

  it('returns 413 payload_too_large when the body exceeds jsonBodyLimit', async () => {
    const { app, worker } = createApp();
    workers.push(worker);

    const oversizedMessage = 'a'.repeat(1_500_000);

    const response = await request(app)
      .post('/logs/json')
      .set('Authorization', 'Bearer dev-api-key')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ message: oversizedMessage }));

    expect(response.status).toBe(413);
    expect(response.body).toEqual({ error: 'payload_too_large' });
  });
});
