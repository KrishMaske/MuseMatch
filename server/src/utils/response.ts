import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ApiSuccess, Pagination } from '@musematch/shared';

/** Wraps a value in the standard `{ data }` envelope. */
export function sendData<T>(res: Response, data: T, status = 200): void {
  const body: ApiSuccess<T> = { data };
  res.status(status).json(body);
}

export function sendList<T>(res: Response, data: T[], pagination: Pagination, status = 200): void {
  const body: ApiSuccess<T[]> = { data, pagination };
  res.status(status).json(body);
}

export function buildPagination(page: number, limit: number, total: number): Pagination {
  return { page, limit, total, hasMore: page * limit < total };
}

/**
 * Forwards rejected promises from async handlers to the error middleware.
 * Express 4 does not do this itself, and an unhandled rejection here would
 * hang the request instead of returning an error envelope.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
