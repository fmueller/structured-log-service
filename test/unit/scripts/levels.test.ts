import { describe, it, expect } from 'vitest';
import { weightedLevelPicker, DEFAULT_LEVEL_WEIGHTS } from '../../../scripts/producer/levels.mjs';

describe('weightedLevelPicker', () => {
  it('returns "debug" when rng returns 0', () => {
    const pick = weightedLevelPicker(DEFAULT_LEVEL_WEIGHTS, () => 0);
    expect(pick()).toBe('debug');
  });

  it('returns "error" when rng returns just below 1', () => {
    const pick = weightedLevelPicker(DEFAULT_LEVEL_WEIGHTS, () => 0.9999999);
    expect(pick()).toBe('error');
  });

  it('returns "info" for a value in the info band', () => {
    // debug=14, info=78, warn=6, error=2 => total=100
    // debug cut = 0.14, info cut = 0.92, warn cut = 0.98
    const pick = weightedLevelPicker(DEFAULT_LEVEL_WEIGHTS, () => 0.5);
    expect(pick()).toBe('info');
  });

  it('returns "warn" for a value in the warn band', () => {
    const pick = weightedLevelPicker(DEFAULT_LEVEL_WEIGHTS, () => 0.95);
    expect(pick()).toBe('warn');
  });

  it('distributes levels proportionally over many draws', () => {
    let r = 0;
    const sequentialRng = () => {
      const val = r;
      r = (r + 0.01) % 1;
      return val;
    };
    const pick = weightedLevelPicker(DEFAULT_LEVEL_WEIGHTS, sequentialRng);

    const counts: Record<string, number> = { debug: 0, info: 0, warn: 0, error: 0 };
    for (let i = 0; i < 1000; i++) {
      const level = pick();
      counts[level]++;
    }
    // info should dominate
    expect(counts.info).toBeGreaterThan(counts.debug);
    expect(counts.info).toBeGreaterThan(counts.warn);
    expect(counts.info).toBeGreaterThan(counts.error);
  });

  it('handles all-zero weight on one level by concentrating elsewhere', () => {
    const weights = { debug: 0, info: 100, warn: 0, error: 0 };
    const pick = weightedLevelPicker(weights, () => 0.5);
    expect(pick()).toBe('info');
  });

  it('works with non-normalized weights (different totals)', () => {
    // Weights summing to 200 should behave the same as summing to 100
    const weights = { debug: 28, info: 156, warn: 12, error: 4 };
    const pick = weightedLevelPicker(weights, () => 0.5);
    expect(pick()).toBe('info');
  });
});
