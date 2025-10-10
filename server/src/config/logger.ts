import pino from 'pino';
import { env, isProduction, isTest } from './env.js';

/**
 * Application logger.
 *
 * `redact` is the backstop for the rule that tokens and keys never reach the
 * log; call sites should still avoid passing them in the first place.
 */
export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-dev-user"]',
      'headers.authorization',
      'accessToken',
      'token',
      'apiKey',
      '*.apiKey',
      'password',
    ],
    censor: '[redacted]',
  },
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
});

/** Child loggers so each subsystem's noise can be filtered independently. */
export const museumLogger = logger.child({ scope: 'museum' });
export const recommendationLogger = logger.child({ scope: 'recommendations' });
export const itineraryLogger = logger.child({ scope: 'itinerary' });
export const embeddingLogger = logger.child({ scope: 'embeddings' });
