// Simulated upstream services and weighted per-batch service picker.

export const SERVICES = [
  'checkout-api',
  'payment-service',
  'inventory-service',
  'auth-service',
  'notification-service',
];

/**
 * Picks one service for the next record, weighted by the scenario's per-service
 * volumeMultiplier. Services without a modifier get weight 1.0.
 *
 * @param {{ perServiceModifiers?: Map<string, { volumeMultiplier?: number }> | null }} scenarioState
 * @param {() => number} rng  Returns a value in [0, 1)
 * @returns {string}
 */
export function pickService(scenarioState, rng) {
  const modifiers = scenarioState.perServiceModifiers;
  let total = 0;
  const weights = SERVICES.map((service) => {
    const weight = modifiers?.get(service)?.volumeMultiplier ?? 1.0;
    total += weight;
    return weight;
  });

  let r = rng() * total;
  for (let i = 0; i < SERVICES.length; i++) {
    r -= weights[i];
    if (r < 0) return SERVICES[i];
  }
  return SERVICES[SERVICES.length - 1];
}
