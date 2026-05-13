# structured-log-service

[![CI](https://github.com/fmueller/structured-log-service/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/fmueller/structured-log-service/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D24-brightgreen.svg)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-11-orange.svg)](https://pnpm.io)

HTTP log ingestion service: authenticated bearer ingest, per-client rate limiting, async processing through a bounded in-memory queue and worker pool, and OpenTelemetry traces, metrics, and logs shipped over OTLP — to an OTel Collector and on to Dash0 in the documented setup.

## Contents

- [Capabilities](#capabilities)
- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [Code tour](#code-tour)
- [Observability with Dash0](#observability-with-dash0)
- [Example request](#example-request)
- [Running tests](#running-tests)
- [Docker Compose smoke test](#docker-compose-smoke-test)
- [Configuration](#configuration)
- [Endpoints](#endpoints)
- [Design decisions](#design-decisions)
- [Production follow-ups](#production-follow-ups)

## Capabilities

Each capability with a pointer into the codebase.

| Area          | Capability                                                                  | Implementation                                                                                    |
| ------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Auth          | Bearer-token API key                                                        | `src/auth/authMiddleware.ts`                                                                      |
| Auth          | In-memory key store behind a swappable interface                            | `src/auth/apiKeyStore.ts` (`ApiKeyStore` interface + in-memory impl)                              |
| Auth          | Per-key rate limit (default 10 req/s)                                       | `src/rate-limit/fixedWindowRateLimiter.ts`, `rateLimitMiddleware.ts`                              |
| Ingestion     | `POST /logs/json` accepts JSON array                                        | `src/logs/logRoutes.ts`                                                                           |
| Ingestion     | Payload validation                                                          | `src/logs/logRecordSchema.ts` (Zod)                                                               |
| Ingestion     | Push to internal queue                                                      | `src/logs/logQueue.ts` (bounded; 503 + `Retry-After` on overflow)                                 |
| Processing    | Background worker, log to STDOUT                                            | `src/logs/logWorker.ts`, `src/logs/logProcessor.ts`                                               |
| Processing    | Simulated per-entry delay                                                   | `StdoutLogProcessor.process` (base + uniform jitter)                                              |
| Processing    | Configurable concurrency (default 5)                                        | `LOG_WORKER_CONCURRENCY`, enforced in `LogWorker.tick`                                            |
| Processing    | Retry up to 3 times with exponential backoff                                | `LogWorker.processWithRetries` (1 initial + 3 retries)                                            |
| Processing    | Transient vs permanent failures (only transient retried)                    | `src/logs/transientProcessingError.ts`, `failureKind.ts`                                          |
| Processing    | Optional chaos decorator: lognormal latency, failure injection, outliers    | `src/logs/chaosLogProcessor.ts`, `chaosPolicy.ts` (enabled via `LOG_CHAOS_ENABLED`)               |
| Observability | `@opentelemetry/sdk-node`                                                   | `src/telemetry/tracing.ts` (started at module load)                                               |
| Observability | Child span per entry                                                        | `LogWorker.processAttempt` → `tracer.startActiveSpan('log.process', …)`                           |
| Observability | Attributes: `log.level`, `log.service`, `queue.depth`, `worker.retry_count` | `LogWorker.processAttempt`                                                                        |
| Observability | `recordException` + `setStatus(ERROR)` on failure                           | `LogWorker.processAttempt` catch block                                                            |
| Observability | Semantic-attribute promotion to top-level Pino fields                       | `src/logs/semanticAttributes.ts` (`http.*`, `user.*`, `payment.*`, `log.service`, …)              |
| Observability | Per-record service identity via `log.service → resource.service.name`       | `otelcol.yaml` (`groupbyattrs/log-service`, `transform/rename-log-service`)                       |
| Observability | Dash0 backend                                                               | `otelcol.yaml` (`otlp/dash0` exporter); see [Observability with Dash0](#observability-with-dash0) |
| Smoke         | Synthetic multi-service producer with named scenarios                       | `scripts/send-logs.mjs`, `scripts/producer/*`                                                     |

## How it works

```
  client
     │ POST /logs/json  (Bearer auth)
     ▼
  auth ─▶ rate limit ─▶ /logs/json route
                                │ enqueue
                                ▼
                        bounded LogQueue
                                │ dequeue
                                ▼
                         LogWorker pool
                 (concurrency=5, retry up to 3)
                                │
                 ┌──────────────┴──────────────┐
                 ▼                             ▼
              STDOUT             OTLP traces + logs + metrics
                                               │
                                               ▼
                                        OTel Collector
                                               │
                                               ▼
                                             Dash0
```

Each accepted request returns 202 immediately; work is drained asynchronously by the worker pool.

## Quick start

Requires [mise](https://mise.jdx.dev/) for the pinned Node + pnpm toolchain. On macOS: `brew install mise` (other platforms: see [getting started](https://mise.jdx.dev/getting-started.html)).

```sh
mise trust
mise install
mise run install
mise run dev
```

The service listens on port `3003` by default. Health check:

```sh
curl http://localhost:3003/
# {"name":"structured-log-service","version":"0.1.0"}
```

## Code tour

A short orientation for new readers — the highest-leverage files to start with:

1. `src/logs/logRoutes.ts` — the HTTP boundary: validation, queue enqueue, parent-context capture for the trace handoff.
2. `src/logs/logWorker.ts` — concurrency control, retry-with-backoff loop, and the `log.process` span with its OTel attributes.
3. `src/telemetry/tracing.ts` — `NodeSDK` wiring, why it must load before pino/express, and how the OTLP exporters are configured.
4. `src/auth/apiKeyStore.ts` and `src/rate-limit/rateLimiter.ts` — narrow interfaces in front of in-memory implementations, ready for a persistent / distributed swap.

## Observability with Dash0

The worker creates one span per log entry (`log.process`, `SpanKind.INTERNAL`) as a child of the HTTP request span. The parent context is captured at ingest in `logRoutes.ts` and re-entered in the worker with `context.with(entry.parentContext, …)`, so the trace stays intact across the queue hop.

**Span attributes set per entry** (chaos-prefixed rows only appear when `LOG_CHAOS_ENABLED=true`):

| Attribute                     | Source                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `log.level`                   | record `level`                                                                    |
| `log.service`                 | `meta.service` (via `getServiceName(entry)`)                                      |
| `queue.depth`                 | `LogQueue.depth()` at dispatch time                                               |
| `worker.retry_count`          | current retry index (0..maxRetries)                                               |
| `log.message.length`          | record `message.length`                                                           |
| `log.entry_id`                | UUID assigned at ingest                                                           |
| `client.id`                   | authenticated client id                                                           |
| `worker.processing_ms`        | measured per attempt                                                              |
| `worker.failure_kind`         | `none \| transient \| permanent`, classified in `LogWorker.processAttempt`        |
| `chaos.injected_latency_ms`   | (chaos only) milliseconds the decorator slept before delegating                   |
| `chaos.injected_failure_kind` | (chaos only) `none \| transient \| permanent`, set in `ChaosLogProcessor.process` |

On failure, the catch block calls `span.recordException(error)` and `span.setStatus({ code: SpanStatusCode.ERROR, message })` — visible in Dash0 as red spans with the exception payload attached.

**Logs are correlated automatically.** `@opentelemetry/instrumentation-pino` injects `trace_id`/`span_id` into every JSON log line on STDOUT and multistreams the same record to the OTel Logs SDK, so the OTLP log export carries the proto-level `traceId`/`spanId` set from the active span. Pivot from a `processed_log` line to its worker span in Dash0 by `trace_id`.

**What to look for in Dash0:**

- Filter spans by `status.code = ERROR` to see retry storms — the same `log.entry_id` will appear up to 4 times (1 initial + 3 retries) with increasing `worker.retry_count`.
- Group by `log.service` to attribute work to upstream emitters (`meta.service`).
- Sort by `worker.processing_ms` to spot slow records.
- Group by `worker.failure_kind` to separate retryable (`transient`) from non-retryable (`permanent`) failures. With chaos enabled in compose the decorator emits `chaos: simulated transient failure` and `chaos: simulated permanent failure`; the inner `StdoutLogProcessor` still emits `Simulated log processing failure` (client-flagged via `meta.simulate_processing_failure`) and `Injected artificial processing failure` (server-side via `LOG_PROCESSING_FAILURE_RATE_PCT`). Filter by `exception.message` to split the four populations.

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

```http
HTTP/1.1 202 Accepted
Content-Type: application/json

{ "accepted": 1, "queueDepth": 1 }
```

## Running tests

Mutation score is gated at ≥ 70%.

| Command                     | What it runs                                         |
| --------------------------- | ---------------------------------------------------- |
| `mise run test`             | Full suite (unit → integration → e2e).               |
| `mise run test:unit`        | Fast isolated tests in `test/unit`.                  |
| `mise run test:integration` | Subsystem boundary tests in `test/integration`.      |
| `mise run test:e2e`         | Live HTTP / process-level smoke flows in `test/e2e`. |
| `mise run test:mutate`      | Mutation testing (Stryker); must stay ≥ 70%. Slow.   |
| `mise run check`            | Lint + format check + typecheck.                     |

## Docker Compose smoke test

Exercises the full pipeline end-to-end: `smoke-producer → HTTP → app → queue → worker → chaos decorator → (STDOUT JSON + Pino → instrumentation-pino → OpenTelemetry Logs SDK → OTLP) → OpenTelemetry Collector → Dash0`. The Collector's `debug` exporter still prints locally even when Dash0 credentials are absent, so the pipeline is usable for local-only checks.

You will need a Dash0 account to see the data downstream:

```sh
cp .env.example .env
# Edit .env: set DASH0_OTLP_ENDPOINT and DASH0_AUTH_TOKEN

mise run compose:up                        # app + otelcol only
mise run compose:smoke                     # app + otelcol + synthetic producer (loadtest profile)
BATCH_LIMIT=200 mise run compose:smoke:once     # emit 200 batches then exit 0
SCENARIO=payment-outage mise run compose:smoke:scenario  # lock to one scenario
mise run compose:down                      # tear down, including loadtest containers
```

Without the `loadtest` profile you drive traffic with curl. With it, the `smoke-producer` container posts a batch every 500 ms across five simulated upstream services, cycling through named scenarios. Watch the Collector logs for `debug` exporter output and the app logs for `processed_log` lines with populated `trace_id`/`span_id`, then pivot on those IDs in Dash0.

The producer cycles four named scenarios that shape traffic, latency, and error rates:

| Scenario         | What it demonstrates                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| `baseline`       | Default mix across five services with ~78% info / 14% debug / 6% warn / 2% error.               |
| `checkout-spike` | `checkout-api` volume ×5 with elevated latency — exercises queue depth and the `503` shed path. |
| `payment-outage` | `payment-service` error rate jumps to ~60% with `payment.outcome=declined` — retry-burst story. |
| `db-degradation` | `inventory-service` latency ×5 — shows up as a long tail in trace-duration histograms.          |

What to look for in Dash0:

- **Service map.** `smoke-producer` feeds `log-ingestion-service`, which fans out into `checkout-api`, `payment-service`, `inventory-service`, `auth-service`, and `notification-service`. The five downstream services are simulated upstream callers reconstructed by the collector from the `log.service` attribute (`otelcol.yaml` `transform/rename-log-service`).
- **Distributed traces.** A `producer.send_batch` root span (`service.name=smoke-producer`) parents one or more `log.process` spans on the ingestion service. Pivot from any record's `trace_id`/`span_id` to see the full path.
- **Worker chaos signals.** The chaos decorator (enabled in compose by default, off otherwise) records `chaos.injected_latency_ms` and `chaos.injected_failure_kind` on each `log.process` span. Filter by `chaos.injected_failure_kind = permanent` to spot non-retryable failures, or by `chaos.injected_latency_ms > 2000` for the rare slow outliers that drive the queue-full path.
- **Per-service queries.**
  - `service.name = payment-service AND severity = ERROR` spikes only during the `payment-outage` window.
  - `service.name = inventory-service AND db.duration_ms > 200` lights up during `db-degradation`.
  - `service.name = checkout-api AND http.status_code = 503` correlates with `chaos.injected_latency_ms > 2000`.
- **Retry semantics.** `worker.failure_kind = transient` spans have `worker.retry_count > 0` paired children; `worker.failure_kind = permanent` ones do not retry. The `log_processing_failed` Pino line carries the final `attempts` count.

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
| `LOG_WORKER_RETRY_BACKOFF_BASE_MS`    | `50`                    | Base backoff before retrying a failed record. Doubles each retry: `base × 2^retryCount`.                                                                       |
| `LOG_WORKER_DRAIN_TIMEOUT_MS`         | `5000`                  | Maximum time the worker waits to drain the queue during shutdown.                                                                                              |
| `OTEL_SERVICE_NAME`                   | `log-ingestion-service` | `service.name` resource attribute reported to the OTel pipeline.                                                                                               |
| `OTEL_EXPORTER_OTLP_ENDPOINT`         | _(unset)_               | OTLP endpoint for the trace exporter. Omitting it disables the network exporter.                                                                               |
| `LOG_LEVEL`                           | `info`                  | Pino log level (`trace` … `fatal`).                                                                                                                            |

`OTEL_EXPORTER_OTLP_PROTOCOL` is read directly by the OpenTelemetry Node SDK (set to `http/protobuf` in `docker-compose.yml`); the service does not parse it.

### Chaos injection

The `ChaosLogProcessor` decorator wraps `StdoutLogProcessor` when `LOG_CHAOS_ENABLED=true` and injects latency, transient failures (retried), permanent failures (not retried), and rare slow outliers. The decorator is off by default in local dev and on by default in `docker-compose.yml`.

| Name                               | Default   | Description                                                                                         |
| ---------------------------------- | --------- | --------------------------------------------------------------------------------------------------- |
| `LOG_CHAOS_ENABLED`                | `false`   | Wraps `StdoutLogProcessor` with the chaos decorator at startup.                                     |
| `LOG_CHAOS_LATENCY_MEDIAN_MS`      | `20`      | Median of the lognormal latency distribution.                                                       |
| `LOG_CHAOS_LATENCY_P99_MS`         | `500`     | p99 of the lognormal latency distribution. Must be `>=` median.                                     |
| `LOG_CHAOS_OUTLIER_RATE`           | `0.005`   | Probability of replacing the lognormal sample with a uniform outlier (drives queue-full scenarios). |
| `LOG_CHAOS_OUTLIER_MIN_MS`         | `2000`    | Lower bound of the outlier range.                                                                   |
| `LOG_CHAOS_OUTLIER_MAX_MS`         | `5000`    | Upper bound of the outlier range. Must be `>=` min.                                                 |
| `LOG_CHAOS_TRANSIENT_FAILURE_RATE` | `0.02`    | Probability of throwing `TransientProcessingError` (worker retries).                                |
| `LOG_CHAOS_PERMANENT_FAILURE_RATE` | `0.002`   | Probability of throwing a non-retryable error. Combined with transient must be `<= 1`.              |
| `LOG_CHAOS_SEED`                   | _(unset)_ | Optional integer seed for the chaos RNG. When unset, uses `Math.random` (non-reproducible).         |

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

- **In-memory bounded queue, behind a narrow interface.** `LogQueue` is replaceable with Kafka / Redis Streams / SQS without touching routes or worker.
- **Honest backpressure.** Rate limiter returns `429`, queue overflow returns `503 queue_full`, both with `Retry-After`, so clients back off cleanly instead of guessing.
- **Retry semantics are explicit.** `LOG_WORKER_MAX_RETRIES=3` means 1 initial + 3 retries = 4 attempts. Backoff is `base × 2^retryCount`. Only `TransientProcessingError` triggers retries; any other thrown error fails on the first attempt and is recorded on the span as `worker.failure_kind=permanent`.
- **Pluggable processor.** `LogWorker` depends on the `LogProcessor` interface, not on a concrete implementation. The chaos decorator (`ChaosLogProcessor`) wraps `StdoutLogProcessor` in `src/app.ts` when `LOG_CHAOS_ENABLED=true`. The chaos _policy_ is a pure module (`src/logs/chaosPolicy.ts`) with a seedable RNG so the decision logic is deterministic in tests.
- **Multi-service identity in Dash0.** The processor promotes a fixed list of OTel semantic keys (`http.method`, `user.id`, `payment.amount`, …) from `meta` to top-level Pino fields so `instrumentation-pino` exposes them as first-class log record attributes. The Collector then pivots the per-record `log.service` attribute to `resource.service.name` (`otelcol.yaml` `groupbyattrs/log-service` + `transform/rename-log-service`), so each simulated upstream service shows up as its own Dash0 service.
- **Pluggable auth and rate limit.** `ApiKeyStore` and `RateLimiter` are interfaces; in-memory implementations cover today's needs, persistent / distributed variants drop in behind the same shape.
- **OTel + Pino correlation, not just trace export.** `instrumentation-pino` injects `trace_id`/`span_id` into STDOUT JSON _and_ multistreams to the OTel Logs SDK so OTLP log records carry proto-level `traceId`/`spanId`. SDK starts at module load so the require-time patch is in place before `pino` is first required.
- **Drain on shutdown.** SIGTERM closes the HTTP server, runs `worker.drain(timeoutMs)` (event-driven race against a timer), then shuts down the OTel SDK. In-flight batches survive rolling deploys.
- **`/livez` vs `/readyz` are different concerns.** Liveness is restart-only (process up); readiness is load-shed-only (worker running, queue below high-water mark). Kubernetes pulls a saturated pod from the Service backend without restarting it.

## Production follow-ups

Known gaps for production scale. Each is unblocked by the abstractions already in place.

| Follow-up                                               | Notes                                                                               |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Durable queue + DLQ (Kafka / Redis Streams / SQS)       | In-memory queue is sufficient at current scale; `LogQueue` interface fits the swap. |
| Hashed, persistent API-key store (Postgres + argon2)    | `ApiKeyStore` is async — swap is mechanical.                                        |
| Distributed sliding-window rate limiter (Redis)         | Single-instance fixed window is sufficient at current scale; `RateLimiter` fits.    |
| Idempotency keys / batch-level deduplication            | Needs a request-id contract with the producer.                                      |
| Multi-instance retry backoff with jitter                | Single-process retries don't need anti-thundering-herd jitter.                      |
| `InMemorySpanExporter` integration tests for span shape | Span attributes covered indirectly via worker unit tests; would harden CI.          |
| Per-tenant fairness via round-robin sub-queues          | A single noisy client can currently starve others under saturation.                 |
| Per-IP pre-auth rate limit                              | Today the rate limit is per authenticated client; pre-auth ingress is open.         |

## License

Licensed under the Apache License 2.0. See `LICENSE` for details.
