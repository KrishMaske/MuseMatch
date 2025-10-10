import type { NextFunction, Request, Response } from 'express';
import type { User } from '@prisma/client';
import { env } from '../config/env.js';
import { devIdentity, extractBearerToken, verifyAccessToken } from '../services/authService.js';
import { userService } from '../services/userService.js';
import { AppError } from '../utils/errors.js';

/**
 * Establishes who is making the request.
 *
 * Everything private in the API sits behind this. The resulting `req.user` is
 * the only source of identity in the app -- controllers never read a user id
 * out of params or a body.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractBearerToken(req.headers.authorization);

    const identity = token
      ? await verifyAccessToken(token)
      : env.DEV_AUTH_BYPASS
        ? devIdentity(req.header('x-dev-user'))
        : null;

    if (!identity) {
      throw AppError.unauthorized();
    }

    req.user = await userService.findOrCreate(identity);
    next();
  } catch (error) {
    next(error);
  }
}

/** Narrows `req.user` for handlers that run behind `requireAuth`. */
export function currentUser(req: Request): User {
  if (!req.user) {
    throw AppError.unauthorized();
  }
  return req.user;
}
