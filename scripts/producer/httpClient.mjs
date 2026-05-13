// HTTP client that sends log batches to the ingestion endpoint.
// Instruments each send with an OTel span and injects traceparent.

import { SpanKind, SpanStatusCode, context, propagation } from '@opentelemetry/api';

/**
 * @param {object} config  Frozen config from parseConfig()
 * @param {import('@opentelemetry/api').Tracer} tracer
 */
export function createHttpClient(config, tracer) {
  return {
    sendBatch(records) {
      return tracer.startActiveSpan(
        'producer.send_batch',
        {
          kind: SpanKind.CLIENT,
          attributes: {
            'batch.size': records.length,
            'http.url': config.ingestionUrl,
            'http.method': 'POST',
          },
        },
        async (span) => {
          const headers = {
            'content-type': 'application/json',
            authorization: `Bearer ${config.apiKey}`,
          };
          propagation.inject(context.active(), headers);

          try {
            const response = await fetch(config.ingestionUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify(records),
            });

            span.setAttribute('http.status_code', response.status);
            if (response.ok) {
              span.setStatus({ code: SpanStatusCode.OK });
            } else {
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: `HTTP ${String(response.status)}`,
              });
            }
            span.end();

            return { status: response.status, ok: response.ok };
          } catch (err) {
            span.recordException(err);
            span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
            span.end();
            return { status: 0, ok: false, error: err.message };
          }
        },
      );
    },
  };
}
