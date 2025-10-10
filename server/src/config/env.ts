import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

/**
 * All environment access happens here.
 *
 * Nothing else in the server reads `process.env`, so the set of knobs the app
 * has is exactly the shape below.
 */

// One .env at the repo root serves both workspaces, so the server resolves it
// relative to this file rather than to whatever cwd npm happened to use.
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
for (const candidate of [
  path.resolve(moduleDir, '../../../.env'),
  path.resolve(moduleDir, '../../.env'),
]) {
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}

const booleanish = z
  .string()
  .optional()
  .transform((value) => value === 'true' || value === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),

  // Identity. SUPABASE_JWT_SECRET enables fast local HS256 verification;
  // without it the auth service falls back to the project's remote JWKS.
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_JWT_SECRET: z.string().optional(),

  /**
   * Development escape hatch: accept a `x-dev-user` header instead of a real
   * token so the app can be run against seed data with no Supabase project.
   * Refused outright in production (see assertSafeConfig below).
   */
  DEV_AUTH_BYPASS: booleanish,

  // Embeddings.
  EMBEDDING_PROVIDER: z.enum(['openai', 'local']).optional(),
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  OPENAI_API_KEY: z.string().optional(),

  // Museum providers.
  MET_API_BASE_URL: z
    .string()
    .url()
    .default('https://collectionapi.metmuseum.org/public/collection/v1'),
  AIC_API_BASE_URL: z.string().url().default('https://api.artic.edu/api/v1'),
  MUSEUM_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  MUSEUM_USER_AGENT: z.string().default('MuseMatch/0.1 (educational project)'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  // A key present but blank in .env means "not configured", not "empty string".
  const source = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== undefined && value !== ''),
  );

  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (issue) => `  - ${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
  }

  return parsed.data;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/**
 * The embedding provider actually in use. Falling back to the deterministic
 * local provider means semantic search still works offline, just less well.
 */
export const embeddingProvider: 'openai' | 'local' =
  env.EMBEDDING_PROVIDER ?? (env.OPENAI_API_KEY ? 'openai' : 'local');

/** Dimensionality of the `artworks.embedding` column. Changing it needs a migration. */
export const EMBEDDING_DIMENSIONS = 1536;

export function assertSafeConfig(): void {
  if (isProduction && env.DEV_AUTH_BYPASS) {
    throw new Error('DEV_AUTH_BYPASS must not be enabled in production.');
  }
  if (isProduction && !env.SUPABASE_URL && !env.SUPABASE_JWT_SECRET) {
    throw new Error(
      'Production requires SUPABASE_URL or SUPABASE_JWT_SECRET for token verification.',
    );
  }
}
