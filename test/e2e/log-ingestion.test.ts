import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app';
import type { LogWorker } from '../../src/logs/logWorker';
import { closeServer } from '../helpers/server';
import { waitUntil } from '../helpers/waitUntil';

describe('log ingestion e2e', () => {
  const servers: Server[] = [];
  const workers: LogWorker[] = [];

  afterEach(async () => {
    try {
      await Promise.all(servers.splice(0).map((server) => closeServer(server)));
    } finally {
      await Promise.all(workers.splice(0).map((worker) => worker.drain(1000)));
    }
  });

  it('accepts a valid batch over a live HTTP server and drains it', async () => {
    const { app, worker } = createApp();
    workers.push(worker);
    const server = app.listen(0);
    servers.push(server);

    await new Promise<void>((resolve) => {
      server.once('listening', () => resolve());
    });

    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/logs/json`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer dev-api-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        {
          timestamp: '2024-11-01T12:00:00.000Z',
          level: 'info',
          message: 'hello',
          meta: { service: 'test' },
        },
      ]),
    });

    expect(response.status).toBe(202);
    const body = (await response.json()) as { accepted: number; queueDepth: number };
    expect(body.accepted).toBe(1);
    expect(typeof body.queueDepth).toBe('number');

    await waitUntil(() => worker.getActiveCount() === 0, 2_000);
  });
});
