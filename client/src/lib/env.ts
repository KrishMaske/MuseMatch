/**
 * Client configuration.
 *
 * The only module that reads `import.meta.env`, so what the app can be
 * configured with is visible in one place.
 */

const raw = import.meta.env;

function optional(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export const env = {
  apiBaseUrl: optional(raw.VITE_API_BASE_URL) ?? 'http://localhost:4000/api',
  supabaseUrl: optional(raw.VITE_SUPABASE_URL),
  supabaseAnonKey: optional(raw.VITE_SUPABASE_ANON_KEY),
  /**
   * Mirrors the server's DEV_AUTH_BYPASS. When on, the app runs against seed
   * data with a fixed development identity and never contacts Supabase.
   */
  devAuthBypass: optional(raw.VITE_DEV_AUTH_BYPASS) === 'true',
} as const;

/** True when a real Supabase project is configured to sign users in. */
export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);

export const DEV_USER_ID = 'dev-user-0000-0000-0000-000000000001';
