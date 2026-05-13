import { describe, it, expect } from 'vitest';
import { SERVICES, pickService } from '../../../scripts/producer/services.mjs';
import { getScenarioState } from '../../../scripts/producer/scenarios.mjs';

const ITERATIONS = 10_000;

// Deterministic stratified rng — steps through [0,1) in increments of 0.0001.
function sequentialRng(): () => number {
  let r = 0;
  return () => {
    const val = r;
    r = (r + 0.0001) % 1;
    return val;
  };
}

function distribution(scenarioName: string): Map<string, number> {
  const scenario = getScenarioState(scenarioName, 0);
  const counts = new Map<string, number>(SERVICES.map((s) => [s, 0]));
  const rng = sequentialRng();
  for (let i = 0; i < ITERATIONS; i++) {
    const svc = pickService(scenario, rng);
    counts.set(svc, (counts.get(svc) ?? 0) + 1);
  }
  return counts;
}

function shareOf(counts: Map<string, number>, service: string): number {
  return (counts.get(service) ?? 0) / ITERATIONS;
}

describe('SERVICES', () => {
  it('lists the five simulated upstream services', () => {
    expect(SERVICES).toEqual([
      'checkout-api',
      'payment-service',
      'inventory-service',
      'auth-service',
      'notification-service',
    ]);
  });
});

describe('pickService', () => {
  it('returns the first service when rng returns 0', () => {
    const baseline = getScenarioState('baseline', 0);
    expect(pickService(baseline, () => 0)).toBe('checkout-api');
  });

  it('returns the last service when rng returns just below 1', () => {
    const baseline = getScenarioState('baseline', 0);
    expect(pickService(baseline, () => 0.9999999)).toBe('notification-service');
  });

  it('distributes uniformly across services under baseline scenario', () => {
    // Baseline = equal weights; each of 5 services should be ~20% of 10000.
    const counts = distribution('baseline');
    for (const svc of SERVICES) {
      expect(shareOf(counts, svc)).toBeGreaterThan(0.15);
      expect(shareOf(counts, svc)).toBeLessThan(0.25);
    }
  });

  it('weights checkout-api five times higher under checkout-spike', () => {
    // Weights: checkout-api=5, others=1 → total 9. checkout-api ≈ 55.6%, others ≈ 11.1%.
    const counts = distribution('checkout-spike');
    expect(shareOf(counts, 'checkout-api')).toBeGreaterThan(0.5);
    expect(shareOf(counts, 'checkout-api')).toBeLessThan(0.62);

    for (const svc of SERVICES) {
      if (svc === 'checkout-api') continue;
      expect(shareOf(counts, svc)).toBeGreaterThan(0.08);
      expect(shareOf(counts, svc)).toBeLessThan(0.14);
    }
  });

  it('does not weight services that lack a volumeMultiplier modifier (payment-outage)', () => {
    // payment-outage modifies levelWeights and latencyMultiplier for payment-service
    // but no volumeMultiplier, so volume distribution stays uniform.
    const counts = distribution('payment-outage');
    for (const svc of SERVICES) {
      expect(shareOf(counts, svc)).toBeGreaterThan(0.15);
      expect(shareOf(counts, svc)).toBeLessThan(0.25);
    }
  });
});
