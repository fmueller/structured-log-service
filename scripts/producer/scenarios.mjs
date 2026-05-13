// Scenario definitions for the smoke producer.

import { DEFAULT_LEVEL_WEIGHTS } from './levels.mjs';

export const SCENARIO_NAMES = ['baseline', 'checkout-spike', 'payment-outage', 'db-degradation'];

/**
 * Returns the scenario state for the given scenario name.
 * elapsedMs is reserved for future ramp logic.
 *
 * @param {string} scenarioName
 * @param {number} _elapsedMs
 */
export function getScenarioState(scenarioName, elapsedMs) {
  void elapsedMs; // reserved for future ramp behavior
  switch (scenarioName) {
    case 'baseline':
      return Object.freeze({
        name: 'baseline',
        volumeMultiplier: 1.0,
        levelWeights: DEFAULT_LEVEL_WEIGHTS,
        errorRateOverride: null,
        latencyMultiplier: 1.0,
        perServiceModifiers: null,
      });

    case 'checkout-spike':
      return Object.freeze({
        name: 'checkout-spike',
        volumeMultiplier: 3.0,
        levelWeights: { debug: 10, info: 70, warn: 18, error: 2 },
        errorRateOverride: null,
        latencyMultiplier: 1.0,
        perServiceModifiers: new Map([
          ['checkout-api', { volumeMultiplier: 5, latencyMultiplier: 2 }],
        ]),
      });

    case 'payment-outage':
      return Object.freeze({
        name: 'payment-outage',
        volumeMultiplier: 0.8,
        levelWeights: { debug: 5, info: 30, warn: 25, error: 40 },
        errorRateOverride: null,
        latencyMultiplier: 1.0,
        perServiceModifiers: new Map([
          [
            'payment-service',
            {
              levelWeights: { debug: 0, info: 20, warn: 20, error: 60 },
              latencyMultiplier: 1.5,
            },
          ],
        ]),
      });

    case 'db-degradation':
      return Object.freeze({
        name: 'db-degradation',
        volumeMultiplier: 1.2,
        levelWeights: { debug: 10, info: 60, warn: 20, error: 10 },
        errorRateOverride: null,
        latencyMultiplier: 1.0,
        perServiceModifiers: new Map([
          [
            'inventory-service',
            {
              latencyMultiplier: 5,
              levelWeights: { debug: 5, info: 50, warn: 30, error: 15 },
            },
          ],
        ]),
      });

    default:
      throw new Error(`Unknown scenario "${scenarioName}". Allowed: ${SCENARIO_NAMES.join(', ')}`);
  }
}
