import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../auth/authMiddleware';
import type { RateLimiter } from './rateLimiter';

type RateLimitMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;

export function createRateLimitMiddleware(rateLimiter: RateLimiter): RateLimitMiddleware {
  return function rateLimitMiddleware(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): void {
    if (!req.client) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const decision = rateLimiter.consume(req.client.id);
    if (!decision.allowed) {
      res.setHeader('Retry-After', String(decision.retryAfterSeconds));
      res.status(429).json({ error: 'rate_limit_exceeded' });
      return;
    }
    res.setHeader('X-RateLimit-Remaining', String(decision.remaining));
    next();
  };
}
