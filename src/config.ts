import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3003),

  JSON_BODY_LIMIT: z.string().default('1mb'),
  API_KEYS: z.string().default('dev-api-key'),

  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(1_000),

  LOG_MAX_BATCH_SIZE: z.coerce.number().int().positive().default(1_000),
  LOG_QUEUE_MAX_SIZE: z.coerce.number().int().positive().default(1_000),
  LOG_READINESS_HIGH_WATER_MARK_RATIO: z.coerce.number().min(0).max(1).default(0.9),

  LOG_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  LOG_WORKER_MAX_RETRIES: z.coerce.number().int().min(0).default(3),
  LOG_PROCESSING_DELAY_MS: z.coerce.number().int().min(0).default(100),
  LOG_WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(100),
  LOG_WORKER_RETRY_BACKOFF_BASE_MS: z.coerce.number().int().min(0).default(50),
  LOG_WORKER_DRAIN_TIMEOUT_MS: z.coerce.number().int().min(0).default(5_000),

  OTEL_SERVICE_NAME: z.string().default('log-ingestion-service'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),

  LOG_LEVEL: z.string().default('info'),
});

export interface ApiKeyClient {
  id: string;
  name: string;
}

function parseApiKeys(raw: string): Map<string, ApiKeyClient> {
  return new Map(
    raw
      .split(',')
      .map((key) => key.trim())
      .filter(Boolean)
      .map((key, index) => [key, { id: `client-${index + 1}`, name: `Client ${index + 1}` }]),
  );
}

export function createConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.parse(env);

  return {
    port: parsed.PORT,
    http: { jsonBodyLimit: parsed.JSON_BODY_LIMIT },
    auth: { apiKeys: parseApiKeys(parsed.API_KEYS) },
    rateLimit: {
      maxRequests: parsed.RATE_LIMIT_MAX_REQUESTS,
      windowMs: parsed.RATE_LIMIT_WINDOW_MS,
    },
    logs: { maxBatchSize: parsed.LOG_MAX_BATCH_SIZE },
    queue: {
      maxSize: parsed.LOG_QUEUE_MAX_SIZE,
      readinessHighWaterMarkRatio: parsed.LOG_READINESS_HIGH_WATER_MARK_RATIO,
    },
    worker: {
      concurrency: parsed.LOG_WORKER_CONCURRENCY,
      maxRetries: parsed.LOG_WORKER_MAX_RETRIES,
      processingDelayMs: parsed.LOG_PROCESSING_DELAY_MS,
      pollIntervalMs: parsed.LOG_WORKER_POLL_INTERVAL_MS,
      retryBackoffBaseMs: parsed.LOG_WORKER_RETRY_BACKOFF_BASE_MS,
      drainTimeoutMs: parsed.LOG_WORKER_DRAIN_TIMEOUT_MS,
    },
    otel: {
      serviceName: parsed.OTEL_SERVICE_NAME,
      exporterEndpoint: parsed.OTEL_EXPORTER_OTLP_ENDPOINT,
    },
    logging: { level: parsed.LOG_LEVEL },
  };
}

export const config = createConfig();
