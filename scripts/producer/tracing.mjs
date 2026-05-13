// OpenTelemetry SDK initialization for the smoke producer.

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { trace } from '@opentelemetry/api';

/**
 * @param {string|null} otlpEndpoint
 * @returns {{ tracer: import('@opentelemetry/api').Tracer, sdk: NodeSDK }}
 */
export function initTracing(otlpEndpoint) {
  const resource = new Resource({
    [ATTR_SERVICE_NAME]: 'smoke-producer',
  });

  const sdkOptions = { resource };

  if (otlpEndpoint) {
    sdkOptions.traceExporter = new OTLPTraceExporter({
      url: `${otlpEndpoint}/v1/traces`,
    });
  }

  const sdk = new NodeSDK(sdkOptions);
  sdk.start();

  const tracer = trace.getTracer('smoke-producer', '1.0.0');

  return { tracer, sdk };
}
