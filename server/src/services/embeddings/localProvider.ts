import { createHash } from 'node:crypto';
import { EMBEDDING_DIMENSIONS } from '../../config/env.js';
import type { EmbeddingProvider } from './types.js';

/**
 * A deterministic, offline embedding provider.
 *
 * This is a hashed bag-of-words projection, not a learned model. It captures
 * lexical overlap -- "dark dramatic painting" lands near records using those
 * words -- and nothing more: it has no idea that "melancholy" and "sombre" are
 * related. It exists so that the whole vector-search path (backfill, storage,
 * pgvector similarity, hybrid reranking) can be developed, seeded and tested
 * without an API key, and so a missing key degrades search rather than
 * breaking it.
 *
 * Set OPENAI_API_KEY to get real semantic behavior.
 */
export class LocalHashEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'local-hash';
  readonly dimensions = EMBEDDING_DIMENSIONS;

  async createEmbedding(text: string): Promise<number[]> {
    return this.embed(text);
  }

  async createEmbeddings(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.embed(text));
  }

  private embed(text: string): number[] {
    const vector = new Array<number>(this.dimensions).fill(0);
    const tokens = tokenize(text);
    if (tokens.length === 0) return vector;

    const counts = new Map<string, number>();
    for (const token of tokens) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }

    for (const [token, count] of counts) {
      // Two hashed positions per token reduce the effect of collisions, and a
      // signed contribution keeps unrelated tokens from all pushing one way.
      const primary = hashToIndex(token, this.dimensions, 'a');
      const secondary = hashToIndex(token, this.dimensions, 'b');
      const magnitude = 1 + Math.log(count);

      vector[primary] = (vector[primary] ?? 0) + magnitude;
      vector[secondary] = (vector[secondary] ?? 0) - magnitude * 0.5;
    }

    return normalize(vector);
  }
}

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'in',
  'on',
  'at',
  'to',
  'for',
  'with',
  'from',
  'by',
  'is',
  'was',
  'are',
  'were',
  'this',
  'that',
  'it',
  'its',
  'as',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function hashToIndex(token: string, dimensions: number, salt: string): number {
  const digest = createHash('sha256').update(`${salt}:${token}`).digest();
  const value = digest.readUInt32BE(0);
  return value % dimensions;
}

/** L2 normalization, so cosine similarity is a plain dot product. */
function normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) return vector;
  return vector.map((value) => value / magnitude);
}
