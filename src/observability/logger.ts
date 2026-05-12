import pino from 'pino';

import { config } from '../config';

export const loggerOptions: pino.LoggerOptions = {
  level: config.logging.level,
  redact: {
    paths: ['req.headers.authorization', '*.authorization'],
    censor: '[REDACTED]',
  },
};

function buildTransport(): pino.DestinationStream | undefined {
  if (!config.otel.exporterEndpoint) {
    return undefined;
  }

  const transport = pino.transport({
    targets: [
      { target: 'pino/file', options: { destination: 1 }, level: config.logging.level },
      { target: 'pino-opentelemetry-transport', options: {}, level: config.logging.level },
    ],
  });

  // pino-opentelemetry-transport occasionally drops the first log records
  // before its worker thread finishes booting. Dash0's troubleshooting docs
  // recommend a short sleep here. We do it synchronously because module load
  // is synchronous and callers expect `logger` to be ready as soon as this
  // module is imported.
  const waitBuf = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(waitBuf, 0, 0, 1_000);

  return transport;
}

const transport = buildTransport();

export const logger: pino.Logger = transport ? pino(loggerOptions, transport) : pino(loggerOptions);
