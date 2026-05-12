// IMPORTANT: tracing.ts must be imported BEFORE pino, express, or http so the
// OpenTelemetry require-hook instrumentations can patch them at require time.
import { startTelemetry } from './telemetry/tracing';

import { createApp } from './app';
import { config } from './config';
import { logger } from './observability/logger';

async function main(): Promise<void> {
  const telemetry = await startTelemetry();
  const { app, worker } = createApp();

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'server started');
  });

  async function shutdown(signal: NodeJS.Signals): Promise<void> {
    logger.info({ signal }, 'shutting down');
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    const drainResult = await worker.drain(config.worker.drainTimeoutMs);
    if (drainResult.timedOut) {
      logger.warn(
        { remaining: drainResult.remainingQueueDepth },
        'drain timed out with queued entries still pending',
      );
    }
    await telemetry.shutdown();
    process.exit(0);
  }

  function handleSignal(signal: NodeJS.Signals): void {
    shutdown(signal).catch((error: unknown) => {
      logger.error({ err: error, signal }, 'shutdown failed');
      process.exit(1);
    });
  }

  process.on('SIGTERM', () => handleSignal('SIGTERM'));
  process.on('SIGINT', () => handleSignal('SIGINT'));
}

main().catch((error: unknown) => {
  // pino logger may not be initialized if startup failed early; emit raw JSON.
  console.error(
    JSON.stringify({
      level: 'error',
      message: 'Fatal startup error',
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exit(1);
});
