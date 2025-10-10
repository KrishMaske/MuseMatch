import type { Prisma } from '@prisma/client';
import {
  DEFAULT_EXPLORATION_SCORE,
  PREFERENCE_DIMENSIONS,
  QUIZ_QUESTIONS,
  QUIZ_RANK_DECAY,
  parseArtworkFacets,
  facetKeysFor,
  type Artwork,
  type ArtworkFacets,
  type InteractionType,
  type PreferenceWeights,
  type QuizAnswers,
  type TasteProfile,
} from '@musematch/shared';
import { INTERACTION_STRENGTHS } from '@musematch/shared';
import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/errors.js';
import {
  blendWeights,
  clamp01,
  createEmptyWeights,
  normalizePreferenceWeights,
  parsePreferenceWeights,
} from '../../utils/weights.js';
import { BEHAVIOR_CONFIG } from '../recommendations/config.js';

/**
 * Owns the user's taste profile: how quiz answers become weights, and how
 * behavior moves those weights over time.
 *
 * Explicit and behavioral weights are stored separately and blended only at
 * read time. That separation is what makes it possible to re-tune the
 * behavioral influence, or discard it entirely, without destroying what the
 * user originally told us.
 */

export interface QuizTransformResult {
  weights: PreferenceWeights;
  explorationScore: number;
}

/**
 * Turns quiz answers into normalized weights.
 *
 * Two rules do the work: a contribution table on each option (so the meaning
 * of an answer lives with the answer), and a rank decay so a user's first pick
 * counts for more than their third. Each dimension is then normalized to a max
 * of 1, so someone who ticked one box and someone who ticked three end up with
 * comparable profiles rather than different magnitudes.
 */
export function transformQuizAnswers(answers: QuizAnswers): QuizTransformResult {
  const accumulator: Record<string, Record<string, number>> = {
    medium: {},
    era: {},
    theme: {},
    experience: {},
    style: {},
  };

  let explorationScore = DEFAULT_EXPLORATION_SCORE;

  for (const question of QUIZ_QUESTIONS) {
    const selected = answers[question.id] ?? [];

    selected.forEach((value, rank) => {
      const option = question.options.find((candidate) => candidate.value === value);
      if (!option) return;

      const rankFactor = question.type === 'multi' ? QUIZ_RANK_DECAY ** rank : 1;

      for (const contribution of option.contributions) {
        const bucket = accumulator[contribution.dimension];
        if (!bucket) continue;
        bucket[contribution.key] =
          (bucket[contribution.key] ?? 0) + contribution.weight * rankFactor;
      }

      if (typeof option.exploration === 'number') {
        explorationScore = clamp01(option.exploration);
      }
    });
  }

  const weights = createEmptyWeights();
  for (const dimension of PREFERENCE_DIMENSIONS) {
    weights[dimension] = accumulator[dimension] ?? {};
  }

  return { weights: normalizePreferenceWeights(weights), explorationScore };
}

/** Rejects answers that do not match the quiz definition. */
export function validateQuizAnswers(answers: QuizAnswers): void {
  const details: Record<string, string[]> = {};

  for (const question of QUIZ_QUESTIONS) {
    const selected = answers[question.id];

    if (!selected || selected.length === 0) {
      if (question.minSelections && question.minSelections > 0) {
        details[question.id] = ['This question needs an answer.'];
      }
      continue;
    }

    const valid = new Set(question.options.map((option) => option.value));
    const unknown = selected.filter((value) => !valid.has(value));
    if (unknown.length > 0) {
      details[question.id] = [`Unknown option(s): ${unknown.join(', ')}`];
      continue;
    }

    if (question.type === 'single' && selected.length > 1) {
      details[question.id] = ['Only one answer is allowed.'];
      continue;
    }

    if (question.maxSelections && selected.length > question.maxSelections) {
      details[question.id] = [`Choose at most ${question.maxSelections}.`];
    }
  }

  if (Object.keys(details).length > 0) {
    throw AppError.validation('Some quiz answers could not be accepted.', details);
  }
}

/**
 * Moves behavioral weights toward (or away from) an artwork's facets.
 *
 * Pure so the learning rule can be tested directly. Three things happen per
 * touched dimension:
 *
 *   - every existing weight decays a little, so interests the user has stopped
 *     acting on fade instead of accumulating forever;
 *   - the step is scaled by the interaction's strength, so saving counts for
 *     more than scrolling past;
 *   - the step is divided across the facets the artwork carries in that
 *     dimension, so a record tagged with three themes does not push three
 *     times as hard as one tagged with a single theme.
 *
 * The step is small by design. A profile should follow a session's worth of
 * signals, not lurch on one click.
 */
export function applyInteractionToWeights(
  behavioral: PreferenceWeights,
  facets: ArtworkFacets,
  strength: number,
): PreferenceWeights {
  const updated = createEmptyWeights();

  for (const dimension of PREFERENCE_DIMENSIONS) {
    const map: Record<string, number> = { ...(behavioral[dimension] as Record<string, number>) };
    const keys = facetKeysFor(facets, dimension);

    if (keys.length > 0) {
      for (const key of Object.keys(map)) {
        map[key] = clamp01((map[key] ?? 0) * BEHAVIOR_CONFIG.decay);
      }

      const step = (strength * BEHAVIOR_CONFIG.learningRate) / Math.sqrt(keys.length);

      for (const key of keys) {
        map[key] = clamp01((map[key] ?? 0) + step);
      }
    }

    updated[dimension] = map;
  }

  return updated;
}

export const preferenceService = {
  async getProfile(userId: string): Promise<TasteProfile> {
    const [profile, user] = await Promise.all([
      prisma.preferenceProfile.findUnique({ where: { userId } }),
      prisma.user.findUnique({ where: { id: userId }, select: { onboardingCompleted: true } }),
    ]);

    if (!profile) {
      return {
        explicit: createEmptyWeights(),
        behavioral: createEmptyWeights(),
        explorationScore: DEFAULT_EXPLORATION_SCORE,
        onboardingCompleted: false,
        updatedAt: new Date().toISOString(),
      };
    }

    return {
      explicit: parsePreferenceWeights(profile.explicitPreferences),
      behavioral: parsePreferenceWeights(profile.behavioralPreferences),
      explorationScore: profile.explorationScore,
      onboardingCompleted: user?.onboardingCompleted ?? false,
      updatedAt: profile.updatedAt.toISOString(),
    };
  },

  /** The single map used for scoring and for the dashboard. */
  blend(profile: TasteProfile): PreferenceWeights {
    return blendWeights(profile.explicit, profile.behavioral, BEHAVIOR_CONFIG.blendShare);
  },

  async completeOnboarding(userId: string, answers: QuizAnswers): Promise<TasteProfile> {
    validateQuizAnswers(answers);
    const { weights, explorationScore } = transformQuizAnswers(answers);

    await prisma.$transaction([
      prisma.preferenceProfile.upsert({
        where: { userId },
        create: {
          userId,
          explicitPreferences: weights as unknown as Prisma.InputJsonValue,
          behavioralPreferences: createEmptyWeights() as unknown as Prisma.InputJsonValue,
          explorationScore,
        },
        update: {
          explicitPreferences: weights as unknown as Prisma.InputJsonValue,
          explorationScore,
        },
      }),
      prisma.user.update({ where: { id: userId }, data: { onboardingCompleted: true } }),
    ]);

    return this.getProfile(userId);
  },

  /** Direct edits from the profile page; behavioral weights are left alone. */
  async updateExplicit(
    userId: string,
    updates: { weights?: PreferenceWeights; explorationScore?: number },
  ): Promise<TasteProfile> {
    const data: Prisma.PreferenceProfileUpdateInput = {};

    if (updates.weights) {
      data.explicitPreferences = normalizePreferenceWeights(
        updates.weights,
      ) as unknown as Prisma.InputJsonValue;
    }
    if (typeof updates.explorationScore === 'number') {
      data.explorationScore = clamp01(updates.explorationScore);
    }

    await prisma.preferenceProfile.upsert({
      where: { userId },
      create: {
        userId,
        explicitPreferences: (updates.weights
          ? normalizePreferenceWeights(updates.weights)
          : createEmptyWeights()) as unknown as Prisma.InputJsonValue,
        behavioralPreferences: createEmptyWeights() as unknown as Prisma.InputJsonValue,
        explorationScore: clamp01(updates.explorationScore ?? DEFAULT_EXPLORATION_SCORE),
      },
      update: data,
    });

    return this.getProfile(userId);
  },

  async applyInteraction(userId: string, artwork: Artwork, type: InteractionType): Promise<void> {
    const strength = INTERACTION_STRENGTHS[type];
    if (strength === 0) return;

    const profile = await prisma.preferenceProfile.findUnique({ where: { userId } });
    const behavioral = applyInteractionToWeights(
      parsePreferenceWeights(profile?.behavioralPreferences),
      parseArtworkFacets(artwork.tags),
      strength,
    );

    await prisma.preferenceProfile.upsert({
      where: { userId },
      create: {
        userId,
        explicitPreferences: createEmptyWeights() as unknown as Prisma.InputJsonValue,
        behavioralPreferences: behavioral as unknown as Prisma.InputJsonValue,
        explorationScore: DEFAULT_EXPLORATION_SCORE,
      },
      update: { behavioralPreferences: behavioral as unknown as Prisma.InputJsonValue },
    });
  },
};
