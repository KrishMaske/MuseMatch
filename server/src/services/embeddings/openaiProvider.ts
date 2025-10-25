import { EMBEDDING_DIMENSIONS, env } from '../../config/env.js';
import { AppError } from '../../utils/errors.js';
import type { EmbeddingProvider } from './types.js';

interface OpenAiEmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
}

const API_URL = 'https://api.openai.com/v1/embeddings';
const REQUEST_TIMEOUT_MS = 20_000;
/** OpenAI accepts far more per call, but smaller batches fail more cheaply. */
const MAX_BATCH = 64;

/**
 * OpenAI embeddings.
 *
 * Called through `fetch` rather than the SDK: this is one endpoint with a
 * stable shape, and the provider interface already isolates it, so a dependency
 * would buy nothing here.
 */
export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  readonly name = `openai:${env.EMBEDDING_MODEL}`;
  readonly dimensions = EMBEDDING_DIMENSIONS;

  async createEmbedding(text: string): Promise<number[]> {
    const [embedding] = await this.createEmbeddings([text]);
    if (!embedding) throw AppError.upstream('The embedding provider returned no vector.');
    return embedding;
  }

  async createEmbeddings(texts: string[]): Promise<number[][]> {
    if (!env.OPENAI_API_KEY) {
      throw AppError.internal('OPENAI_API_KEY is not configured.');
    }
    if (texts.length === 0) return [];

    const results: number[][] = [];

    for (let offset = 0; offset < texts.length; offset += MAX_BATCH) {
      const batch = texts.slice(offset, offset + MAX_BATCH);
      const response = await this.requestBatch(batch);
      results.push(...response);
    }

    return results;
  }

  private async requestBatch(batch: string[]): Promise<number[][]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: env.EMBEDDING_MODEL,
          input: batch,
          dimensions: this.dimensions,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        // The body may echo request content; only the status is surfaced.
        throw AppError.upstream(`Embedding provider responded with ${response.status}.`);
      }

      const payload = (await response.json()) as OpenAiEmbeddingResponse;
      return [...payload.data].sort((a, b) => a.index - b.index).map((item) => item.embedding);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw AppError.upstream('The embedding provider timed out.');
      }
      throw AppError.upstream('The embedding provider is unreachable.', error);
    } finally {
      clearTimeout(timeout);
    }
  }
}
