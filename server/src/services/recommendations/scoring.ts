import {
  ERA_LABELS,
  EXPERIENCE_LABELS,
  MEDIUM_LABELS,
  STYLE_LABELS,
  THEME_LABELS,
  facetKeysFor,
  parseArtworkFacets,
  type Artwork,
  type ArtworkFacets,
  type PreferenceDimension,
  type PreferenceWeights,
  type ScoreComponents,
} from '@musematch/shared';
import { toMatchPercent } from '@musematch/shared';
import { clamp01 } from '../../utils/weights.js';
import { RECOMMENDATION_WEIGHTS, resolveHybridWeights } from './config.js';

// Re-exported so scoring stays the one import site for ranking and its display.
export { toMatchPercent };

/**
 * Scoring an artwork against a taste profile.
 *
 * Everything here is a pure function of (profile, artwork, signals). Same
 * inputs, same score -- which is what makes the ranking testable and the
 * explanations trustworthy, since the reasons are read off the same component
 * values that produced the number.
 */

/**
 * Score given to a dimension the classifier could not fill in.
 *
 * Not zero: a sparse museum record is missing information, not evidence of a
 * mismatch, and scoring it as a mismatch would bury whole departments whose
 * cataloguing happens to be terse. Kept below the midpoint so a known match
 * still outranks an unknown.
 */
const UNKNOWN_FACET_SCORE = 0.2;

/** A second matching facet in the same dimension adds this share of its weight. */
const SECONDARY_MATCH_SHARE = 0.15;

const STRUCTURED_WEIGHT_TOTAL = 1 - RECOMMENDATION_WEIGHTS.exploration;

export interface ScoringSignals {
  /** Cosine similarity in [0, 1], when an embedding comparison was made. */
  semanticSimilarity?: number;
  /** Preference weights learned from behavior, scored separately. */
  behavioral: PreferenceWeights;
  /** The blended weights used for the structured component. */
  blended: PreferenceWeights;
  /** The user's appetite for novelty, 0..1. */
  explorationSetting: number;
}

export interface ScoredArtwork {
  score: number;
  components: ScoreComponents;
  facets: ArtworkFacets;
  /** How unlike the user's established taste this artwork is, 0..1. */
  novelty: number;
}

/**
 * Scores one dimension: how well an artwork's facets line up with the user's
 * weights for that dimension.
 *
 * The best match dominates, with a small bonus for a second one. Averaging
 * instead would punish an artwork for being tagged with a theme the user is
 * merely neutral about.
 */
function scoreDimension(
  weights: PreferenceWeights,
  facets: ArtworkFacets,
  dimension: PreferenceDimension,
): number {
  const keys = facetKeysFor(facets, dimension);
  if (keys.length === 0) return UNKNOWN_FACET_SCORE;

  const map = weights[dimension] as Record<string, number>;
  const matched = keys.map((key) => map[key] ?? 0).sort((a, b) => b - a);

  const best = matched[0] ?? 0;
  const second = matched[1] ?? 0;

  return clamp01(best + second * SECONDARY_MATCH_SHARE);
}

export function calculateMediumScore(weights: PreferenceWeights, facets: ArtworkFacets): number {
  return scoreDimension(weights, facets, 'medium');
}

export function calculateEraScore(weights: PreferenceWeights, facets: ArtworkFacets): number {
  return scoreDimension(weights, facets, 'era');
}

export function calculateThemeScore(weights: PreferenceWeights, facets: ArtworkFacets): number {
  return scoreDimension(weights, facets, 'theme');
}

export function calculateStyleScore(weights: PreferenceWeights, facets: ArtworkFacets): number {
  return scoreDimension(weights, facets, 'style');
}

export function calculateExperienceScore(
  weights: PreferenceWeights,
  facets: ArtworkFacets,
): number {
  return scoreDimension(weights, facets, 'experience');
}

/**
 * The structured preference score: the weighted sum over the five taste
 * dimensions, renormalized so it spans [0, 1] on its own.
 */
export function calculateStructuredScore(
  weights: PreferenceWeights,
  facets: ArtworkFacets,
): number {
  const total =
    calculateMediumScore(weights, facets) * RECOMMENDATION_WEIGHTS.medium +
    calculateEraScore(weights, facets) * RECOMMENDATION_WEIGHTS.era +
    calculateThemeScore(weights, facets) * RECOMMENDATION_WEIGHTS.theme +
    calculateStyleScore(weights, facets) * RECOMMENDATION_WEIGHTS.style +
    calculateExperienceScore(weights, facets) * RECOMMENDATION_WEIGHTS.experience;

  return clamp01(total / STRUCTURED_WEIGHT_TOTAL);
}

/** The same shape of match, scored against learned weights only. */
export function calculateBehaviorScore(
  behavioral: PreferenceWeights,
  facets: ArtworkFacets,
): number {
  return calculateStructuredScore(behavioral, facets);
}

/**
 * How well an artwork's novelty suits the user's stated appetite for it.
 *
 * A user who asked for adventurous recommendations scores highest on artworks
 * unlike their established taste; a user who asked for familiar ones scores
 * highest on artworks that match it. The component peaks where novelty meets
 * the setting, rather than simply rewarding novelty.
 */
export function calculateExplorationScore(novelty: number, explorationSetting: number): number {
  return clamp01(1 - Math.abs(clamp01(novelty) - clamp01(explorationSetting)));
}

/** Cosine similarity is already in [0, 1] here; kept as a named step. */
export function calculateSemanticScore(similarity: number | undefined): number {
  if (typeof similarity !== 'number' || Number.isNaN(similarity)) return 0;
  return clamp01(similarity);
}

/**
 * The hybrid score.
 *
 * Section 14 of the spec gives a single-stage formula whose sixth term is
 * exploration; section 18 gives a four-way hybrid that also lists exploration.
 * Counting it in both places would double its influence, so the structured
 * component here covers the five taste dimensions and exploration is applied
 * once, at the hybrid level, with the weight section 18 gives it.
 */
export function scoreArtwork(artwork: Artwork, signals: ScoringSignals): ScoredArtwork {
  const facets = parseArtworkFacets(artwork.tags);

  const medium = calculateMediumScore(signals.blended, facets);
  const era = calculateEraScore(signals.blended, facets);
  const theme = calculateThemeScore(signals.blended, facets);
  const style = calculateStyleScore(signals.blended, facets);
  const experience = calculateExperienceScore(signals.blended, facets);

  const structured = clamp01(
    (medium * RECOMMENDATION_WEIGHTS.medium +
      era * RECOMMENDATION_WEIGHTS.era +
      theme * RECOMMENDATION_WEIGHTS.theme +
      style * RECOMMENDATION_WEIGHTS.style +
      experience * RECOMMENDATION_WEIGHTS.experience) /
      STRUCTURED_WEIGHT_TOTAL,
  );

  const behavior = calculateBehaviorScore(signals.behavioral, facets);
  const semantic = calculateSemanticScore(signals.semanticSimilarity);
  const novelty = 1 - structured;
  const exploration = calculateExplorationScore(novelty, signals.explorationSetting);

  const hybrid = resolveHybridWeights(typeof signals.semanticSimilarity === 'number');

  const score = clamp01(
    structured * hybrid.structured +
      behavior * hybrid.behavior +
      semantic * hybrid.semantic +
      exploration * hybrid.exploration,
  );

  return {
    score,
    novelty,
    facets,
    components: { medium, era, theme, style, experience, exploration, behavior, semantic },
  };
}

interface ReasonCandidate {
  weight: number;
  text: string;
}

/**
 * Turns component scores into sentences a person can act on.
 *
 * Only strong components produce a reason, and the wording never leaks a
 * number or a dimension name: "Nature is one of your favourite themes", not
 * "themeWeight=0.87".
 */
export function generateRecommendationReasons(
  scored: ScoredArtwork,
  signals: ScoringSignals,
  options: { hasSearchQuery?: boolean; savedArtistMatch?: string | null } = {},
): string[] {
  const { components, facets } = scored;
  const candidates: ReasonCandidate[] = [];

  const topMatch = (dimension: PreferenceDimension): string | null => {
    const keys = facetKeysFor(facets, dimension);
    if (keys.length === 0) return null;
    const map = signals.blended[dimension] as Record<string, number>;
    let best: string | null = null;
    let bestWeight = 0;
    for (const key of keys) {
      const weight = map[key] ?? 0;
      if (weight > bestWeight) {
        bestWeight = weight;
        best = key;
      }
    }
    return bestWeight > 0.25 ? best : null;
  };

  const medium = topMatch('medium');
  if (medium && components.medium > 0.5) {
    candidates.push({
      weight: components.medium * RECOMMENDATION_WEIGHTS.medium,
      text: `Matches your interest in ${MEDIUM_LABELS[medium as keyof typeof MEDIUM_LABELS].toLowerCase()}`,
    });
  }

  const theme = topMatch('theme');
  if (theme && components.theme > 0.5) {
    candidates.push({
      weight: components.theme * RECOMMENDATION_WEIGHTS.theme,
      text: `${THEME_LABELS[theme as keyof typeof THEME_LABELS]} is one of your favourite themes`,
    });
  }

  const era = topMatch('era');
  if (era && components.era > 0.5) {
    candidates.push({
      weight: components.era * RECOMMENDATION_WEIGHTS.era,
      text: `From the ${ERA_LABELS[era as keyof typeof ERA_LABELS].toLowerCase()} period you gravitate toward`,
    });
  }

  const style = topMatch('style');
  if (style && components.style > 0.5) {
    candidates.push({
      weight: components.style * RECOMMENDATION_WEIGHTS.style,
      text: `Has the ${STYLE_LABELS[style as keyof typeof STYLE_LABELS].toLowerCase()} quality you tend to pick`,
    });
  }

  const experience = topMatch('experience');
  if (experience && components.experience > 0.5) {
    candidates.push({
      weight: components.experience * RECOMMENDATION_WEIGHTS.experience,
      text: `Fits the ${EXPERIENCE_LABELS[experience as keyof typeof EXPERIENCE_LABELS].toLowerCase()} visit you said you wanted`,
    });
  }

  if (options.savedArtistMatch) {
    candidates.push({
      weight: 0.5,
      text: `You have saved work by ${options.savedArtistMatch} before`,
    });
  } else if (components.behavior > 0.55) {
    candidates.push({ weight: 0.35, text: 'Similar to artwork you have been saving' });
  }

  if (options.hasSearchQuery && components.semantic > 0.6) {
    candidates.push({ weight: 0.3, text: 'Closely matches what you searched for' });
  }

  if (scored.novelty > 0.55 && signals.explorationSetting > 0.6 && components.exploration > 0.6) {
    candidates.push({
      weight: 0.25,
      text: 'A more adventurous pick, based on your discovery setting',
    });
  }

  const reasons = candidates
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((candidate) => candidate.text);

  // Never show a card with no explanation at all.
  if (reasons.length === 0) {
    reasons.push('A broad pick while MuseMatch learns what you like');
  }

  return reasons;
}
