import pino from 'pino';

import { config } from '../config';

export const loggerOptions: pino.LoggerOptions = {
  level: config.logging.level,
  redact: {
    paths: ['req.headers.authorization', '*.authorization'],
    censor: '[REDACTED]',
  },
};

export const logger: pino.Logger = pino(loggerOptions);
