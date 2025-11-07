/**
 * Every tunable number in the personalization system lives here.
 *
 * Nothing else in the codebase should contain a bare recommendation constant.
 * The values are starting points chosen for plausible behavior, not measured
 * optima -- `npm run eval:recommendations --workspace server` is the harness
 * for checking that a change to them still ranks sensibly.
 */

/**
 * Structured preference scoring: how much each taste dimension contributes to
 * an artwork's match with a profile. Must sum to 1.
 */
export const RECOMMENDATION_WEIGHTS = {
  medium: 0.25,
  era: 0.2,
  theme: 0.2,
  style: 0.15,
  experience: 0.1,
  exploration: 0.1,
} as const;

/**
 * The hybrid blend. The structured profile dominates because it is the signal
 * the user actually stated; behavior and semantics refine it.
 * Must sum to 1.
 */
export interface HybridWeights {
  structured: number;
  behavior: number;
  semantic: number;
  exploration: number;
}

export const HYBRID_WEIGHTS: HybridWeights = {
  structured: 0.45,
  behavior: 0.25,
  semantic: 0.2,
  exploration: 0.1,
} as const;

/**
 * When no embeddings exist yet, the semantic share has nothing to say. Rather
 * than score every artwork 0 on a fifth of the total, its weight is
 * redistributed across the remaining components. See `resolveHybridWeights`.
 */
export function resolveHybridWeights(hasSemantic: boolean): HybridWeights {
  if (hasSemantic) return HYBRID_WEIGHTS;

  const remaining =
    HYBRID_WEIGHTS.structured + HYBRID_WEIGHTS.behavior + HYBRID_WEIGHTS.exploration;
  const scale = 1 / remaining;

  return {
    structured: HYBRID_WEIGHTS.structured * scale,
    behavior: HYBRID_WEIGHTS.behavior * scale,
    semantic: 0,
    exploration: HYBRID_WEIGHTS.exploration * scale,
  };
}

/** Behavioral learning. */
export const BEHAVIOR_CONFIG = {
  /**
   * How far one interaction can move a single weight, before the interaction's
   * own strength is applied. Small on purpose: taste should drift over a
   * session's worth of signals, not jump on one click.
   */
  learningRate: 0.06,
  /**
   * Multiplier applied to every existing weight in a touched dimension, so
   * interests the user has stopped acting on fade instead of accumulating
   * forever.
   */
  decay: 0.997,
  /**
   * Share of the blended profile that comes from behavior rather than the
   * quiz. Behavior refines; it does not overrule what the user told us.
   */
  blendShare: 0.35,
} as const;

/** Recommendation feed behavior. */
export const FEED_CONFIG = {
  /** Candidates pulled before scoring. Larger pool, better ranking, slower. */
  candidatePoolSize: 120,
  defaultLimit: 24,
  maxLimit: 60,
  /** Artworks by one artist allowed in a single feed page. */
  maxPerArtist: 2,
  /** How many recent interactions inform "similar to what you saved". */
  recentInteractionWindow: 40,
  /** Minimum score before an artwork is worth showing at all. */
  minimumScore: 0.05,
} as const;

/** Itinerary generation. */
export const ITINERARY_CONFIG = {
  /** Candidates considered by the optimizer. */
  candidatePoolSize: 80,
  /** Cap on works by a single artist in one itinerary. */
  maxPerArtist: 2,
  /** Cap on works from a single department in one itinerary. */
  maxPerDepartment: 4,
  /**
   * Minutes held back from the budget for arrival, tickets and walking between
   * wings, so a generated plan is not built on the fiction that a visitor
   * teleports between galleries.
   */
  overheadMinutes: 15,
} as const;

/**
 * Match percentage presentation lives in `@musematch/shared` (MATCH_DISPLAY and
 * toMatchPercent), because the client renders it too: the itinerary stores a
 * raw score per stop and must show the same figure the feed showed.
 */
