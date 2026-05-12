import express, {
  type Application,
  type ErrorRequestHandler,
  type Request,
  type Response,
} from 'express';

import { InMemoryApiKeyStore } from './auth/apiKeyStore';
import { createAuthMiddleware } from './auth/authMiddleware';
import { config } from './config';
import { createHealthRoutes } from './http/healthRoutes';
import { LogQueue } from './logs/logQueue';
import { StdoutLogProcessor } from './logs/logProcessor';
import { createLogRoutes } from './logs/logRoutes';
import { LogWorker } from './logs/logWorker';
import { FixedWindowRateLimiter } from './rate-limit/fixedWindowRateLimiter';
import { createRateLimitMiddleware } from './rate-limit/rateLimitMiddleware';

export interface CreatedApp {
  app: Application;
  worker: LogWorker;
}

interface BodyParserError {
  type?: string;
}

function isBodyParserError(err: unknown): err is BodyParserError {
  return typeof err === 'object' && err !== null && 'type' in err;
}

const bodyParserErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (isBodyParserError(err)) {
    if (err.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'invalid_json' });
      return;
    }
    if (err.type === 'entity.too.large') {
      res.status(413).json({ error: 'payload_too_large' });
      return;
    }
  }
  next(err);
};

export function createApp(): CreatedApp {
  const app = express();

  app.use(express.json({ limit: config.http.jsonBodyLimit }));
  app.use(bodyParserErrorHandler);

  const apiKeyStore = new InMemoryApiKeyStore(config.auth.apiKeys);
  const rateLimiter = new FixedWindowRateLimiter(config.rateLimit);
  const queue = new LogQueue(config.queue.maxSize);
  const processor = new StdoutLogProcessor(config.worker.processingDelayMs);
  const worker = new LogWorker(queue, processor, config.worker);
  worker.start();

  app.get('/', (_req: Request, res: Response) => {
    res.json({ name: 'structured-log-service', status: 'ok' });
  });
  app.use(createHealthRoutes(queue, worker, config.queue.readinessHighWaterMarkRatio));

  app.use(createAuthMiddleware(apiKeyStore));
  app.use(createRateLimitMiddleware(rateLimiter));

  app.use(createLogRoutes(queue, worker));

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'not_found' });
  });

  return { app, worker };
}
