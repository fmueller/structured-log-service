// IMPORTANT: This module must be imported BEFORE pino, express, or http
// (i.e. before any other module in src/index.ts) so the OpenTelemetry
// instrumentations can patch them at require time.

import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

import { config } from '../config';

export async function startTelemetry(): Promise<NodeSDK> {
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.otel.serviceName,
    }),
    traceExporter: config.otel.exporterEndpoint
      ? new OTLPTraceExporter({
          url: `${config.otel.exporterEndpoint}/v1/traces`,
        })
      : undefined,
    instrumentations: [new HttpInstrumentation(), new PinoInstrumentation()],
  });

  await sdk.start();

  return sdk;
}
