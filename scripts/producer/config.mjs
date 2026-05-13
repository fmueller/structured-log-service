// Configuration parser for the smoke producer.
// Accepts CLI argv and process.env; returns a frozen config object.

import { SCENARIO_NAMES } from './scenarios.mjs';

const DEFAULT_INGESTION_URL = 'http://localhost:3003/logs/json';
const DEFAULT_API_KEY = 'dev-api-key';
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_INTERVAL_MS = 500;

function parseIntPositive(raw, name, min = 1) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) {
    throw new Error(`Invalid ${name}: expected integer >= ${min}, got ${JSON.stringify(raw)}`);
  }
  return n;
}

/**
 * @param {string[]} argv  process.argv.slice(2)
 * @param {Record<string,string|undefined>} env  process.env
 */
export function parseConfig(argv, env) {
  let mode = 'infinite';
  let batchLimit = null;
  let scenarioOverride = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--once') {
      const n = argv[i + 1];
      if (!n || n.startsWith('--')) {
        throw new Error('--once requires a positive integer argument');
      }
      batchLimit = parseIntPositive(n, '--once');
      mode = 'once';
      i++;
    } else if (arg.startsWith('--once=')) {
      batchLimit = parseIntPositive(arg.slice('--once='.length), '--once');
      mode = 'once';
    } else if (arg.startsWith('--scenario=')) {
      scenarioOverride = arg.slice('--scenario='.length);
    } else if (arg === '--scenario') {
      scenarioOverride = argv[i + 1];
      i++;
    }
  }

  // Env overrides (lower precedence than argv for mode/scenario)
  if (env.BATCH_LIMIT && mode === 'infinite') {
    batchLimit = parseIntPositive(env.BATCH_LIMIT, 'BATCH_LIMIT');
    mode = 'once';
  }

  if (env.SCENARIO && !scenarioOverride) {
    scenarioOverride = env.SCENARIO;
  }

  if (scenarioOverride && !SCENARIO_NAMES.includes(scenarioOverride)) {
    throw new Error(
      `Invalid scenario "${scenarioOverride}". Allowed: ${SCENARIO_NAMES.join(', ')}`,
    );
  }

  const ingestionUrl = env.INGESTION_URL ?? DEFAULT_INGESTION_URL;
  const apiKey = env.API_KEY ?? DEFAULT_API_KEY;

  const batchSize = parseIntPositive(env.BATCH_SIZE ?? String(DEFAULT_BATCH_SIZE), 'BATCH_SIZE');

  const intervalMs = parseIntPositive(
    env.INTERVAL_MS ?? String(DEFAULT_INTERVAL_MS),
    'INTERVAL_MS',
  );

  const seed = env.SEED ? parseIntPositive(env.SEED, 'SEED', 0) : Date.now();

  const otlpEndpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT ?? null;

  return Object.freeze({
    ingestionUrl,
    apiKey,
    batchSize,
    intervalMs,
    mode,
    batchLimit,
    scenarioOverride,
    seed,
    otlpEndpoint,
  });
}
