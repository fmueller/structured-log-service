import { describe, expect, it } from 'vitest';
import { FixedWindowRateLimiter } from '../../src/rate-limit/fixedWindowRateLimiter';

describe('FixedWindowRateLimiter', () => {
  it('allows requests below limit', () => {
    const limiter = new FixedWindowRateLimiter({ maxRequests: 3, windowMs: 1000 });

    const r1 = limiter.consume('a', 0);
    const r2 = limiter.consume('a', 1);
    const r3 = limiter.consume('a', 2);

    expect(r1).toEqual({ allowed: true, remaining: 2 });
    expect(r2).toEqual({ allowed: true, remaining: 1 });
    expect(r3).toEqual({ allowed: true, remaining: 0 });
  });

  it('denies request above limit', () => {
    const limiter = new FixedWindowRateLimiter({ maxRequests: 2, windowMs: 1000 });

    limiter.consume('a', 0);
    limiter.consume('a', 1);
    const denied = limiter.consume('a', 2);

    expect(denied.allowed).toBe(false);
    if (!denied.allowed) {
      expect(denied.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    }
  });

  it('per-client isolation', () => {
    const limiter = new FixedWindowRateLimiter({ maxRequests: 2, windowMs: 1000 });

    limiter.consume('a', 0);
    limiter.consume('a', 1);

    const result = limiter.consume('b', 1);

    expect(result).toEqual({ allowed: true, remaining: 1 });
  });

  it('window rolls over after windowMs', () => {
    const limiter = new FixedWindowRateLimiter({ maxRequests: 2, windowMs: 1000 });

    limiter.consume('a', 0);
    limiter.consume('a', 1);

    const result = limiter.consume('a', 1000);

    expect(result).toEqual({ allowed: true, remaining: 1 });
  });

  it('retryAfterSeconds is floored to 1', () => {
    const limiter = new FixedWindowRateLimiter({ maxRequests: 1, windowMs: 500 });

    const first = limiter.consume('a', 0);
    const denied = limiter.consume('a', 100);

    expect(first).toEqual({ allowed: true, remaining: 0 });
    expect(denied).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });
});
