import type { NextFunction, Request, Response } from 'express';
import { logger } from '../config/logger.js';

/**
 * One line per request.
 *
 *   GET /api/recommendations?limit=16 200 278ms
 *
 * Deliberately hand-rolled rather than `pino-http`: its default serializers
 * print every request and response header on every call, which buries the
 * lines that actually matter -- a failing query, a slow museum call -- under
 * forty lines of CSP and rate-limit headers. Nothing here needs per-request
 * child loggers, so a dozen lines replace the dependency entirely.
 *
 * Level follows the outcome, so `LOG_LEVEL=warn` shows only what went wrong.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // The health check is polled by tooling and would otherwise dominate.
  if (req.originalUrl === '/api/health') {
    next();
    return;
  }

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const message = `${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(0)}ms`;

    if (res.statusCode >= 500) logger.error(message);
    else if (res.statusCode >= 400) logger.warn(message);
    else logger.info(message);
  });

  next();
}
