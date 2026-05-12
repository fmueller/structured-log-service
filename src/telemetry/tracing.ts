// IMPORTANT: This module must be imported BEFORE pino, express, or http
// (i.e. before any other module in src/index.ts) so the OpenTelemetry
// instrumentations can patch them at require time. The SDK is started at
// module load — `instrumentation-pino` needs to install its require hook
// before `pino` is first required, otherwise log correlation and log
// sending silently no-op.

import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

import { config } from '../config';

function buildSdk(): NodeSDK {
  const endpoint = config.otel.exporterEndpoint;

  return new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.otel.serviceName,
    }),
    traceExporter: endpoint ? new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }) : undefined,
    metricReaders: endpoint
      ? [
          new PeriodicExportingMetricReader({
            exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
          }),
        ]
      : undefined,
    // When endpoint is set, leave logRecordProcessors unset so NodeSDK
    // auto-configures an OTLP log exporter from OTEL_EXPORTER_OTLP_ENDPOINT.
    // When unset, force an empty list to suppress the SDK's default fallback
    // to http://localhost:4318/v1/logs.
    logRecordProcessors: endpoint ? undefined : [],
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });
}

export const sdk: NodeSDK = buildSdk();
sdk.start();
