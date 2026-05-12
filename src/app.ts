import express, { Application, Request, Response } from 'express';

export function createApp(): Application {
  const app = express();

  app.use(express.json());

  app.get('/', (_req: Request, res: Response) => {
    res.json({ name: 'structured-log-service', status: 'ok' });
  });

  return app;
}
