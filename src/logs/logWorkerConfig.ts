export type LogWorkerConfig = {
  concurrency: number;
  maxRetries: number;
  pollIntervalMs: number;
  retryBackoffBaseMs: number;
};

export function validateWorkerConfig(config: LogWorkerConfig): LogWorkerConfig {
  if (!Number.isInteger(config.concurrency) || config.concurrency <= 0) {
    throw new Error('worker.concurrency must be a positive integer');
  }
  if (!Number.isInteger(config.maxRetries) || config.maxRetries < 0) {
    throw new Error('worker.maxRetries must be a non-negative integer');
  }
  if (!Number.isInteger(config.pollIntervalMs) || config.pollIntervalMs <= 0) {
    throw new Error('worker.pollIntervalMs must be a positive integer');
  }
  if (!Number.isInteger(config.retryBackoffBaseMs) || config.retryBackoffBaseMs < 0) {
    throw new Error('worker.retryBackoffBaseMs must be a non-negative integer');
  }
  return config;
}
