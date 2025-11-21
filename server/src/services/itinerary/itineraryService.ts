import type { Artwork, MuseumSource, Recommendation } from '@musematch/shared';
import { itineraryLogger } from '../../config/logger.js';
import { ITINERARY_CONFIG } from '../recommendations/config.js';
import { recommendationService } from '../recommendations/recommendationService.js';
import { solveKnapsack, type KnapsackItem } from './knapsack.js';
import { estimateViewingMinutes } from './viewingTime.js';

/**
 * Builds a personalized, time-bounded itinerary.
 *
 * Three stages, each with a single job:
 *
 *   1. rank    -- score the museum's cached works against the user's profile
 *   2. filter  -- apply diversity caps, so no artist or wing dominates
 *   3. select  -- solve the time budget exactly over what survived
 *
 * Splitting diversity out of the optimizer is the central tradeoff. Caps
 * expressed inside the knapsack would make it multi-dimensional and no longer
 * exactly solvable; applied as a pre-filter, the optimizer stays optimal over
 * a candidate set that already satisfies them. The cost is that the result is
 * optimal for the filtered set rather than for every possible diverse
 * itinerary. In exchange the behavior is predictable and fast, and a visitor
 * never gets four Monets and nothing else.
 */

export interface ItineraryCandidate extends KnapsackItem {
  artwork: Artwork;
  recommendationScore: number;
  estimatedMinutes: number;
  department: string;
  artist: string | null;
  reasons: string[];
}

export interface GeneratedItinerary {
  items: ItineraryCandidate[];
  totalMinutes: number;
  totalScore: number;
  /** Budget actually available to artworks, after walking overhead. */
  usableMinutes: number;
}

const UNGROUPED_DEPARTMENT = 'Elsewhere in the museum';

export class ItineraryService {
  async generate(options: {
    userId: string;
    museum: MuseumSource;
    availableMinutes: number;
  }): Promise<GeneratedItinerary> {
    const usableMinutes = Math.max(0, options.availableMinutes - ITINERARY_CONFIG.overheadMinutes);

    const recommendations = await this.getRankedCandidates(options.userId, options.museum);
    const candidates = toCandidates(recommendations);
    const eligible = applyDiversityCaps(candidates);

    const solution = solveKnapsack(eligible, usableMinutes);
    const ordered = orderByDepartment(solution.items);

    itineraryLogger.info(
      {
        userId: options.userId,
        museum: options.museum,
        availableMinutes: options.availableMinutes,
        usableMinutes,
        candidates: candidates.length,
        eligible: eligible.length,
        selected: ordered.length,
        totalMinutes: solution.totalCost,
      },
      'Generated itinerary',
    );

    return {
      items: ordered,
      totalMinutes: solution.totalCost,
      totalScore: solution.totalValue,
      usableMinutes,
    };
  }

  private async getRankedCandidates(
    userId: string,
    museum: MuseumSource,
  ): Promise<Recommendation[]> {
    return recommendationService.getRecommendations(userId, {
      museum,
      limit: ITINERARY_CONFIG.candidatePoolSize,
      // A visit plan should be free to include works the user has already
      // seen on the feed; skipping them would thin the museum's best rooms.
      excludeSeen: false,
    });
  }
}

export function toCandidates(recommendations: Recommendation[]): ItineraryCandidate[] {
  return recommendations.map((recommendation) => {
    const estimatedMinutes = estimateViewingMinutes(recommendation.artwork);

    return {
      id: recommendation.artwork.id,
      value: recommendation.score,
      cost: estimatedMinutes,
      artwork: recommendation.artwork,
      recommendationScore: recommendation.score,
      estimatedMinutes,
      department: recommendation.artwork.department ?? UNGROUPED_DEPARTMENT,
      artist: recommendation.artwork.artist,
      reasons: recommendation.reasons,
    };
  });
}

/**
 * Keeps only the strongest few candidates per artist and per department.
 *
 * Running before the optimizer means every solution it can produce already
 * satisfies the caps, with no repair pass afterwards.
 */
export function applyDiversityCaps(candidates: ItineraryCandidate[]): ItineraryCandidate[] {
  const byScore = [...candidates].sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));

  const artistCounts = new Map<string, number>();
  const departmentCounts = new Map<string, number>();
  const kept: ItineraryCandidate[] = [];

  for (const candidate of byScore) {
    const departmentCount = departmentCounts.get(candidate.department) ?? 0;
    if (departmentCount >= ITINERARY_CONFIG.maxPerDepartment) continue;

    if (candidate.artist) {
      const artistCount = artistCounts.get(candidate.artist) ?? 0;
      if (artistCount >= ITINERARY_CONFIG.maxPerArtist) continue;
      artistCounts.set(candidate.artist, artistCount + 1);
    }

    departmentCounts.set(candidate.department, departmentCount + 1);
    kept.push(candidate);
  }

  return kept;
}

/**
 * Orders the selected works into a walking route.
 *
 * V1 groups by department and nothing more. Neither museum API exposes
 * reliable gallery coordinates, so anything finer would be invented -- and a
 * route built on invented positions is worse than an honest grouping. Within a
 * department, the strongest match comes first, so a visitor who runs short on
 * time has already seen the best of that wing.
 */
export function orderByDepartment(items: ItineraryCandidate[]): ItineraryCandidate[] {
  const groups = new Map<string, ItineraryCandidate[]>();

  for (const item of items) {
    const group = groups.get(item.department);
    if (group) group.push(item);
    else groups.set(item.department, [item]);
  }

  return (
    [...groups.entries()]
      .map(([department, groupItems]) => ({
        department,
        items: [...groupItems].sort((a, b) => b.value - a.value),
        total: groupItems.reduce((sum, item) => sum + item.value, 0),
      }))
      // Strongest wing first, so the visit opens with what the visitor came for.
      .sort((a, b) => b.total - a.total)
      .flatMap((group) => group.items)
  );
}

export const itineraryService = new ItineraryService();
