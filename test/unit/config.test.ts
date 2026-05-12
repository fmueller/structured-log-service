import { describe, expect, it } from 'vitest';

import { createConfig } from '../../src/config';

describe('createConfig', () => {
  it('parses defaults when env is empty object', () => {
    const result = createConfig({});

    expect(result.port).toBe(3003);
    expect(result.http).toEqual({ jsonBodyLimit: '1mb' });
    expect(result.auth.apiKeys.size).toBe(1);
    expect(result.auth.apiKeys.get('dev-api-key')).toEqual({
      id: 'client-1',
      name: 'Client 1',
    });
    expect(result.rateLimit).toEqual({
      maxRequests: 10,
      windowMs: 1_000,
    });
    expect(result.logs).toEqual({ maxBatchSize: 1_000 });
    expect(result.queue).toEqual({
      maxSize: 1_000,
      readinessHighWaterMarkRatio: 0.9,
    });
    expect(result.worker).toEqual({
      concurrency: 5,
      maxRetries: 3,
      processingDelayMs: 100,
      pollIntervalMs: 100,
      retryBackoffBaseMs: 50,
      drainTimeoutMs: 5_000,
    });
    expect(result.otel).toEqual({
      serviceName: 'log-ingestion-service',
      exporterEndpoint: undefined,
    });
    expect(result.logging).toEqual({ level: 'info' });
  });

  it('coerces numeric env vars', () => {
    const result = createConfig({ RATE_LIMIT_MAX_REQUESTS: '42' });

    expect(result.rateLimit.maxRequests).toBe(42);
  });

  it('rejects non-positive PORT', () => {
    expect(() => createConfig({ PORT: '0' })).toThrow();
  });

  it('parses multiple API keys', () => {
    const result = createConfig({ API_KEYS: 'k1,k2' });

    expect(result.auth.apiKeys.size).toBe(2);
    expect(result.auth.apiKeys.get('k1')).toEqual({ id: 'client-1', name: 'Client 1' });
    expect(result.auth.apiKeys.get('k2')).toEqual({ id: 'client-2', name: 'Client 2' });
  });

  it('trims and filters blank API keys', () => {
    const result = createConfig({ API_KEYS: ' k1 , , k2 ' });

    expect(result.auth.apiKeys.size).toBe(2);
    expect(result.auth.apiKeys.get('k1')).toEqual({ id: 'client-1', name: 'Client 1' });
    expect(result.auth.apiKeys.get('k2')).toEqual({ id: 'client-2', name: 'Client 2' });
  });

  it('accepts ratio 0 and 1 but rejects 1.1', () => {
    expect(
      createConfig({ LOG_READINESS_HIGH_WATER_MARK_RATIO: '0' }).queue.readinessHighWaterMarkRatio,
    ).toBe(0);
    expect(
      createConfig({ LOG_READINESS_HIGH_WATER_MARK_RATIO: '1' }).queue.readinessHighWaterMarkRatio,
    ).toBe(1);
    expect(() => createConfig({ LOG_READINESS_HIGH_WATER_MARK_RATIO: '1.1' })).toThrow();
  });

  it('defaults LOG_LEVEL to "info" and accepts arbitrary string', () => {
    expect(createConfig({}).logging.level).toBe('info');
    expect(createConfig({ LOG_LEVEL: 'trace' }).logging.level).toBe('trace');
    expect(createConfig({ LOG_LEVEL: 'anything-goes' }).logging.level).toBe('anything-goes');
  });

  it('leaves OTEL_EXPORTER_OTLP_ENDPOINT undefined when unset', () => {
    const result = createConfig({});

    expect(result.otel.exporterEndpoint).toBeUndefined();
  });

  it('accepts a valid OTEL_EXPORTER_OTLP_ENDPOINT URL', () => {
    const result = createConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otelcol:4318' });

    expect(result.otel.exporterEndpoint).toBe('http://otelcol:4318');
  });

  it('rejects a non-URL OTEL_EXPORTER_OTLP_ENDPOINT', () => {
    expect(() => createConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: 'not-a-url' })).toThrow();
  });

  it('rejects non-http(s) schemes for OTEL_EXPORTER_OTLP_ENDPOINT', () => {
    expect(() => createConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: 'file:///etc/passwd' })).toThrow();
    expect(() => createConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: 'javascript:alert(1)' })).toThrow();
    expect(() => createConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: 'ftp://example.com' })).toThrow();
  });
});
