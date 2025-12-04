import type { ApiErrorBody, ApiErrorCode, Pagination } from '@musematch/shared';
import { DEV_USER_ID, env } from '@/lib/env';

/**
 * The single HTTP entry point.
 *
 * Every request goes through here, which is what makes two guarantees cheap:
 * the access token is attached in exactly one place, and every failure
 * surfaces as an `ApiError` carrying the server's code and message rather than
 * as a bare `Response` each caller has to interpret.
 */

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: Record<string, string[]> | undefined;

  constructor(status: number, body: ApiErrorBody['error']) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }

  /** True when retrying could plausibly help, e.g. a museum was briefly down. */
  get isTransient(): boolean {
    return this.code === 'UPSTREAM_UNAVAILABLE' || this.status >= 500;
  }
}

/**
 * Supplies the current access token.
 *
 * Set by the auth provider on sign-in. A function rather than a stored string
 * so a refreshed token is picked up without re-wiring the client.
 */
let getAccessToken: () => string | null = () => null;

export function setAccessTokenProvider(provider: () => string | null): void {
  getAccessToken = provider;
}

export interface ListResult<T> {
  data: T[];
  pagination: Pagination;
}

type QueryValue = string | number | boolean | undefined | null;

export function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `?${query}` : '';
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };

  if (options.body !== undefined) headers['content-type'] = 'application/json';

  const token = getAccessToken();
  if (token) {
    headers['authorization'] = `Bearer ${token}`;
  } else if (env.devAuthBypass) {
    // Development only. The server refuses this header unless it, too, has
    // DEV_AUTH_BYPASS enabled, and never in production.
    headers['x-dev-user'] = DEV_USER_ID;
  }

  let response: Response;

  try {
    response = await fetch(`${env.apiBaseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, {
      code: 'UPSTREAM_UNAVAILABLE',
      message: 'Could not reach MuseMatch. Check that the API is running.',
    });
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const body = (payload as ApiErrorBody | null)?.error;
    throw new ApiError(
      response.status,
      body ?? { code: 'INTERNAL_ERROR', message: 'Something went wrong.' },
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, signal ? { signal } : {}),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
