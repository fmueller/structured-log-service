// Weighted log-level picker.

export const DEFAULT_LEVEL_WEIGHTS = { debug: 14, info: 78, warn: 6, error: 2 };

/**
 * Returns a function that picks a level using one rng() draw.
 *
 * @param {{ debug: number, info: number, warn: number, error: number }} weights
 * @param {() => number} rng  Returns a value in [0, 1)
 * @returns {() => string}
 */
export function weightedLevelPicker(weights, rng) {
  const total = weights.debug + weights.info + weights.warn + weights.error;
  const debugCut = weights.debug / total;
  const infoCut = debugCut + weights.info / total;
  const warnCut = infoCut + weights.warn / total;

  return function pickLevel() {
    const r = rng();
    if (r < debugCut) return 'debug';
    if (r < infoCut) return 'info';
    if (r < warnCut) return 'warn';
    return 'error';
  };
}
