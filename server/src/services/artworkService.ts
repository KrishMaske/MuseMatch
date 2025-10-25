import type {
  Artwork,
  ArtworkSearchParams,
  ArtworkSort,
  MuseumSource,
  Recommendation,
} from '@musematch/shared';
import { museumLogger } from '../config/logger.js';
import { artworkRepository } from '../repositories/artworkRepository.js';
import { embeddingRepository } from '../repositories/embeddingRepository.js';
import { AppError } from '../utils/errors.js';
import { embeddingService } from './embeddings/embeddingService.js';
import { museumService } from './museums/museumService.js';
import { recommendationService } from './recommendations/recommendationService.js';

/**
 * Artwork reads: search, detail and similarity.
 *
 * The rule this service enforces is that anything the API hands out has been
 * persisted first, so every artwork the client sees carries a local id that
 * interactions, collections and visits can point at.
 */

export interface SearchResult {
  artworks: Artwork[];
  total: number;
  /** Museums that failed this request, so the UI can say so rather than lie. */
  unavailable: MuseumSource[];
}

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;
/** Candidates pulled from pgvector before preference re-ranking. */
const SEMANTIC_POOL_MULTIPLIER = 3;

export class ArtworkService {
  /**
   * Keyword search across the live museum APIs, with results cached locally.
   *
   * The providers are the source of truth here rather than the cache: they
   * hold the full collections, while the cache only holds what MuseMatch has
   * already seen. The cache is used as a fallback when every provider fails.
   */
  async search(params: ArtworkSearchParams): Promise<SearchResult> {
    const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const page = Math.max(1, params.page ?? 1);

    try {
      const result = await museumService.search(
        {
          page,
          limit,
          requireImage: true,
          ...(params.q ? { q: params.q } : {}),
          ...(params.artist ? { artist: params.artist } : {}),
          ...(params.medium ? { medium: params.medium } : {}),
          ...(params.department ? { department: params.department } : {}),
        },
        params.museum,
      );

      const persisted = await artworkRepository.upsertMany(result.artworks);

      return {
        artworks: sortSearchResults(persisted, params.sort),
        total: result.total,
        unavailable: result.unavailable,
      };
    } catch (error) {
      museumLogger.warn({ err: error }, 'Live search failed; falling back to the local cache');

      const cached = await artworkRepository.search({
        ...toLocalFilters(params),
        page,
        limit,
        requireImage: true,
      });

      if (cached.artworks.length === 0) {
        throw AppError.upstream(
          'Museum collections are unavailable and nothing matching is cached yet.',
        );
      }

      return {
        artworks: sortSearchResults(cached.artworks, params.sort),
        total: cached.total,
        unavailable: params.museum ? [params.museum] : museumService.listSources(),
      };
    }
  }

  /** Filter-driven browsing over the local cache, with no provider call. */
  async browse(params: ArtworkSearchParams): Promise<SearchResult> {
    const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const page = Math.max(1, params.page ?? 1);

    const result = await artworkRepository.search({
      ...toLocalFilters(params),
      page,
      limit,
      requireImage: true,
      ...(params.sort ? { sort: params.sort } : {}),
    });

    return { ...result, unavailable: [] };
  }

  /**
   * Natural-language search.
   *
   * Embeds the query, pulls a wide neighbourhood from pgvector, then re-ranks
   * that neighbourhood against the user's taste profile so two people
   * searching the same words do not get an identical page.
   */
  async semanticSearch(
    userId: string,
    params: ArtworkSearchParams,
  ): Promise<{ recommendations: Recommendation[]; total: number }> {
    const query = params.q?.trim();
    if (!query) throw AppError.badRequest('A search query is required for semantic search.');

    const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    if (!(await embeddingRepository.hasAny())) {
      throw AppError.badRequest(
        'Semantic search needs artwork embeddings. Run the embedding backfill first.',
      );
    }

    const vector = await embeddingService.embedQuery(query);
    const hits = await embeddingRepository.search(vector, {
      limit: limit * SEMANTIC_POOL_MULTIPLIER,
      requireImage: true,
      ...(params.museum ? { museum: params.museum } : {}),
    });

    if (hits.length === 0) return { recommendations: [], total: 0 };

    const artworks = await artworkRepository.findManyByIds(hits.map((hit) => hit.id));
    const similarityById = new Map(hits.map((hit) => [hit.id, hit.similarity]));

    const recommendations = await recommendationService.rank(userId, artworks, undefined, {
      hasSearchQuery: true,
      similarityById,
      limit,
      // A search for one artist should be allowed to return that artist.
      enforceDiversity: false,
    });

    return { recommendations, total: hits.length };
  }

  /**
   * Fetches one artwork, cache first.
   *
   * Accepts either a local id or a `SOURCE:externalId` pair, so a link to an
   * artwork the app has never cached still resolves.
   */
  async getById(id: string): Promise<Artwork> {
    const cached = await artworkRepository.findById(id);
    if (cached) return cached;

    const composite = parseCompositeId(id);
    if (!composite) throw AppError.notFound('Artwork not found.');

    const fetched = await museumService.getArtwork(composite.source, composite.externalId);
    if (!fetched) throw AppError.notFound('Artwork not found.');

    return artworkRepository.upsert(fetched);
  }

  /**
   * Related artworks.
   *
   * Prefers vector similarity; falls back to shared facets when the artwork
   * has not been embedded yet, so the section is never empty on a fresh
   * install.
   */
  async findSimilar(artworkId: string, limit: number): Promise<Artwork[]> {
    const artwork = await this.getById(artworkId);

    try {
      const hits = await embeddingRepository.searchByArtwork(artwork.id, limit);
      if (hits.length > 0) {
        return artworkRepository.findManyByIds(hits.map((hit) => hit.id));
      }
    } catch (error) {
      museumLogger.warn(
        { err: error, artworkId },
        'Vector similarity failed; using facet fallback',
      );
    }

    return this.findSimilarByFacets(artwork, limit);
  }

  /** Facet-based neighbours: same medium or theme, excluding the artwork itself. */
  private async findSimilarByFacets(artwork: Artwork, limit: number): Promise<Artwork[]> {
    const mediumTag = artwork.tags.find((tag) => tag.startsWith('medium:'));
    const themeTag = artwork.tags.find((tag) => tag.startsWith('theme:'));

    const result = await artworkRepository.search({
      ...(mediumTag ? { medium: mediumTag.slice('medium:'.length) } : {}),
      ...(themeTag && !mediumTag ? { theme: themeTag.slice('theme:'.length) } : {}),
      excludeIds: [artwork.id],
      requireImage: true,
      limit,
      page: 1,
    });

    return result.artworks;
  }
}

/**
 * Applies a date sort to a page of live search results.
 *
 * Neither provider lets a keyword search be sorted by date, so this orders the
 * page the user is actually looking at rather than the whole match set. That
 * is a real limitation and it is the reason the control is not simply ignored:
 * a sort option that visibly does nothing is worse than one with a documented
 * scope.
 *
 * `recommended` and `relevance` keep the museum's own ordering, which is the
 * relevance ranking the provider returned.
 */
function sortSearchResults(artworks: Artwork[], sort: ArtworkSort | undefined): Artwork[] {
  if (sort !== 'oldest' && sort !== 'newest') return artworks;

  const direction = sort === 'oldest' ? 1 : -1;

  return [...artworks].sort((a, b) => {
    const left = a.dateStart ?? a.dateEnd;
    const right = b.dateStart ?? b.dateEnd;

    // Undated works sink to the bottom either way rather than clustering at
    // whichever end the comparison happens to favour.
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;

    return (left - right) * direction;
  });
}

function toLocalFilters(params: ArtworkSearchParams) {
  return {
    ...(params.q ? { q: params.q } : {}),
    ...(params.museum ? { museum: params.museum } : {}),
    ...(params.medium ? { medium: params.medium } : {}),
    ...(params.theme ? { theme: params.theme } : {}),
    ...(params.period ? { era: params.period } : {}),
    ...(params.artist ? { artist: params.artist } : {}),
    ...(params.department ? { department: params.department } : {}),
    ...(params.classification ? { classification: params.classification } : {}),
    ...(params.culture ? { culture: params.culture } : {}),
  };
}

/** Parses the `SOURCE:externalId` form used before an artwork is persisted. */
function parseCompositeId(id: string): { source: MuseumSource; externalId: string } | null {
  const separator = id.indexOf(':');
  if (separator === -1) return null;

  const source = id.slice(0, separator);
  const externalId = id.slice(separator + 1);
  if (!externalId) return null;
  if (source !== 'MET' && source !== 'AIC') return null;

  return { source, externalId };
}

export const artworkService = new ArtworkService();
