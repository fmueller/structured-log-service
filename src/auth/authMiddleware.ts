import type { NextFunction, Request, Response } from 'express';
import type { ApiClient, ApiKeyStore } from './apiKeyStore';

export type AuthenticatedRequest = Request & { client?: ApiClient };

type AuthMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => Promise<void>;

export function createAuthMiddleware(store: ApiKeyStore): AuthMiddleware {
  return async function authMiddleware(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const authorization = req.header('authorization');
      if (!authorization) {
        res.status(401).json({ error: 'missing_authorization_header' });
        return;
      }
      const parts = authorization.split(/\s+/);
      const [scheme, token] = parts;
      if (scheme?.toLowerCase() !== 'bearer' || !token || parts.length !== 2) {
        res.status(401).json({ error: 'invalid_authorization_header' });
        return;
      }
      const client = await store.findByToken(token);
      if (!client) {
        res.status(401).json({ error: 'invalid_api_key' });
        return;
      }
      req.client = client;
      next();
    } catch (err) {
      next(err);
    }
  };
}
