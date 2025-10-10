import {
  EMPTY_PREFERENCE_WEIGHTS,
  type PreferenceDimension,
  type PreferenceWeights,
  PREFERENCE_DIMENSIONS,
} from '@musematch/shared';

/** Weights are always kept inside [0, 1] so scores stay comparable. */
export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Scales a weight map so its largest value is 1, preserving relative order.
 *
 * Used after aggregating quiz contributions: what matters is which mediums a
 * user prefers relative to each other, not how many boxes they ticked.
 */
export function normalizeWeightMap(map: Record<string, number>): Record<string, number> {
  const entries = Object.entries(map).filter(([, value]) => value > 0);
  if (entries.length === 0) return {};

  const max = Math.max(...entries.map(([, value]) => value));
  if (max <= 0) return {};

  return Object.fromEntries(entries.map(([key, value]) => [key, clamp01(value / max)]));
}

export function normalizePreferenceWeights(weights: PreferenceWeights): PreferenceWeights {
  const result = createEmptyWeights();
  for (const dimension of PREFERENCE_DIMENSIONS) {
    result[dimension] = normalizeWeightMap(weights[dimension] as Record<string, number>);
  }
  return result;
}

export function createEmptyWeights(): PreferenceWeights {
  return {
    medium: {},
    era: {},
    theme: {},
    experience: {},
    style: {},
  };
}

/**
 * Reads a PreferenceWeights value out of a Prisma `Json` column.
 * Anything unrecognized degrades to empty rather than throwing -- a corrupt
 * profile should mean weaker recommendations, not a broken feed.
 */
export function parsePreferenceWeights(value: unknown): PreferenceWeights {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createEmptyWeights();
  }

  const source = value as Record<string, unknown>;
  const result = createEmptyWeights();

  for (const dimension of PREFERENCE_DIMENSIONS) {
    const raw = source[dimension];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;

    const map: Record<string, number> = {};
    for (const [key, weight] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof weight === 'number' && Number.isFinite(weight)) {
        map[key] = clamp01(weight);
      }
    }
    result[dimension] = map;
  }

  return result;
}

export function getWeight(
  weights: PreferenceWeights,
  dimension: PreferenceDimension,
  key: string,
): number {
  const map = weights[dimension] as Record<string, number>;
  return map[key] ?? 0;
}

/** Merges two weight maps, taking the larger value for shared keys. */
export function mergeWeights(a: PreferenceWeights, b: PreferenceWeights): PreferenceWeights {
  const result = createEmptyWeights();

  for (const dimension of PREFERENCE_DIMENSIONS) {
    const merged: Record<string, number> = { ...(a[dimension] as Record<string, number>) };
    for (const [key, value] of Object.entries(b[dimension] as Record<string, number>)) {
      merged[key] = Math.max(merged[key] ?? 0, value);
    }
    result[dimension] = merged;
  }

  return result;
}

/**
 * Blends explicit and behavioral weights into the single map used for scoring
 * and for the dashboard. Behavior is deliberately the smaller share: what a
 * user said they like still counts for more than a handful of clicks.
 */
export function blendWeights(
  explicit: PreferenceWeights,
  behavioral: PreferenceWeights,
  behavioralShare: number,
): PreferenceWeights {
  const share = clamp01(behavioralShare);
  const result = createEmptyWeights();

  for (const dimension of PREFERENCE_DIMENSIONS) {
    const explicitMap = explicit[dimension] as Record<string, number>;
    const behavioralMap = behavioral[dimension] as Record<string, number>;
    const keys = new Set([...Object.keys(explicitMap), ...Object.keys(behavioralMap)]);

    const blended: Record<string, number> = {};
    for (const key of keys) {
      const value = (explicitMap[key] ?? 0) * (1 - share) + (behavioralMap[key] ?? 0) * share;
      if (value > 0) blended[key] = clamp01(value);
    }
    result[dimension] = blended;
  }

  return result;
}

/** Returns the highest-weighted keys of a dimension, strongest first. */
export function topKeys(
  weights: PreferenceWeights,
  dimension: PreferenceDimension,
  count: number,
): Array<{ key: string; weight: number }> {
  return Object.entries(weights[dimension] as Record<string, number>)
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([key, weight]) => ({ key, weight }));
}

export { EMPTY_PREFERENCE_WEIGHTS };
