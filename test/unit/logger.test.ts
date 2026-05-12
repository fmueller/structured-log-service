import { Writable } from 'node:stream';

import pino from 'pino';
import { describe, expect, it } from 'vitest';

import { loggerOptions } from '../../src/observability/logger';

interface CapturedLogger {
  logger: pino.Logger;
  lines: () => Record<string, unknown>[];
}

function captureLogger(options: pino.LoggerOptions): CapturedLogger {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, cb) {
      chunks.push(String(chunk));
      cb();
    },
  });

  const logger = pino(options, stream);

  return {
    logger,
    lines: () =>
      chunks
        .flatMap((c) => c.split('\n'))
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

describe('logger', () => {
  it('emits JSON with level + msg + custom fields', () => {
    const { logger, lines } = captureLogger(loggerOptions);

    logger.info({ a: 1 }, 'hi');

    const captured = lines();
    expect(captured).toHaveLength(1);

    const entry = captured[0];
    expect(entry.level).toBe(30);
    expect(entry.msg).toBe('hi');
    expect(entry.a).toBe(1);
    expect(typeof entry.time).toBe('number');
    expect(Number.isFinite(entry.time)).toBe(true);
  });

  it('LOG_LEVEL=warn suppresses info', () => {
    const { logger, lines } = captureLogger({ ...loggerOptions, level: 'warn' });

    logger.info({ ignored: true }, 'should-not-appear');
    expect(lines()).toHaveLength(0);

    logger.warn({ kept: true }, 'visible');
    const captured = lines();
    expect(captured).toHaveLength(1);
    expect(captured[0].msg).toBe('visible');
    expect(captured[0].level).toBe(40);
  });

  it('err: Error serializes to { type, message, stack }', () => {
    const { logger, lines } = captureLogger(loggerOptions);

    logger.error({ err: new Error('boom') }, 'x');

    const captured = lines();
    expect(captured).toHaveLength(1);

    const err = captured[0].err as { type: string; message: string; stack: string };
    expect(err.type).toBe('Error');
    expect(err.message).toBe('boom');
    expect(typeof err.stack).toBe('string');
    expect(err.stack.length).toBeGreaterThan(0);
  });

  it('redacts authorization fields', () => {
    const { logger, lines } = captureLogger(loggerOptions);

    logger.info({ req: { headers: { authorization: 'Bearer secret' } } }, 'x');

    const captured = lines();
    expect(captured).toHaveLength(1);

    const req = captured[0].req as { headers: { authorization: string } };
    expect(req.headers.authorization).toBe('[REDACTED]');
  });
});
