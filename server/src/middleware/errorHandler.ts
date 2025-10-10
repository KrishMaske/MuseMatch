import type { NextFunction, Request, Response } from 'express';
import type { ApiErrorBody } from '@musematch/shared';
import { Prisma } from '@prisma/client';
import { logger } from '../config/logger.js';
import { AppError, isAppError } from '../utils/errors.js';

/**
 * The single place an error becomes an HTTP response.
 *
 * Clients get a code, a sentence they can show a person, and field details for
 * validation failures. Stack traces and Prisma internals stay in the log.
 */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response<ApiErrorBody>,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  const appError = toAppError(error);

  if (appError.status >= 500) {
    logger.error({ err: appError.cause ?? error, code: appError.code }, appError.message);
  } else {
    logger.debug({ code: appError.code }, appError.message);
  }

  res.status(appError.status).json({
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details ? { details: appError.details } : {}),
    },
  });
}

function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        return AppError.conflict('That already exists.');
      case 'P2025':
        return AppError.notFound();
      case 'P2003':
        return AppError.badRequest('A referenced record does not exist.');
      default:
        return AppError.internal('A database error occurred.', error);
    }
  }

  if (error instanceof SyntaxError && 'body' in error) {
    return AppError.badRequest('Request body is not valid JSON.');
  }

  return AppError.internal('Something went wrong.', error);
}

/** 404 for unmatched routes, so the client always sees the standard envelope. */
export function notFoundHandler(req: Request, res: Response<ApiErrorBody>): void {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` },
  });
}
