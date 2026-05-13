#!/usr/bin/env node
// Synthetic HTTP log producer for the Docker Compose smoke test.
// Plain Node ESM (no TypeScript, no Pino) — runs in a separate container.

import { parseConfig } from './producer/config.mjs';
import { createIdPool } from './producer/idPool.mjs';
import { initTracing } from './producer/tracing.mjs';
import { createHttpClient } from './producer/httpClient.mjs';
import { createSummary } from './producer/summary.mjs';
import { buildRecord } from './producer/payload.mjs';
import { SCENARIO_NAMES, getScenarioState } from './producer/scenarios.mjs';

const SERVICES = [
  'checkout-api',
  'payment-service',
  'inventory-service',
  'auth-service',
  'notification-service',
];

const SCENARIO_ACTIVE_MS = 90_000;
const SCENARIO_BASELINE_MS = 60_000;
const SUMMARY_INTERVAL_MS = 30_000;

// Simple LCG for reproducible randomness (seed from config).
function makeLcg(seed) {
  let s = seed >>> 0;
  return function rng() {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function createInterruptibleSleep() {
  let wake;
  function sleep(ms) {
    return new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      wake = () => {
        clearTimeout(t);
        resolve();
      };
    });
  }
  function interrupt() {
    wake?.();
  }
  return { sleep, interrupt };
}

// Scenario cycling state
function makeScenarioCycler(override) {
  if (override) {
    const fixed = getScenarioState(override, 0);
    return { currentScenario: () => fixed };
  }
  let idx = 0;
  let phaseStart = Date.now();
  let inBaseline = true;

  return {
    currentScenario() {
      const elapsed = Date.now() - phaseStart;
      if (inBaseline && elapsed >= SCENARIO_BASELINE_MS) {
        inBaseline = false;
        phaseStart = Date.now();
      } else if (!inBaseline && elapsed >= SCENARIO_ACTIVE_MS) {
        inBaseline = true;
        idx = (idx + 1) % SCENARIO_NAMES.length;
        phaseStart = Date.now();
      }
      const name = inBaseline ? 'baseline' : SCENARIO_NAMES[idx];
      return getScenarioState(name, Date.now() - phaseStart);
    },
  };
}

async function main() {
  const config = parseConfig(process.argv.slice(2), process.env);

  const { tracer, sdk } = initTracing(config.otlpEndpoint);
  const idPool = createIdPool({ users: 200, orders: 500, carts: 300, skus: 100 });
  const rng = makeLcg(config.seed);
  const httpClient = createHttpClient(config, tracer);
  const summary = createSummary();
  const cycler = makeScenarioCycler(config.scenarioOverride);
  const { sleep, interrupt } = createInterruptibleSleep();

  console.log(
    JSON.stringify({
      msg: 'log-producer starting',
      ingestionUrl: config.ingestionUrl,
      batchSize: config.batchSize,
      intervalMs: config.intervalMs,
      mode: config.mode,
      batchLimit: config.batchLimit,
      scenarioOverride: config.scenarioOverride,
      seed: config.seed,
    }),
  );

  let stopped = false;
  let inFlight = null;
  let batchCount = 0;
  let consecutiveFailures = 0;

  const summaryTimer = setInterval(() => {
    const scenario = cycler.currentScenario();
    summary.tick(scenario.name, SUMMARY_INTERVAL_MS);
  }, SUMMARY_INTERVAL_MS);

  async function runLoop() {
    let serviceIdx = 0;

    while (!stopped) {
      const scenario = cycler.currentScenario();
      const effectiveInterval = Math.max(
        10,
        Math.round(config.intervalMs / scenario.volumeMultiplier),
      );

      // Build one record per service in this batch
      const records = [];
      for (let i = 0; i < config.batchSize; i++) {
        const service = SERVICES[serviceIdx % SERVICES.length];
        records.push(buildRecord(service, scenario, idPool, rng));
        serviceIdx++;
      }

      inFlight = httpClient.sendBatch(records);
      const result = await inFlight;
      inFlight = null;

      summary.record(result);
      batchCount++;

      console.log(
        JSON.stringify({
          sent: records.length,
          status: result.status,
          ok: result.ok,
          scenario: scenario.name,
          batch: batchCount,
          ...(result.error ? { error: result.error } : {}),
        }),
      );

      if (!result.ok) {
        consecutiveFailures++;
        if (config.mode === 'once' && consecutiveFailures >= 5) {
          process.stderr.write('5 consecutive failures — aborting\n');
          break;
        }
      } else {
        consecutiveFailures = 0;
      }

      if (config.mode === 'once' && batchCount >= config.batchLimit) {
        break;
      }

      await sleep(effectiveInterval);
    }
  }

  process.on('SIGTERM', () => {
    stopped = true;
    interrupt();
  });

  await runLoop();

  clearInterval(summaryTimer);
  summary.flush();

  await sdk.shutdown().catch(() => {});

  const exitCode = config.mode === 'once' && consecutiveFailures >= 5 ? 1 : 0;
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(JSON.stringify({ msg: 'fatal', error: String(err) }));
  process.exit(1);
});
