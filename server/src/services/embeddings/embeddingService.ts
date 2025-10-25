import {
  ERA_LABELS,
  EXPERIENCE_LABELS,
  MEDIUM_LABELS,
  STYLE_LABELS,
  THEME_LABELS,
  parseArtworkFacets,
  type Artwork,
} from '@musematch/shared';
import { EMBEDDING_DIMENSIONS, embeddingProvider as configuredProvider } from '../../config/env.js';
import { embeddingLogger } from '../../config/logger.js';
import { LocalHashEmbeddingProvider } from './localProvider.js';
import { OpenAiEmbeddingProvider } from './openaiProvider.js';
import type { EmbeddingProvider } from './types.js';

/**
 * The application's entry point for embeddings.
 *
 * Controllers and other services call this; they never touch a provider or an
 * API key. It also owns the text representation of an artwork, so the same
 * fields are embedded everywhere -- inconsistent input text is the quickest way
 * to make a vector index useless.
 */

function createProvider(): EmbeddingProvider {
  if (configuredProvider === 'openai') return new OpenAiEmbeddingProvider();
  return new LocalHashEmbeddingProvider();
}

/**
 * The text an artwork is embedded from.
 *
 * Labels rather than machine keys ("Nature & Landscape", not "nature") so the
 * document reads like the natural-language queries it will be compared against.
 * Missing fields are omitted rather than filled with placeholder words, which
 * would embed the placeholder.
 */
export function buildArtworkEmbeddingText(artwork: Artwork): string {
  const facets = parseArtworkFacets(artwork.tags);
  const lines: string[] = [`Title: ${artwork.title}`];

  if (artwork.artist) lines.push(`Artist: ${artwork.artist}`);
  if (artwork.year) lines.push(`Date: ${artwork.year}`);
  if (artwork.medium) lines.push(`Medium: ${artwork.medium}`);
  if (artwork.classification) lines.push(`Classification: ${artwork.classification}`);
  if (artwork.department) lines.push(`Department: ${artwork.department}`);
  if (artwork.culture) lines.push(`Culture: ${artwork.culture}`);
  if (artwork.period) lines.push(`Period: ${artwork.period}`);

  if (facets.era) lines.push(`Era: ${ERA_LABELS[facets.era]}`);
  if (facets.mediums.length > 0) {
    lines.push(`Form: ${facets.mediums.map((key) => MEDIUM_LABELS[key]).join(', ')}`);
  }
  if (facets.themes.length > 0) {
    lines.push(`Themes: ${facets.themes.map((key) => THEME_LABELS[key]).join(', ')}`);
  }
  if (facets.styles.length > 0) {
    lines.push(`Character: ${facets.styles.map((key) => STYLE_LABELS[key]).join(', ')}`);
  }
  if (facets.experiences.length > 0) {
    lines.push(`Feels: ${facets.experiences.map((key) => EXPERIENCE_LABELS[key]).join(', ')}`);
  }
  if (facets.free.length > 0) lines.push(`Keywords: ${facets.free.join(', ')}`);
  if (artwork.description) lines.push(`Description: ${artwork.description}`);

  return lines.join('\n');
}

export class EmbeddingService {
  private readonly provider: EmbeddingProvider;

  constructor(provider: EmbeddingProvider = createProvider()) {
    this.provider = provider;
    embeddingLogger.info(
      { provider: this.provider.name, dimensions: this.provider.dimensions },
      'Embedding provider ready',
    );
  }

  get providerName(): string {
    return this.provider.name;
  }

  get dimensions(): number {
    return this.provider.dimensions;
  }

  /** True when the configured provider is a real semantic model. */
  get isSemantic(): boolean {
    return this.provider.name !== 'local-hash';
  }

  async embedQuery(query: string): Promise<number[]> {
    return this.assertDimensions(await this.provider.createEmbedding(query));
  }

  async embedArtwork(artwork: Artwork): Promise<number[]> {
    return this.embedQuery(buildArtworkEmbeddingText(artwork));
  }

  async embedArtworks(artworks: Artwork[]): Promise<number[][]> {
    const vectors = await this.provider.createEmbeddings(artworks.map(buildArtworkEmbeddingText));
    return vectors.map((vector) => this.assertDimensions(vector));
  }

  /**
   * A vector of the wrong length would be rejected by Postgres with an opaque
   * error at insert time; catching it here names the actual problem.
   */
  private assertDimensions(vector: number[]): number[] {
    if (vector.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Embedding provider ${this.provider.name} returned ${vector.length} dimensions; ` +
          `the artworks.embedding column expects ${EMBEDDING_DIMENSIONS}.`,
      );
    }
    return vector;
  }
}

export const embeddingService = new EmbeddingService();
