import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app';

describe('GET /', () => {
  it('returns scaffold status payload', async () => {
    const response = await request(createApp()).get('/');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ name: 'structured-log-service', status: 'ok' });
  });

  it('does not match arbitrary non-root paths', async () => {
    const response = await request(createApp()).get('/not-root');

    expect(response.status).toBe(404);
  });
});
