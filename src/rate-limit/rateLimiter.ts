export type RateLimitDecision =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number };

export type RateLimiterConfig = { maxRequests: number; windowMs: number };

export interface RateLimiter {
  consume(clientId: string, now?: number): RateLimitDecision;
}
