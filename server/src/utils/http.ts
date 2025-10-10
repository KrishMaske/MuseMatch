import { AppError } from './errors.js';

export interface FetchJsonOptions {
  timeoutMs: number;
  headers?: Record<string, string>;
  /** Label used in error messages, e.g. "The Met". */
  label: string;
  signal?: AbortSignal;
}

/**
 * `fetch` with a hard timeout and JSON parsing, used for every outbound call.
 *
 * Failures surface as UPSTREAM_UNAVAILABLE so callers can decide whether to
 * degrade (drop one museum from the results) or fail the request.
 */
export async function fetchJson<T>(url: string, options: FetchJsonOptions): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json', ...options.headers },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw AppError.upstream(`${options.label} responded with ${response.status}.`, {
        url,
        status: response.status,
      });
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof AppError) throw error;

    if (error instanceof Error && error.name === 'AbortError') {
      throw AppError.upstream(`${options.label} timed out after ${options.timeoutMs}ms.`, { url });
    }

    throw AppError.upstream(`${options.label} is unreachable.`, error);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Runs promises with a concurrency ceiling.
 *
 * The Met's search endpoint returns ids only, so detail hydration means one
 * request per artwork. This keeps that from turning into a hundred parallel
 * connections.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index];
      if (item === undefined) continue;
      results[index] = await worker(item, index);
    }
  });

  await Promise.all(runners);
  return results;
}
