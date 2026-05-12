// Telemetry is imported and started before any other module so the
// OpenTelemetry require-hook instrumentations patch pino and http before
// those modules are pulled in via the dynamic imports below.
import { startTelemetry } from './telemetry/tracing';

async function main(): Promise<void> {
  await startTelemetry();

  const { createApp } = await import('./app');
  const { config } = await import('./config');
  const { logger } = await import('./observability/logger');

  const app = createApp();
  app.listen(config.port, () => {
    logger.info({ port: config.port }, 'Server started');
  });
}

main().catch((error: unknown) => {
  console.error('Failed to start service', error);
  process.exit(1);
});
