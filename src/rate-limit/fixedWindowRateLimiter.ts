import type { RateLimiter, RateLimiterConfig, RateLimitDecision } from './rateLimiter';

export class FixedWindowRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { windowStartedAt: number; count: number }>();

  constructor(private readonly config: RateLimiterConfig) {}

  consume(clientId: string, now: number = Date.now()): RateLimitDecision {
    const existing = this.windows.get(clientId);
    if (!existing || now - existing.windowStartedAt >= this.config.windowMs) {
      this.windows.set(clientId, { windowStartedAt: now, count: 1 });
      return { allowed: true, remaining: this.config.maxRequests - 1 };
    }
    if (existing.count >= this.config.maxRequests) {
      const retryAfterMs = this.config.windowMs - (now - existing.windowStartedAt);
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      };
    }
    existing.count += 1;
    return { allowed: true, remaining: this.config.maxRequests - existing.count };
  }
}
