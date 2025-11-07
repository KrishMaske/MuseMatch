import {
  ERA_LABELS,
  EXPERIENCE_LABELS,
  MEDIUM_LABELS,
  STYLE_LABELS,
  THEME_LABELS,
  type Artwork,
  type MuseumSource,
  type PreferenceWeights,
  type Recommendation,
  type TasteProfile,
} from '@musematch/shared';
import { recommendationLogger } from '../../config/logger.js';
import { artworkRepository } from '../../repositories/artworkRepository.js';
import { embeddingRepository } from '../../repositories/embeddingRepository.js';
import { interactionRepository } from '../../repositories/interactionRepository.js';
import { topKeys } from '../../utils/weights.js';
import { embeddingService } from '../embeddings/embeddingService.js';
import { museumService } from '../museums/museumService.js';
import { preferenceService } from '../profile/preferenceService.js';
import { FEED_CONFIG } from './config.js';
import {
  generateRecommendationReasons,
  scoreArtwork,
  toMatchPercent,
  type ScoringSignals,
} from './scoring.js';

/**
 * Produces ranked, explained recommendations.
 *
 * The flow is deliberately linear and each step is separately testable:
 *
 *   profile -> candidates -> semantic signal -> score -> diversify -> explain
 *
 * Candidates come from the local cache first and are topped up from the live
 * museum APIs, so the feed still works when a provider is down and gets faster
 * as the cache fills.
 */

export interface RecommendationOptions {
  limit?: number;
  museum?: MuseumSource;
  excludeSeen?: boolean;
}

export interface RankOptions {
  /** Set when ranking search results, which changes the wording of reasons. */
  hasSearchQuery?: boolean;
  /** Similarity per artwork id, when a vector comparison was already made. */
  similarityById?: Map<string, number>;
  limit?: number;
  /** Cap on works per artist. Off for search, where the user may have asked for one. */
  enforceDiversity?: boolean;
  /** Detail pages need an explanation even when the item is below feed threshold. */
  includeBelowThreshold?: boolean;
}

export class RecommendationService {
  async getRecommendations(
    userId: string,
    options: RecommendationOptions = {},
  ): Promise<Recommendation[]> {
    const limit = Math.min(options.limit ?? FEED_CONFIG.defaultLimit, FEED_CONFIG.maxLimit);
    const profile = await preferenceService.getProfile(userId);

    const excludeIds = await this.buildExclusions(userId, options.excludeSeen ?? true);
    const candidates = await this.getCandidateArtworks({
      museum: options.museum,
      excludeIds,
      poolSize: FEED_CONFIG.candidatePoolSize,
    });

    if (candidates.length === 0) {
      recommendationLogger.warn({ userId }, 'No candidate artworks available for recommendations');
      return [];
    }

    // The feed's semantic signal compares each candidate against a written
    // description of the user's taste, so embeddings contribute even when the
    // user has not typed a query.
    const similarityById = await this.buildTasteSimilarity(profile, candidates);

    const ranked = await this.rank(userId, candidates, profile, {
      limit,
      similarityById,
      enforceDiversity: true,
    });

    recommendationLogger.debug(
      {
        userId,
        candidates: candidates.length,
        returned: ranked.length,
        topScore: ranked[0]?.score,
      },
      'Generated recommendations',
    );

    return ranked;
  }

  /**
   * Ranks an arbitrary set of artworks for a user.
   * Shared by the feed, search re-ranking and itinerary candidate selection.
   */
  async rank(
    userId: string,
    artworks: Artwork[],
    profile: TasteProfile | undefined,
    options: RankOptions = {},
  ): Promise<Recommendation[]> {
    const tasteProfile = profile ?? (await preferenceService.getProfile(userId));
    const blended = preferenceService.blend(tasteProfile);
    const favouredArtists = await interactionRepository.findFavouredArtists(
      userId,
      FEED_CONFIG.recentInteractionWindow,
    );

    const scored = artworks.map((artwork) => {
      const similarity = options.similarityById?.get(artwork.id);
      const signals: ScoringSignals = {
        blended,
        behavioral: tasteProfile.behavioral,
        explorationSetting: tasteProfile.explorationScore,
        ...(typeof similarity === 'number' ? { semanticSimilarity: similarity } : {}),
      };

      const result = scoreArtwork(artwork, signals);
      const savedArtistMatch =
        artwork.artist && favouredArtists.has(artwork.artist) ? artwork.artist : null;

      return {
        artwork,
        score: result.score,
        matchPercent: toMatchPercent(result.score),
        reasons: generateRecommendationReasons(result, signals, {
          hasSearchQuery: options.hasSearchQuery ?? false,
          savedArtistMatch,
        }),
        components: result.components,
      } satisfies Recommendation;
    });

    const ordered = scored
      .filter((item) => options.includeBelowThreshold || item.score >= FEED_CONFIG.minimumScore)
      .sort((a, b) => b.score - a.score || a.artwork.id.localeCompare(b.artwork.id));

    const limit = options.limit ?? FEED_CONFIG.defaultLimit;
    return options.enforceDiversity === false
      ? ordered.slice(0, limit)
      : applyArtistDiversity(ordered, limit, FEED_CONFIG.maxPerArtist);
  }

  /**
   * Builds the candidate pool: cached artworks first, topped up from the live
   * providers when the cache is thin. Anything newly fetched is persisted, so
   * the pool it draws from grows with use.
   */
  async getCandidateArtworks(options: {
    museum?: MuseumSource;
    excludeIds: string[];
    poolSize: number;
  }): Promise<Artwork[]> {
    const cached = await artworkRepository.sample(options.poolSize, {
      ...(options.museum ? { museum: options.museum } : {}),
      excludeIds: options.excludeIds,
      requireImage: true,
    });

    if (cached.length >= options.poolSize) return cached;

    const shortfall = options.poolSize - cached.length;

    try {
      const fresh = await museumService.sample(shortfall, options.museum);
      const persisted = await artworkRepository.upsertMany(fresh);

      const excluded = new Set(options.excludeIds);
      const seen = new Set(cached.map((artwork) => artwork.id));

      const additions = persisted.filter(
        (artwork) => artwork.imageUrl && !excluded.has(artwork.id) && !seen.has(artwork.id),
      );

      return [...cached, ...additions];
    } catch (error) {
      // A provider outage degrades the pool; it does not empty the feed.
      recommendationLogger.warn(
        { err: error },
        'Could not top up candidates from museum providers',
      );
      return cached;
    }
  }

  private async buildExclusions(userId: string, excludeSeen: boolean): Promise<string[]> {
    const rejected = await interactionRepository.findRejectedArtworkIds(userId);
    if (!excludeSeen) return rejected;

    const recentlyViewed = await interactionRepository.findRecentlyViewedArtworkIds(
      userId,
      FEED_CONFIG.recentInteractionWindow,
    );

    return [...new Set([...rejected, ...recentlyViewed])];
  }

  /**
   * Compares candidates against an embedding of the user's taste.
   * Returns undefined when nothing has been embedded yet, which makes the
   * scorer redistribute the semantic weight instead of scoring everything 0.
   */
  private async buildTasteSimilarity(
    profile: TasteProfile,
    candidates: Artwork[],
  ): Promise<Map<string, number> | undefined> {
    const blended = preferenceService.blend(profile);
    const tasteText = buildTasteQueryText(blended);
    if (!tasteText) return undefined;

    try {
      if (!(await embeddingRepository.hasAny())) return undefined;

      const vector = await embeddingService.embedQuery(tasteText);
      const hits = await embeddingRepository.search(vector, {
        limit: candidates.length,
        artworkIds: candidates.map((artwork) => artwork.id),
      });

      if (hits.length === 0) return undefined;
      return new Map(hits.map((hit) => [hit.id, hit.similarity]));
    } catch (error) {
      recommendationLogger.warn({ err: error }, 'Taste embedding unavailable; scoring without it');
      return undefined;
    }
  }
}

/**
 * A natural-language description of what a user likes, used as the query
 * vector for the personalized feed.
 */
export function buildTasteQueryText(weights: PreferenceWeights): string | null {
  const parts: string[] = [];

  const mediums = topKeys(weights, 'medium', 2).map(
    ({ key }) => MEDIUM_LABELS[key as keyof typeof MEDIUM_LABELS],
  );
  const themes = topKeys(weights, 'theme', 3).map(
    ({ key }) => THEME_LABELS[key as keyof typeof THEME_LABELS],
  );
  const eras = topKeys(weights, 'era', 2).map(
    ({ key }) => ERA_LABELS[key as keyof typeof ERA_LABELS],
  );
  const styles = topKeys(weights, 'style', 2).map(
    ({ key }) => STYLE_LABELS[key as keyof typeof STYLE_LABELS],
  );
  const experiences = topKeys(weights, 'experience', 2).map(
    ({ key }) => EXPERIENCE_LABELS[key as keyof typeof EXPERIENCE_LABELS],
  );

  if (mediums.length > 0) parts.push(`Form: ${mediums.join(', ')}`);
  if (eras.length > 0) parts.push(`Era: ${eras.join(', ')}`);
  if (themes.length > 0) parts.push(`Themes: ${themes.join(', ')}`);
  if (styles.length > 0) parts.push(`Character: ${styles.join(', ')}`);
  if (experiences.length > 0) parts.push(`Feels: ${experiences.join(', ')}`);

  return parts.length > 0 ? parts.join('\n') : null;
}

/**
 * Keeps one artist from taking over a page of results.
 *
 * Overflow is not discarded -- it is appended after the diverse selection, so
 * the page still fills when a user's taste genuinely centres on a few artists.
 */
export function applyArtistDiversity(
  recommendations: Recommendation[],
  limit: number,
  maxPerArtist: number,
): Recommendation[] {
  const counts = new Map<string, number>();
  const selected: Recommendation[] = [];
  const overflow: Recommendation[] = [];

  for (const recommendation of recommendations) {
    const artist = recommendation.artwork.artist;

    if (!artist) {
      selected.push(recommendation);
    } else {
      const count = counts.get(artist) ?? 0;
      if (count < maxPerArtist) {
        counts.set(artist, count + 1);
        selected.push(recommendation);
      } else {
        overflow.push(recommendation);
      }
    }

    if (selected.length >= limit) break;
  }

  return [...selected, ...overflow].slice(0, limit);
}

export const recommendationService = new RecommendationService();
