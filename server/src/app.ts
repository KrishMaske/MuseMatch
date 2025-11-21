import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { env, isTest } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { apiRouter } from './routes/index.js';

/**
 * Assembles the Express application.
 *
 * Kept separate from `index.ts` so tests can mount the app with supertest
 * without binding a port.
 */
export function createApp(): Express {
  const app = express();

  // Behind a proxy, rate limiting needs the real client IP.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN.split(',').map((origin) => origin.trim()),
      credentials: true,
    }),
  );

  // Nothing this API accepts is large; the cap keeps a malformed or hostile
  // body from being parsed into memory.
  app.use(express.json({ limit: '128kb' }));

  if (!isTest) {
    app.use(requestLogger);
  }

  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: { code: 'BAD_REQUEST', message: 'Too many requests. Try again shortly.' } },
      skip: () => isTest,
    }),
  );

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
