import type { ApiErrorCode } from '@musematch/shared';

/**
 * The only error type controllers and services should throw deliberately.
 * The error middleware maps it to the standard error envelope; anything else
 * that escapes becomes a generic 500 with no internal detail leaked.
 */
export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: Record<string, string[]>;

  constructor(
    code: ApiErrorCode,
    message: string,
    status: number,
    options: { details?: Record<string, string[]>; cause?: unknown } = {},
  ) {
    // `cause` uses the standard Error field, so it survives logging by pino.
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    if (options.details) this.details = options.details;
  }

  static badRequest(message: string, details?: Record<string, string[]>): AppError {
    return new AppError('BAD_REQUEST', message, 400, details ? { details } : {});
  }

  static validation(message: string, details: Record<string, string[]>): AppError {
    return new AppError('VALIDATION_ERROR', message, 422, { details });
  }

  static unauthorized(message = 'Authentication required.'): AppError {
    return new AppError('UNAUTHORIZED', message, 401);
  }

  static forbidden(message = 'You do not have access to this resource.'): AppError {
    return new AppError('FORBIDDEN', message, 403);
  }

  static notFound(message = 'Resource not found.'): AppError {
    return new AppError('NOT_FOUND', message, 404);
  }

  static conflict(message: string): AppError {
    return new AppError('CONFLICT', message, 409);
  }

  static upstream(message: string, cause?: unknown): AppError {
    return new AppError('UPSTREAM_UNAVAILABLE', message, 502, { cause });
  }

  static internal(message = 'Something went wrong.', cause?: unknown): AppError {
    return new AppError('INTERNAL_ERROR', message, 500, { cause });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
