import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { env, isProduction } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/errors.js';

/**
 * Verifies Supabase Auth access tokens.
 *
 * Two strategies, chosen by configuration:
 *
 *   - `SUPABASE_JWT_SECRET` set  -> local HS256 verification, no network call.
 *   - otherwise                  -> the project's remote JWKS, for projects
 *                                   using asymmetric signing keys.
 *
 * Either way the identity the rest of the app sees comes from a verified
 * signature. A user id in a request body is never trusted.
 */

export interface AuthenticatedIdentity {
  supabaseUserId: string;
  email: string | null;
}

const AUTH_ISSUER = env.SUPABASE_URL ? `${env.SUPABASE_URL}/auth/v1` : undefined;

let jwks: JWTVerifyGetKey | undefined;

function getJwks(): JWTVerifyGetKey {
  if (!AUTH_ISSUER) {
    throw AppError.internal(
      'Token verification is not configured: set SUPABASE_URL or SUPABASE_JWT_SECRET.',
    );
  }
  jwks ??= createRemoteJWKSet(new URL(`${AUTH_ISSUER}/.well-known/jwks.json`));
  return jwks;
}

function identityFromPayload(payload: JWTPayload): AuthenticatedIdentity {
  const supabaseUserId = typeof payload.sub === 'string' ? payload.sub : null;
  if (!supabaseUserId) {
    throw AppError.unauthorized('Token is missing a subject claim.');
  }

  const email = typeof payload.email === 'string' ? payload.email : null;
  return { supabaseUserId, email };
}

export async function verifyAccessToken(token: string): Promise<AuthenticatedIdentity> {
  try {
    if (env.SUPABASE_JWT_SECRET) {
      const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);
      const { payload } = await jwtVerify(token, secret, {
        // Supabase issues `authenticated` as the audience for signed-in users.
        audience: 'authenticated',
        ...(AUTH_ISSUER ? { issuer: AUTH_ISSUER } : {}),
      });
      return identityFromPayload(payload);
    }

    const { payload } = await jwtVerify(token, getJwks(), {
      audience: 'authenticated',
      ...(AUTH_ISSUER ? { issuer: AUTH_ISSUER } : {}),
    });
    return identityFromPayload(payload);
  } catch (error) {
    if (error instanceof AppError) throw error;
    // The token itself never reaches the log.
    logger.debug({ err: error }, 'Access token verification failed');
    throw AppError.unauthorized('Your session is invalid or has expired.');
  }
}

/**
 * Development-only identity, used when DEV_AUTH_BYPASS is on so the app can be
 * driven against seed data with no Supabase project. Hard-refused in
 * production by `assertSafeConfig`, and again here as a second line.
 */
export function devIdentity(header: string | undefined): AuthenticatedIdentity {
  if (isProduction || !env.DEV_AUTH_BYPASS) {
    throw AppError.unauthorized();
  }

  const supabaseUserId = header?.trim() || 'dev-user-0000-0000-0000-000000000001';
  return { supabaseUserId, email: `${supabaseUserId}@musematch.local` };
}

export function extractBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const [scheme, token] = authorization.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim() || null;
}
