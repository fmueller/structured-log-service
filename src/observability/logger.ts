import pino from 'pino';

import { config } from '../config';

export const loggerOptions: pino.LoggerOptions = {
  level: config.logging.level,
  redact: {
    paths: ['req.headers.authorization', '*.authorization'],
    censor: '[REDACTED]',
  },
};

// @opentelemetry/instrumentation-pino wraps the default stdout stream with a
// multistream that also feeds the OpenTelemetry Logs SDK, so logs reach OTLP
// without a separate worker-thread transport. The instrumentation is installed
// from src/telemetry/tracing.ts at module load.
export const logger: pino.Logger = pino(loggerOptions);
