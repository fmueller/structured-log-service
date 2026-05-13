import { describe, it, expect } from 'vitest';
import { parseConfig } from '../../../scripts/producer/config.mjs';

const BASE_ENV = {
  INGESTION_URL: 'http://localhost:3003/logs/json',
  API_KEY: 'dev-api-key',
};

describe('parseConfig', () => {
  it('returns defaults when no args or env overrides', () => {
    const config = parseConfig([], {});
    expect(config.ingestionUrl).toBe('http://localhost:3003/logs/json');
    expect(config.apiKey).toBe('dev-api-key');
    expect(config.batchSize).toBe(10);
    expect(config.intervalMs).toBe(500);
    expect(config.mode).toBe('infinite');
    expect(config.batchLimit).toBeNull();
    expect(config.scenarioOverride).toBeNull();
    expect(config.otlpEndpoint).toBeNull();
  });

  describe('--once flag', () => {
    it('sets mode to "once" and batchLimit from positional arg', () => {
      const config = parseConfig(['--once', '50'], BASE_ENV);
      expect(config.mode).toBe('once');
      expect(config.batchLimit).toBe(50);
    });

    it('sets mode to "once" and batchLimit from = syntax', () => {
      const config = parseConfig(['--once=25'], BASE_ENV);
      expect(config.mode).toBe('once');
      expect(config.batchLimit).toBe(25);
    });

    it('throws when --once is missing its argument', () => {
      expect(() => parseConfig(['--once'], BASE_ENV)).toThrow(/--once/);
    });

    it('throws when --once value is not a positive integer', () => {
      expect(() => parseConfig(['--once', '0'], BASE_ENV)).toThrow(/--once/);
      expect(() => parseConfig(['--once', 'abc'], BASE_ENV)).toThrow(/--once/);
    });
  });

  describe('BATCH_LIMIT env', () => {
    it('sets mode to "once" when BATCH_LIMIT is provided', () => {
      const config = parseConfig([], { ...BASE_ENV, BATCH_LIMIT: '100' });
      expect(config.mode).toBe('once');
      expect(config.batchLimit).toBe(100);
    });

    it('throws on invalid BATCH_LIMIT', () => {
      expect(() => parseConfig([], { ...BASE_ENV, BATCH_LIMIT: 'notanumber' })).toThrow(
        /BATCH_LIMIT/,
      );
    });
  });

  describe('--scenario flag', () => {
    it('sets scenarioOverride from = syntax', () => {
      const config = parseConfig(['--scenario=checkout-spike'], BASE_ENV);
      expect(config.scenarioOverride).toBe('checkout-spike');
    });

    it('sets scenarioOverride from positional arg', () => {
      const config = parseConfig(['--scenario', 'payment-outage'], BASE_ENV);
      expect(config.scenarioOverride).toBe('payment-outage');
    });

    it('throws for unknown scenario', () => {
      expect(() => parseConfig(['--scenario=nonexistent'], BASE_ENV)).toThrow(/Invalid scenario/);
    });

    it('throws when --scenario is missing its argument', () => {
      expect(() => parseConfig(['--scenario'], BASE_ENV)).toThrow(/--scenario/);
    });

    it('throws when --scenario is followed by another long-flag instead of a value', () => {
      expect(() => parseConfig(['--scenario', '--once', '5'], BASE_ENV)).toThrow(/--scenario/);
    });

    it('throws when --scenario is followed by a short-flag instead of a value', () => {
      expect(() => parseConfig(['--scenario', '-x'], BASE_ENV)).toThrow(/--scenario/);
    });
  });

  describe('SCENARIO env', () => {
    it('sets scenarioOverride from env', () => {
      const config = parseConfig([], { ...BASE_ENV, SCENARIO: 'baseline' });
      expect(config.scenarioOverride).toBe('baseline');
    });

    it('throws for invalid scenario via env', () => {
      expect(() => parseConfig([], { ...BASE_ENV, SCENARIO: 'bad-scenario' })).toThrow(
        /Invalid scenario/,
      );
    });
  });

  it('reads BATCH_SIZE from env', () => {
    const config = parseConfig([], { ...BASE_ENV, BATCH_SIZE: '20' });
    expect(config.batchSize).toBe(20);
  });

  it('reads INTERVAL_MS from env', () => {
    const config = parseConfig([], { ...BASE_ENV, INTERVAL_MS: '1000' });
    expect(config.intervalMs).toBe(1000);
  });

  it('throws for invalid BATCH_SIZE', () => {
    expect(() => parseConfig([], { ...BASE_ENV, BATCH_SIZE: '0' })).toThrow(/BATCH_SIZE/);
  });

  it('reads OTEL_EXPORTER_OTLP_ENDPOINT from env', () => {
    const config = parseConfig([], {
      ...BASE_ENV,
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otelcol:4318',
    });
    expect(config.otlpEndpoint).toBe('http://otelcol:4318');
  });

  it('returns a frozen config object', () => {
    const config = parseConfig([], BASE_ENV);
    expect(Object.isFrozen(config)).toBe(true);
  });
});
