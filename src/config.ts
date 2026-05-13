import { z } from 'zod';

import type { ChaosPolicyConfig } from './logs/chaosPolicy';

const booleanFromString = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .or(z.boolean());

const envSchema = z
  .object({
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
    LOG_PROCESSING_DELAY_JITTER_MS: z.coerce.number().int().min(0).default(0),
    LOG_PROCESSING_FAILURE_RATE_PCT: z.coerce.number().int().min(0).max(100).default(0),
    LOG_WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(100),
    LOG_WORKER_RETRY_BACKOFF_BASE_MS: z.coerce.number().int().min(0).default(50),
    LOG_WORKER_DRAIN_TIMEOUT_MS: z.coerce.number().int().min(0).default(5_000),

    OTEL_SERVICE_NAME: z.string().default('log-ingestion-service'),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),

    LOG_LEVEL: z.string().default('info'),

    LOG_CHAOS_ENABLED: booleanFromString.default(false),
    LOG_CHAOS_LATENCY_MEDIAN_MS: z.coerce.number().int().positive().default(20),
    LOG_CHAOS_LATENCY_P99_MS: z.coerce.number().int().positive().default(500),
    LOG_CHAOS_OUTLIER_RATE: z.coerce.number().min(0).max(1).default(0.005),
    LOG_CHAOS_OUTLIER_MIN_MS: z.coerce.number().int().min(0).default(2000),
    LOG_CHAOS_OUTLIER_MAX_MS: z.coerce.number().int().min(0).default(5000),
    LOG_CHAOS_TRANSIENT_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0.02),
    LOG_CHAOS_PERMANENT_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0.002),
    LOG_CHAOS_SEED: z.coerce.number().int().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.LOG_CHAOS_LATENCY_P99_MS < data.LOG_CHAOS_LATENCY_MEDIAN_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['LOG_CHAOS_LATENCY_P99_MS'],
        message: `LOG_CHAOS_LATENCY_P99_MS (${data.LOG_CHAOS_LATENCY_P99_MS}) must be >= LOG_CHAOS_LATENCY_MEDIAN_MS (${data.LOG_CHAOS_LATENCY_MEDIAN_MS})`,
      });
    }
    if (data.LOG_CHAOS_OUTLIER_MAX_MS < data.LOG_CHAOS_OUTLIER_MIN_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['LOG_CHAOS_OUTLIER_MAX_MS'],
        message: `LOG_CHAOS_OUTLIER_MAX_MS (${data.LOG_CHAOS_OUTLIER_MAX_MS}) must be >= LOG_CHAOS_OUTLIER_MIN_MS (${data.LOG_CHAOS_OUTLIER_MIN_MS})`,
      });
    }
    const failureRateSum =
      data.LOG_CHAOS_TRANSIENT_FAILURE_RATE + data.LOG_CHAOS_PERMANENT_FAILURE_RATE;
    if (failureRateSum > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['LOG_CHAOS_PERMANENT_FAILURE_RATE'],
        message: `LOG_CHAOS_TRANSIENT_FAILURE_RATE + LOG_CHAOS_PERMANENT_FAILURE_RATE (${failureRateSum.toFixed(3)}) must be <= 1`,
      });
    }
  });

export interface ApiKeyClient {
  id: string;
  name: string;
}

export interface Config {
  port: number;
  http: { jsonBodyLimit: string };
  auth: { apiKeys: Map<string, ApiKeyClient> };
  rateLimit: { maxRequests: number; windowMs: number };
  logs: { maxBatchSize: number };
  queue: { maxSize: number; readinessHighWaterMarkRatio: number };
  worker: {
    concurrency: number;
    maxRetries: number;
    processingDelayMs: number;
    processingDelayJitterMs: number;
    processingFailureRatePct: number;
    pollIntervalMs: number;
    retryBackoffBaseMs: number;
    drainTimeoutMs: number;
  };
  otel: { serviceName: string; exporterEndpoint: string | undefined };
  logging: { level: string };
  chaos: { enabled: boolean; policy: ChaosPolicyConfig; seed: number | undefined };
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

export function createConfig(env: NodeJS.ProcessEnv = process.env): Config {
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
      processingDelayJitterMs: parsed.LOG_PROCESSING_DELAY_JITTER_MS,
      processingFailureRatePct: parsed.LOG_PROCESSING_FAILURE_RATE_PCT,
      pollIntervalMs: parsed.LOG_WORKER_POLL_INTERVAL_MS,
      retryBackoffBaseMs: parsed.LOG_WORKER_RETRY_BACKOFF_BASE_MS,
      drainTimeoutMs: parsed.LOG_WORKER_DRAIN_TIMEOUT_MS,
    },
    otel: {
      serviceName: parsed.OTEL_SERVICE_NAME,
      exporterEndpoint: parsed.OTEL_EXPORTER_OTLP_ENDPOINT,
    },
    logging: { level: parsed.LOG_LEVEL },
    chaos: {
      enabled: parsed.LOG_CHAOS_ENABLED,
      policy: {
        latencyMedianMs: parsed.LOG_CHAOS_LATENCY_MEDIAN_MS,
        latencyP99Ms: parsed.LOG_CHAOS_LATENCY_P99_MS,
        outlierRate: parsed.LOG_CHAOS_OUTLIER_RATE,
        outlierMinMs: parsed.LOG_CHAOS_OUTLIER_MIN_MS,
        outlierMaxMs: parsed.LOG_CHAOS_OUTLIER_MAX_MS,
        transientFailureRate: parsed.LOG_CHAOS_TRANSIENT_FAILURE_RATE,
        permanentFailureRate: parsed.LOG_CHAOS_PERMANENT_FAILURE_RATE,
      },
      seed: parsed.LOG_CHAOS_SEED,
    },
  };
}

export const config: Config = createConfig();
