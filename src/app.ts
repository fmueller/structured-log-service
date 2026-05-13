import express, {
  type Application,
  type ErrorRequestHandler,
  type Request,
  type Response,
} from 'express';

import { InMemoryApiKeyStore } from './auth/apiKeyStore';
import { createAuthMiddleware } from './auth/authMiddleware';
import { config, type Config } from './config';
import { createHealthRoutes } from './http/healthRoutes';
import { serviceInfo } from './serviceInfo';
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

export function createApp(overrideConfig?: Config): CreatedApp {
  const cfg = overrideConfig ?? config;
  const app = express();

  app.use(express.json({ limit: cfg.http.jsonBodyLimit }));
  app.use(bodyParserErrorHandler);

  const apiKeyStore = new InMemoryApiKeyStore(cfg.auth.apiKeys);
  const rateLimiter = new FixedWindowRateLimiter(cfg.rateLimit);
  const queue = new LogQueue(cfg.queue.maxSize);
  const processor = new StdoutLogProcessor({
    baseMs: cfg.worker.processingDelayMs,
    jitterMs: cfg.worker.processingDelayJitterMs,
    failureRatePercent: cfg.worker.processingFailureRatePct,
  });
  const worker = new LogWorker(queue, processor, cfg.worker);
  worker.start();

  // Worst case for one in-flight entry to finish — that frees a queue slot
  // because workers dequeue before processing. Don't multiply by concurrency.
  const queueFullRetryAfterSeconds = Math.max(
    1,
    Math.ceil((cfg.worker.processingDelayMs + cfg.worker.processingDelayJitterMs) / 1000),
  );

  app.get('/', (_req: Request, res: Response) => {
    res.json({ name: serviceInfo.name, version: serviceInfo.version });
  });
  app.use(createHealthRoutes(queue, worker, cfg.queue.readinessHighWaterMarkRatio));

  app.use(createAuthMiddleware(apiKeyStore));
  app.use(createRateLimitMiddleware(rateLimiter));

  app.use(createLogRoutes(queue, worker, queueFullRetryAfterSeconds));

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'not_found' });
  });

  return { app, worker };
}
