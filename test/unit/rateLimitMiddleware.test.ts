import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedRequest } from '../../src/auth/authMiddleware';
import type { RateLimiter, RateLimitDecision } from '../../src/rate-limit/rateLimiter';
import { createRateLimitMiddleware } from '../../src/rate-limit/rateLimitMiddleware';
import type { Response, NextFunction } from 'express';

describe('createRateLimitMiddleware', () => {
  function makeReq(withClient: boolean): AuthenticatedRequest {
    const base = {} as AuthenticatedRequest;
    if (withClient) {
      base.client = { id: 'client-1', name: 'Client 1' };
    }
    return base;
  }

  function makeRes() {
    const res = {
      statusCode: 0,
      body: undefined as unknown,
      headers: {} as Record<string, string>,
      status(code: number) {
        res.statusCode = code;
        return res;
      },
      json(body: unknown) {
        res.body = body;
        return res;
      },
      setHeader(name: string, value: string) {
        res.headers[name] = value;
        return res;
      },
    };
    return res;
  }

  function makeAllowedLimiter(remaining: number): RateLimiter {
    return {
      consume: vi.fn((): RateLimitDecision => ({ allowed: true, remaining })),
    };
  }

  function makeDeniedLimiter(retryAfterSeconds: number): RateLimiter {
    return {
      consume: vi.fn((): RateLimitDecision => ({ allowed: false, retryAfterSeconds })),
    };
  }

  function makeThrowingLimiter(): RateLimiter {
    return {
      consume: vi.fn(() => {
        throw new Error('should not be called');
      }),
    };
  }

  it('missing req.client → 401 { error: "unauthorized" } and limiter never called', () => {
    const limiter = makeThrowingLimiter();
    const middleware = createRateLimitMiddleware(limiter);
    const req = makeReq(false);
    const res = makeRes();
    const next = vi.fn();

    middleware(req, res as unknown as Response, next as NextFunction);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
    expect(limiter.consume).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('limiter denies → 429 + Retry-After header + body { error: "rate_limit_exceeded" }', () => {
    const limiter = makeDeniedLimiter(7);
    const middleware = createRateLimitMiddleware(limiter);
    const req = makeReq(true);
    const res = makeRes();
    const next = vi.fn();

    middleware(req, res as unknown as Response, next as NextFunction);

    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: 'rate_limit_exceeded' });
    expect(res.headers['Retry-After']).toBe('7');
    expect(next).not.toHaveBeenCalled();
  });

  it('limiter allows → next() called + X-RateLimit-Remaining header set', () => {
    const limiter = makeAllowedLimiter(4);
    const middleware = createRateLimitMiddleware(limiter);
    const req = makeReq(true);
    const res = makeRes();
    const next = vi.fn();

    middleware(req, res as unknown as Response, next as NextFunction);

    expect(next).toHaveBeenCalledOnce();
    expect(res.headers['X-RateLimit-Remaining']).toBe('4');
    expect(res.statusCode).toBe(0);
  });
});
