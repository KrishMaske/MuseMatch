import type { Artwork, MuseumSource } from './artwork.js';

/**
 * A scored artwork plus the human-readable case for showing it.
 *
 * `components` is kept for debugging and for the evaluation harness. It is not
 * meant for end users -- the UI shows `reasons` and `matchPercent` only.
 */
export interface Recommendation {
  artwork: Artwork;
  score: number;
  matchPercent: number;
  reasons: string[];
  components?: ScoreComponents;
}

export interface ScoreComponents {
  medium: number;
  era: number;
  theme: number;
  style: number;
  experience: number;
  exploration: number;
  behavior: number;
  semantic: number;
}

export interface RecommendationQuery {
  limit?: number;
  museum?: MuseumSource;
  /** Exclude artworks the user has already disliked or seen recently. */
  excludeSeen?: boolean;
}

/**
 * Match percentage presentation.
 *
 * Raw scores cluster low -- an artwork matching three of five dimensions
 * strongly still scores around 0.5 -- so the displayed percentage is stretched
 * onto a range that reads honestly to a person. This is presentation only;
 * ranking always uses the raw score.
 *
 * It lives in `shared` because both sides render it: the API returns a
 * `matchPercent` on recommendations, but stores the raw score on a visit item,
 * and the itinerary has to show the same figure the feed did for the same work.
 */
export const MATCH_DISPLAY = {
  floor: 0.35,
  ceiling: 0.99,
  /** Raw score that maps to the top of the displayed range. */
  saturationScore: 0.75,
} as const;

export function toMatchPercent(score: number): number {
  const { floor, ceiling, saturationScore } = MATCH_DISPLAY;
  const ratio = Math.min(1, Math.max(0, score / saturationScore));
  return Math.round((floor + ratio * (ceiling - floor)) * 100);
}
