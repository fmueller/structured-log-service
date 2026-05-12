#!/usr/bin/env node
// Synthetic HTTP log producer for the Docker Compose smoke test.
// Plain Node ESM (no TypeScript, no Pino) — runs in a separate container.

const INGESTION_URL = process.env.INGESTION_URL ?? 'http://localhost:3003/logs/json';
const API_KEY = process.env.API_KEY ?? 'dev-api-key';
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? '10');
const INTERVAL_MS = Number(process.env.INTERVAL_MS ?? '500');
const INJECT_FAILURES = process.env.INJECT_FAILURES === 'true';

const SERVICES = [
  'checkout-api',
  'payment-service',
  'inventory-service',
  'auth-service',
  'notification-service',
];
const LEVELS = ['debug', 'info', 'warn', 'error'];

let counter = 0;

function buildRecord(index) {
  const service = SERVICES[index % SERVICES.length];
  const level = LEVELS[Math.floor(Math.random() * LEVELS.length)];
  const meta = {
    service,
    request_id: `req-${String(index)}`,
  };
  if (INJECT_FAILURES && index % 25 === 0) {
    meta.simulate_processing_failure = true;
  }
  return {
    timestamp: new Date().toISOString(),
    level,
    message: `${service} event #${String(index)}`,
    meta,
  };
}

function buildBatch() {
  const batch = [];
  for (let i = 0; i < BATCH_SIZE; i++) {
    batch.push(buildRecord(counter));
    counter += 1;
  }
  return batch;
}

async function sendBatch() {
  const batch = buildBatch();
  try {
    const response = await fetch(INGESTION_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(batch),
    });
    const bodyText = await response.text();
    console.log(
      JSON.stringify({
        sent: batch.length,
        status: response.status,
        body: bodyText.slice(0, 200),
      }),
    );
  } catch (error) {
    console.log(
      JSON.stringify({
        sent: batch.length,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

console.log(
  JSON.stringify({
    msg: 'log-producer starting',
    ingestionUrl: INGESTION_URL,
    batchSize: BATCH_SIZE,
    intervalMs: INTERVAL_MS,
    injectFailures: INJECT_FAILURES,
  }),
);

setInterval(() => {
  sendBatch().catch((error) => {
    console.log(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  });
}, INTERVAL_MS);
