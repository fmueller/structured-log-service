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
      processingDelayJitterMs: 0,
      processingFailureRatePct: 0,
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

  it('parses LOG_PROCESSING_DELAY_JITTER_MS from env', () => {
    const result = createConfig({ LOG_PROCESSING_DELAY_JITTER_MS: '250' });

    expect(result.worker.processingDelayJitterMs).toBe(250);
  });

  it('rejects negative LOG_PROCESSING_DELAY_JITTER_MS', () => {
    expect(() => createConfig({ LOG_PROCESSING_DELAY_JITTER_MS: '-1' })).toThrow();
  });

  it('parses LOG_PROCESSING_FAILURE_RATE_PCT from env', () => {
    const result = createConfig({ LOG_PROCESSING_FAILURE_RATE_PCT: '25' });

    expect(result.worker.processingFailureRatePct).toBe(25);
  });

  it('rejects negative LOG_PROCESSING_FAILURE_RATE_PCT', () => {
    expect(() => createConfig({ LOG_PROCESSING_FAILURE_RATE_PCT: '-1' })).toThrow();
  });

  it('rejects LOG_PROCESSING_FAILURE_RATE_PCT above 100', () => {
    expect(() => createConfig({ LOG_PROCESSING_FAILURE_RATE_PCT: '101' })).toThrow();
  });

  it('rejects fractional LOG_PROCESSING_FAILURE_RATE_PCT', () => {
    expect(() => createConfig({ LOG_PROCESSING_FAILURE_RATE_PCT: '5.5' })).toThrow();
  });

  describe('chaos', () => {
    it('defaults to disabled with sensible policy values', () => {
      const result = createConfig({});

      expect(result.chaos.enabled).toBe(false);
      expect(result.chaos.seed).toBeUndefined();
      expect(result.chaos.policy).toEqual({
        latencyMedianMs: 20,
        latencyP99Ms: 500,
        outlierRate: 0.005,
        outlierMinMs: 2000,
        outlierMaxMs: 5000,
        transientFailureRate: 0.02,
        permanentFailureRate: 0.002,
      });
    });

    it('parses LOG_CHAOS_ENABLED="true" as boolean true', () => {
      expect(createConfig({ LOG_CHAOS_ENABLED: 'true' }).chaos.enabled).toBe(true);
    });

    it('parses LOG_CHAOS_ENABLED="false" as boolean false', () => {
      expect(createConfig({ LOG_CHAOS_ENABLED: 'false' }).chaos.enabled).toBe(false);
    });

    it('rejects LOG_CHAOS_ENABLED with non-boolean strings', () => {
      expect(() => createConfig({ LOG_CHAOS_ENABLED: 'yes' })).toThrow();
      expect(() => createConfig({ LOG_CHAOS_ENABLED: '1' })).toThrow();
    });

    it('parses LOG_CHAOS_SEED as an integer when present', () => {
      expect(createConfig({ LOG_CHAOS_SEED: '42' }).chaos.seed).toBe(42);
    });

    it('rejects LOG_CHAOS_LATENCY_P99_MS smaller than median', () => {
      expect(() =>
        createConfig({ LOG_CHAOS_LATENCY_MEDIAN_MS: '500', LOG_CHAOS_LATENCY_P99_MS: '100' }),
      ).toThrow(/LOG_CHAOS_LATENCY_P99_MS \(100\) must be >= LOG_CHAOS_LATENCY_MEDIAN_MS \(500\)/);
    });

    it('accepts LOG_CHAOS_LATENCY_P99_MS equal to median', () => {
      const result = createConfig({
        LOG_CHAOS_LATENCY_MEDIAN_MS: '300',
        LOG_CHAOS_LATENCY_P99_MS: '300',
      });

      expect(result.chaos.policy.latencyMedianMs).toBe(300);
      expect(result.chaos.policy.latencyP99Ms).toBe(300);
    });

    it('rejects LOG_CHAOS_OUTLIER_MAX_MS smaller than min', () => {
      expect(() =>
        createConfig({ LOG_CHAOS_OUTLIER_MIN_MS: '4000', LOG_CHAOS_OUTLIER_MAX_MS: '1000' }),
      ).toThrow(/LOG_CHAOS_OUTLIER_MAX_MS \(1000\) must be >= LOG_CHAOS_OUTLIER_MIN_MS \(4000\)/);
    });

    it('accepts LOG_CHAOS_OUTLIER_MAX_MS equal to min', () => {
      const result = createConfig({
        LOG_CHAOS_OUTLIER_MIN_MS: '3000',
        LOG_CHAOS_OUTLIER_MAX_MS: '3000',
      });

      expect(result.chaos.policy.outlierMinMs).toBe(3000);
      expect(result.chaos.policy.outlierMaxMs).toBe(3000);
    });

    it('rejects transient + permanent failure rates summing above 1', () => {
      expect(() =>
        createConfig({
          LOG_CHAOS_TRANSIENT_FAILURE_RATE: '0.7',
          LOG_CHAOS_PERMANENT_FAILURE_RATE: '0.5',
        }),
      ).toThrow(/must be <= 1/);
    });

    it('accepts transient + permanent failure rates summing exactly to 1', () => {
      const result = createConfig({
        LOG_CHAOS_TRANSIENT_FAILURE_RATE: '0.6',
        LOG_CHAOS_PERMANENT_FAILURE_RATE: '0.4',
      });

      expect(result.chaos.policy.transientFailureRate).toBe(0.6);
      expect(result.chaos.policy.permanentFailureRate).toBe(0.4);
    });

    it('rejects individual failure rates above 1', () => {
      expect(() => createConfig({ LOG_CHAOS_TRANSIENT_FAILURE_RATE: '1.5' })).toThrow();
      expect(() => createConfig({ LOG_CHAOS_PERMANENT_FAILURE_RATE: '1.5' })).toThrow();
    });

    it('rejects negative rates', () => {
      expect(() => createConfig({ LOG_CHAOS_TRANSIENT_FAILURE_RATE: '-0.1' })).toThrow();
      expect(() => createConfig({ LOG_CHAOS_OUTLIER_RATE: '-0.01' })).toThrow();
    });
  });
});
