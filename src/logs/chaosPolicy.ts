export type ChaosFailureKind = 'none' | 'transient' | 'permanent';

export type ChaosOutcome = {
  latencyMs: number;
  failureKind: ChaosFailureKind;
};

export type ChaosPolicyConfig = {
  latencyMedianMs: number;
  latencyP99Ms: number;
  outlierRate: number;
  outlierMinMs: number;
  outlierMaxMs: number;
  transientFailureRate: number;
  permanentFailureRate: number;
};

export type Rng = () => number;

export function createSeededRng(seed: number): Rng {
  let s = seed | 0 || 1;
  return (): number => {
    s += 0x6d2b79f5;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 0x100000000;
  };
}

// z-score for the 99th percentile of the standard normal distribution;
// used to derive lognormal sigma from the configured p99/median ratio.
const Z_SCORE_P99 = 2.326;

function boxMullerNormal(rng: Rng): number {
  const u1 = Math.max(rng(), Number.EPSILON);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function sampleLatency(rng: Rng, cfg: ChaosPolicyConfig): number {
  if (rng() < cfg.outlierRate) {
    return Math.round(cfg.outlierMinMs + rng() * (cfg.outlierMaxMs - cfg.outlierMinMs));
  }

  if (cfg.latencyMedianMs >= cfg.latencyP99Ms) {
    return cfg.latencyMedianMs;
  }

  const mu = Math.log(cfg.latencyMedianMs);
  const sigma = Math.log(cfg.latencyP99Ms / cfg.latencyMedianMs) / Z_SCORE_P99;
  return Math.round(Math.exp(mu + sigma * boxMullerNormal(rng)));
}

function sampleFailureKind(rng: Rng, cfg: ChaosPolicyConfig): ChaosFailureKind {
  const r = rng();
  if (r < cfg.transientFailureRate) {
    return 'transient';
  }
  if (r < cfg.transientFailureRate + cfg.permanentFailureRate) {
    return 'permanent';
  }
  return 'none';
}

export function decideChaosOutcome(rng: Rng, cfg: ChaosPolicyConfig): ChaosOutcome {
  const latencyMs = sampleLatency(rng, cfg);
  const failureKind = sampleFailureKind(rng, cfg);
  return { latencyMs, failureKind };
}
