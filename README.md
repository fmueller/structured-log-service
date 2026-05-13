# structured-log-service

[![CI](https://github.com/fmueller/structured-log-service/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/fmueller/structured-log-service/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D24-brightgreen.svg)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-11-orange.svg)](https://pnpm.io)

HTTP log ingestion service with async processing and OpenTelemetry traces, metrics, and logs.

## What this service does

`structured-log-service` accepts batches of structured log records over HTTP, validates them, and processes them asynchronously through an in-memory bounded queue and a worker pool. Requests are authenticated with bearer API keys and rate-limited per client. The worker writes each record as a single JSON line to STDOUT and, when `OTEL_EXPORTER_OTLP_ENDPOINT` is configured, `@opentelemetry/instrumentation-pino` also feeds the same records into the OpenTelemetry Logs SDK so they ship to the collector over OTLP with the proto-level `traceId`/`spanId` populated from the active span. The Node OpenTelemetry SDK is wired with `@opentelemetry/auto-instrumentations-node` and a periodic OTLP metric reader, so the process emits traces, metrics, and logs over OTLP to whatever collector it is pointed at. Kubernetes-style `/livez` and `/readyz` probes report liveness and queue-depth-aware readiness.

## Quick start

```sh
mise trust
mise install
mise run install
mise run dev
```

The service listens on port `3003` by default.

Health check:

```sh
curl http://localhost:3003/
```

```json
{ "name": "structured-log-service", "status": "ok" }
```

## Example request

```sh
curl -i -X POST http://localhost:3003/logs/json \
  -H "Authorization: Bearer dev-api-key" \
  -H "Content-Type: application/json" \
  -d '[
    {
      "timestamp": "2026-05-12T12:00:00Z",
      "level": "info",
      "message": "checkout completed",
      "meta": { "service": "checkout-api", "request_id": "req-1" }
    }
  ]'
```

Expected response:

```http
HTTP/1.1 202 Accepted
Content-Type: application/json

{ "accepted": 1, "queueDepth": 1 }
```

## Running tests

| Command                     | What it runs                                         |
| --------------------------- | ---------------------------------------------------- |
| `mise run test`             | Full suite (unit → integration → e2e).               |
| `mise run test:unit`        | Fast isolated tests in `test/unit`.                  |
| `mise run test:integration` | Subsystem boundary tests in `test/integration`.      |
| `mise run test:e2e`         | Live HTTP / process-level smoke flows in `test/e2e`. |
| `mise run test:mutate`      | Mutation testing (Stryker); must stay ≥ 70%. Slow.   |
| `mise run check`            | Lint + format check + typecheck.                     |

## Docker Compose smoke test

The smoke test exercises the full pipeline end-to-end: HTTP → app → queue → worker → (STDOUT JSON for local visibility **and** Pino → `instrumentation-pino` → OpenTelemetry Logs SDK → OTLP) → OpenTelemetry Collector → **[Dash0](https://www.dash0.com/)**. The OTel SDK in the app also ships traces and process/HTTP metrics over OTLP to the same collector. Dash0 is the observability backend used for dashboards, trace inspection, and log search; the Collector forwards traces, logs, and metrics to it via OTLP. The Collector's `debug` exporter still prints locally even when Dash0 credentials are absent, so the pipeline is usable for local-only checks too.

You will need a Dash0 account to see the data downstream — fill the OTLP endpoint and ingest auth token in `.env`:

```sh
cp .env.example .env
# Edit .env: set DASH0_OTLP_ENDPOINT and DASH0_AUTH_TOKEN

mise run compose:up      # app + otelcol only
mise run compose:smoke   # app + otelcol + synthetic producer (loadtest profile)
mise run compose:down    # tear down, including loadtest containers
```

Without the `loadtest` profile you drive traffic with curl. With the profile, `scripts/send-logs.mjs` posts a batch every 500 ms. Watch the Collector logs for the `debug` exporter output and the app logs for `processed_log` lines with populated `trace_id`/`span_id`, then pivot on those IDs in Dash0.

The smoke setup exercises two complementary failure-injection modes so retry, error logging, and OTel exception paths stay warm: the producer's `INJECT_FAILURES=true` marks every 25th record with `meta.simulate_processing_failure` (client-driven, deterministic) and the app's `LOG_PROCESSING_FAILURE_RATE_PCT=5` randomly throws on ~5% of records after the simulated delay (server-driven, probabilistic). The two surface as distinct error messages — `Simulated log processing failure` and `Injected artificial processing failure` — so you can filter spans and logs by failure type.

## Configuration

All env vars are parsed once at startup by a Zod schema in `src/config.ts`. Invalid values fail loudly.

| Name                                  | Default                 | Description                                                                                                                                                    |
| ------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                                | `3003`                  | HTTP port.                                                                                                                                                     |
| `JSON_BODY_LIMIT`                     | `1mb`                   | Maximum JSON request body size (Express `body-parser` syntax).                                                                                                 |
| `API_KEYS`                            | `dev-api-key`           | Comma-separated bearer tokens. Each maps to a synthetic client id.                                                                                             |
| `RATE_LIMIT_MAX_REQUESTS`             | `10`                    | Max requests per window per client.                                                                                                                            |
| `RATE_LIMIT_WINDOW_MS`                | `1000`                  | Rate-limit window length, in milliseconds.                                                                                                                     |
| `LOG_MAX_BATCH_SIZE`                  | `1000`                  | Maximum records per `POST /logs/json` batch.                                                                                                                   |
| `LOG_QUEUE_MAX_SIZE`                  | `1000`                  | Bounded queue capacity. Batches that would overflow are rejected with 503.                                                                                     |
| `LOG_READINESS_HIGH_WATER_MARK_RATIO` | `0.9`                   | Queue-depth ratio above which `/readyz` returns 503 to shed load.                                                                                              |
| `LOG_WORKER_CONCURRENCY`              | `5`                     | Maximum concurrent in-flight worker tasks.                                                                                                                     |
| `LOG_WORKER_MAX_RETRIES`              | `3`                     | Retries after the initial attempt. `3` means 1 initial + 3 retries = 4 attempts.                                                                               |
| `LOG_PROCESSING_DELAY_MS`             | `100`                   | Simulated processing latency in the stdout log processor.                                                                                                      |
| `LOG_PROCESSING_DELAY_JITTER_MS`      | `0`                     | Additional uniform random jitter added on top of `LOG_PROCESSING_DELAY_MS` per entry, in ms. Effective delay is uniform in `[base, base + jitter]`.            |
| `LOG_PROCESSING_FAILURE_RATE_PCT`     | `0`                     | Probability (integer 0–100) that an entry's processing throws after the simulated delay. `0` disables. Useful for exercising retry/error paths in smoke tests. |
| `LOG_WORKER_POLL_INTERVAL_MS`         | `100`                   | Worker tick interval when there is no notify signal.                                                                                                           |
| `LOG_WORKER_RETRY_BACKOFF_BASE_MS`    | `50`                    | Base backoff (multiplied by attempt count) before retrying a failed record.                                                                                    |
| `LOG_WORKER_DRAIN_TIMEOUT_MS`         | `5000`                  | Maximum time the worker waits to drain the queue during shutdown.                                                                                              |
| `OTEL_SERVICE_NAME`                   | `log-ingestion-service` | `service.name` resource attribute reported to the OTel pipeline.                                                                                               |
| `OTEL_EXPORTER_OTLP_ENDPOINT`         | _(unset)_               | OTLP endpoint for the trace exporter. Omitting it disables the network exporter.                                                                               |
| `LOG_LEVEL`                           | `info`                  | Pino log level (`trace` … `fatal`).                                                                                                                            |

`OTEL_EXPORTER_OTLP_PROTOCOL` is read directly by the OpenTelemetry Node SDK (set to `http/protobuf` in `docker-compose.yml`); the service does not parse it.

## Endpoints

| Method | Path         | Auth       | Status codes                                                                                                                                            |
| ------ | ------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/`          | none       | `200` service status.                                                                                                                                   |
| GET    | `/livez`     | none       | `200 { status: "alive" }` always while the process is alive.                                                                                            |
| GET    | `/readyz`    | none       | `200 { status: "ready", ... }` · `503 { status: "not_ready", reason, ... }` when the worker is stopped or the queue is at or above the high-water mark. |
| POST   | `/logs/json` | bearer key | `202` accepted · `400` invalid JSON / payload · `401` · `413` · `429` · `503` queue full.                                                               |
| —      | _(any)_      | —          | `404 not_found`.                                                                                                                                        |

Kubernetes probe stanza:

```yaml
livenessProbe:
  httpGet: { path: /livez, port: 3003 }
  initialDelaySeconds: 5
  periodSeconds: 10
  failureThreshold: 3
readinessProbe:
  httpGet: { path: /readyz, port: 3003 }
  initialDelaySeconds: 2
  periodSeconds: 2
  failureThreshold: 2
```

## Design decisions

- **In-memory bounded queue.** Scope-appropriate for this assignment, but isolated behind a narrow `LogQueue` interface so the implementation can be swapped for Kafka, Redis Streams, or SQS without touching the routes or worker.
- **Backpressure with `Retry-After`.** Both the rate limiter (`429`) and the queue (`503 queue_full`) set honest retry signals so clients can back off cleanly rather than guess.
- **Retry semantics.** `LOG_WORKER_MAX_RETRIES` counts retries _after_ the initial attempt: `3` means 1 initial + 3 retries = 4 attempts total. Backoff is `attempt × LOG_WORKER_RETRY_BACKOFF_BASE_MS`.
- **Pluggable rate limit.** A `RateLimiter` interface fronts the in-memory fixed-window implementation. A sliding-window variant (to close the boundary-burst gap) can drop in behind the same interface; it is intentionally deferred for this assignment.
- **OTel + Pino correlation.** The auto-instrumentation bundle wires `@opentelemetry/instrumentation-pino`, which does two things on every active-span log call: it injects `trace_id`/`span_id` into the JSON line on STDOUT (log correlation), and it multistreams the same record to the OpenTelemetry Logs SDK so the OTLP exporter ships it with the proto-level `traceId`/`spanId` set from the active context (log sending). The SDK is started at module load in `src/telemetry/tracing.ts` so the require-time patch is in place before `pino` is first required. Worker `log.process` spans expose retry count, attempt outcome, and client id as attributes — the pivot points for Dash0 dashboards and trace lookups.
- **Drain-on-shutdown.** On SIGTERM the process closes the HTTP server, then runs `worker.drain(timeoutMs)` (event-driven race against a timer), then shuts down the OTel SDK, then exits. This keeps in-flight batches from being dropped during rolling deploys.
- **`/livez` vs `/readyz`.** Liveness is restart-only: it returns `200` as long as the process is running, so Kubernetes only restarts on a hard crash. Readiness is load-shed-only: it returns `503` when the worker is stopped or the queue is above the high-water mark, so the pod is pulled out of the Service backend without being restarted.

## Production follow-ups

- Durable queue and dead-letter queue (Kafka / Redis Streams / SQS) instead of in-memory.
- Persistent, hashed API key store (Postgres + bcrypt/argon2) instead of comma-separated env keys.
- Distributed Redis-backed sliding-window rate limiter.
- Idempotency keys / batch-level deduplication.
- Multi-instance retry backoff with jitter to avoid thundering-herd retries.
- `InMemorySpanExporter`-based integration tests asserting span attributes and parent linkage.
- Per-tenant fairness via round-robin sub-queues so one noisy client cannot starve others.
- Per-IP pre-auth rate limit to dampen credential-stuffing against `/logs/json`.

## License

Licensed under the Apache License 2.0. See `LICENSE` for details.
