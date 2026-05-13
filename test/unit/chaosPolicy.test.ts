import { describe, expect, it } from 'vitest';

import {
  type ChaosPolicyConfig,
  type Rng,
  createSeededRng,
  decideChaosOutcome,
} from '../../src/logs/chaosPolicy';

const basePolicy: ChaosPolicyConfig = {
  latencyMedianMs: 20,
  latencyP99Ms: 500,
  outlierRate: 0.005,
  outlierMinMs: 2000,
  outlierMaxMs: 5000,
  transientFailureRate: 0.02,
  permanentFailureRate: 0.002,
};

function makeConstantRng(value: number): Rng {
  return () => value;
}

describe('createSeededRng', () => {
  it('produces the same sequence for the same seed', () => {
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(42);
    const draws1 = Array.from({ length: 10 }, () => rng1());
    const draws2 = Array.from({ length: 10 }, () => rng2());
    expect(draws1).toEqual(draws2);
  });

  it('produces different sequences for different seeds', () => {
    const rng1 = createSeededRng(1);
    const rng2 = createSeededRng(2);
    const draws1 = Array.from({ length: 10 }, () => rng1());
    const draws2 = Array.from({ length: 10 }, () => rng2());
    expect(draws1).not.toEqual(draws2);
  });

  it('all values are in [0, 1)', () => {
    const rng = createSeededRng(99);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('does not get stuck in zero-state when seed is 0', () => {
    const rng = createSeededRng(0);
    const draws = Array.from({ length: 5 }, () => rng());
    expect(draws.some((v) => v !== 0)).toBe(true);
  });
});

describe('decideChaosOutcome – latency sampling', () => {
  it('uses outlier range when first draw is below outlierRate', () => {
    const cfg: ChaosPolicyConfig = {
      ...basePolicy,
      outlierRate: 0.5,
      outlierMinMs: 2000,
      outlierMaxMs: 5000,
    };
    // First draw < 0.5 triggers outlier path; second draw determines position in [min, max].
    let call = 0;
    const stubRng: Rng = () => (call++ === 0 ? 0.1 : 0.5);
    const { latencyMs } = decideChaosOutcome(stubRng, cfg);
    expect(latencyMs).toBeGreaterThanOrEqual(2000);
    expect(latencyMs).toBeLessThanOrEqual(5000);
  });

  it('uses lognormal when first draw is >= outlierRate', () => {
    const cfg: ChaosPolicyConfig = {
      ...basePolicy,
      outlierRate: 0.0,
      transientFailureRate: 0,
      permanentFailureRate: 0,
    };
    const rng = createSeededRng(123);
    const { latencyMs } = decideChaosOutcome(rng, cfg);
    // Should be a deterministic positive integer
    expect(latencyMs).toBeGreaterThan(0);
    expect(Number.isInteger(latencyMs)).toBe(true);
  });

  it('returns constant latencyMedianMs when p99 <= median (degenerate config)', () => {
    const cfg: ChaosPolicyConfig = {
      ...basePolicy,
      latencyMedianMs: 100,
      latencyP99Ms: 100,
      outlierRate: 0,
    };
    const rng = createSeededRng(7);
    for (let i = 0; i < 10; i++) {
      const { latencyMs } = decideChaosOutcome(rng, cfg);
      expect(latencyMs).toBe(100);
    }
  });

  it('never produces an outlier when outlierRate is 0', () => {
    const cfg: ChaosPolicyConfig = {
      ...basePolicy,
      outlierRate: 0,
      outlierMinMs: 9999,
      outlierMaxMs: 99999,
    };
    const rng = createSeededRng(5);
    for (let i = 0; i < 100; i++) {
      const { latencyMs } = decideChaosOutcome(rng, cfg);
      expect(latencyMs).toBeLessThan(9999);
    }
  });
});

describe('decideChaosOutcome – failure kind', () => {
  it('always returns none when both rates are 0', () => {
    const cfg: ChaosPolicyConfig = {
      ...basePolicy,
      transientFailureRate: 0,
      permanentFailureRate: 0,
    };
    const rng = createSeededRng(1);
    for (let i = 0; i < 100; i++) {
      const { failureKind } = decideChaosOutcome(rng, cfg);
      expect(failureKind).toBe('none');
    }
  });

  it('always returns transient when transientFailureRate is 1', () => {
    const cfg: ChaosPolicyConfig = {
      ...basePolicy,
      transientFailureRate: 1,
      permanentFailureRate: 0,
    };
    const rng = makeConstantRng(0.5);
    for (let i = 0; i < 10; i++) {
      const { failureKind } = decideChaosOutcome(rng, cfg);
      expect(failureKind).toBe('transient');
    }
  });

  it('always returns permanent when permanentFailureRate is 1 and transient is 0', () => {
    const cfg: ChaosPolicyConfig = {
      ...basePolicy,
      transientFailureRate: 0,
      permanentFailureRate: 1,
    };
    const rng = makeConstantRng(0.5);
    for (let i = 0; i < 10; i++) {
      const { failureKind } = decideChaosOutcome(rng, cfg);
      expect(failureKind).toBe('permanent');
    }
  });

  it('empirical distribution is within ±4σ for mid-range rates (N=10000)', () => {
    const transientRate = 0.05;
    const permanentRate = 0.02;
    const cfg: ChaosPolicyConfig = {
      ...basePolicy,
      transientFailureRate: transientRate,
      permanentFailureRate: permanentRate,
    };
    const N = 10_000;
    const rng = createSeededRng(777);
    let transientCount = 0;
    let permanentCount = 0;

    for (let i = 0; i < N; i++) {
      const { failureKind } = decideChaosOutcome(rng, cfg);
      if (failureKind === 'transient') transientCount++;
      if (failureKind === 'permanent') permanentCount++;
    }

    const tolerance = 4;
    const tSigma = Math.sqrt((transientRate * (1 - transientRate)) / N);
    expect(transientCount / N).toBeGreaterThan(transientRate - tolerance * tSigma);
    expect(transientCount / N).toBeLessThan(transientRate + tolerance * tSigma);

    const pSigma = Math.sqrt((permanentRate * (1 - permanentRate)) / N);
    expect(permanentCount / N).toBeGreaterThan(permanentRate - tolerance * pSigma);
    expect(permanentCount / N).toBeLessThan(permanentRate + tolerance * pSigma);
  });
});
