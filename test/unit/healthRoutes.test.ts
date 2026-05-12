import { describe, expect, it } from 'vitest';

import { decideReadiness } from '../../src/http/healthRoutes';

describe('decideReadiness', () => {
  it('returns ready when queue empty and worker running', () => {
    const decision = decideReadiness({
      isWorkerRunning: true,
      queueDepth: 0,
      highWaterMark: 9,
      workerActiveCount: 0,
    });

    expect(decision).toEqual({
      status: 200,
      body: {
        status: 'ready',
        queueDepth: 0,
        highWaterMark: 9,
        workerActiveCount: 0,
      },
    });
  });

  it('returns not_ready when queue depth equals high water mark', () => {
    const decision = decideReadiness({
      isWorkerRunning: true,
      queueDepth: 9,
      highWaterMark: 9,
      workerActiveCount: 1,
    });

    expect(decision).toEqual({
      status: 503,
      body: {
        status: 'not_ready',
        reason: 'queue_above_high_water_mark',
        queueDepth: 9,
        highWaterMark: 9,
        workerActiveCount: 1,
      },
    });
  });

  it('returns not_ready when queue depth above high water mark', () => {
    const decision = decideReadiness({
      isWorkerRunning: true,
      queueDepth: 10,
      highWaterMark: 9,
      workerActiveCount: 2,
    });

    expect(decision).toEqual({
      status: 503,
      body: {
        status: 'not_ready',
        reason: 'queue_above_high_water_mark',
        queueDepth: 10,
        highWaterMark: 9,
        workerActiveCount: 2,
      },
    });
  });

  it('returns not_ready when worker stopped', () => {
    const decision = decideReadiness({
      isWorkerRunning: false,
      queueDepth: 0,
      highWaterMark: 9,
      workerActiveCount: 0,
    });

    expect(decision).toEqual({
      status: 503,
      body: {
        status: 'not_ready',
        reason: 'worker_stopped',
        queueDepth: 0,
        workerActiveCount: 0,
      },
    });
  });
});
