import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app';
import type { LogWorker } from '../../src/logs/logWorker';
import { closeServer } from '../helpers/server';

describe('root route e2e', () => {
  const servers: Server[] = [];
  const workers: LogWorker[] = [];

  afterEach(async () => {
    try {
      await Promise.all(servers.splice(0).map((server) => closeServer(server)));
    } finally {
      await Promise.all(workers.splice(0).map((worker) => worker.drain(1000)));
    }
  });

  it('responds over a live HTTP server', async () => {
    const { app, worker } = createApp();
    workers.push(worker);
    const server = app.listen(0);
    servers.push(server);

    await new Promise<void>((resolve) => {
      server.once('listening', () => resolve());
    });

    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: 'structured-log-service', status: 'ok' });
  });
});
