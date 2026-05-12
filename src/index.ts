import { createApp } from './app';
import { config } from './config';
import { logger } from './observability/logger';

const app = createApp();

app.listen(config.port, () => {
  logger.info({ port: config.port }, 'Server started');
});
