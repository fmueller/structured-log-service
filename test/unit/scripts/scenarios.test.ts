import { describe, it, expect } from 'vitest';
import { getScenarioState, SCENARIO_NAMES } from '../../../scripts/producer/scenarios.mjs';

describe('SCENARIO_NAMES', () => {
  it('includes the four expected scenarios', () => {
    expect(SCENARIO_NAMES).toContain('baseline');
    expect(SCENARIO_NAMES).toContain('checkout-spike');
    expect(SCENARIO_NAMES).toContain('payment-outage');
    expect(SCENARIO_NAMES).toContain('db-degradation');
  });
});

describe('getScenarioState', () => {
  it('throws for an unknown scenario name', () => {
    expect(() => getScenarioState('nonexistent', 0)).toThrow(/Unknown scenario/);
  });

  describe('baseline', () => {
    const state = getScenarioState('baseline', 0);

    it('has name "baseline"', () => {
      expect(state.name).toBe('baseline');
    });

    it('has volumeMultiplier 1.0', () => {
      expect(state.volumeMultiplier).toBe(1.0);
    });

    it('has no per-service modifiers', () => {
      expect(state.perServiceModifiers).toBeNull();
    });

    it('has latencyMultiplier 1.0', () => {
      expect(state.latencyMultiplier).toBe(1.0);
    });

    it('has all level weight keys', () => {
      expect(state.levelWeights).toHaveProperty('debug');
      expect(state.levelWeights).toHaveProperty('info');
      expect(state.levelWeights).toHaveProperty('warn');
      expect(state.levelWeights).toHaveProperty('error');
    });
  });

  describe('checkout-spike', () => {
    const state = getScenarioState('checkout-spike', 0);

    it('has volumeMultiplier >= 2', () => {
      expect(state.volumeMultiplier).toBeGreaterThanOrEqual(2);
    });

    it('has checkout-api per-service modifier', () => {
      expect(state.perServiceModifiers).toBeDefined();
      expect(state.perServiceModifiers?.has('checkout-api')).toBe(true);
    });

    it('checkout-api modifier has elevated latencyMultiplier', () => {
      const mod = state.perServiceModifiers?.get('checkout-api');
      expect(mod?.latencyMultiplier).toBeGreaterThan(1);
    });
  });

  describe('payment-outage', () => {
    const state = getScenarioState('payment-outage', 0);

    it('has elevated error weight in levelWeights', () => {
      expect(state.levelWeights.error).toBeGreaterThan(10);
    });

    it('has payment-service per-service modifier', () => {
      expect(state.perServiceModifiers?.has('payment-service')).toBe(true);
    });

    it('payment-service modifier has very high error weight', () => {
      const mod = state.perServiceModifiers?.get('payment-service');
      expect(mod?.levelWeights?.error).toBeGreaterThanOrEqual(50);
    });
  });

  describe('db-degradation', () => {
    const state = getScenarioState('db-degradation', 0);

    it('has inventory-service per-service modifier', () => {
      expect(state.perServiceModifiers?.has('inventory-service')).toBe(true);
    });

    it('inventory-service modifier has high latencyMultiplier', () => {
      const mod = state.perServiceModifiers?.get('inventory-service');
      expect(mod?.latencyMultiplier).toBeGreaterThanOrEqual(4);
    });
  });
});
