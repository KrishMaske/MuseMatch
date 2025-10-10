import {
  ERA_LABELS,
  EXPERIENCE_LABELS,
  MEDIUM_LABELS,
  STYLE_LABELS,
  THEME_LABELS,
  type ActivitySummary,
  type Era,
  type Experience,
  type Medium,
  type PreferenceDimension,
  type PreferenceWeights,
  type Style,
  type TasteDashboard,
  type TasteRanking,
  type Theme,
} from '@musematch/shared';
import { prisma } from '../../config/prisma.js';
import { interactionRepository } from '../../repositories/interactionRepository.js';
import { topKeys } from '../../utils/weights.js';
import { deriveArtPersonality } from './personality.js';
import { preferenceService } from './preferenceService.js';

/**
 * The taste dashboard.
 *
 * Shows the blended profile -- what the quiz said plus what behavior has since
 * added -- because that is what actually drives recommendations. Showing only
 * the quiz answers would leave a user wondering why the feed had drifted away
 * from the page describing them.
 */

const TOP_N = 5;

export const dashboardService = {
  async build(userId: string): Promise<TasteDashboard> {
    const profile = await preferenceService.getProfile(userId);
    const blended = preferenceService.blend(profile);

    const [activity, personality] = await Promise.all([
      this.buildActivity(userId),
      Promise.resolve(deriveArtPersonality(blended, profile.explorationScore)),
    ]);

    return {
      mediums: rank<Medium>(blended, 'medium', MEDIUM_LABELS),
      eras: rank<Era>(blended, 'era', ERA_LABELS),
      themes: rank<Theme>(blended, 'theme', THEME_LABELS),
      styles: rank<Style>(blended, 'style', STYLE_LABELS),
      experiences: rank<Experience>(blended, 'experience', EXPERIENCE_LABELS),
      explorationScore: profile.explorationScore,
      activity,
      personality,
      onboardingCompleted: profile.onboardingCompleted,
    };
  },

  async buildActivity(userId: string): Promise<ActivitySummary> {
    const [viewed, saved, liked, collectionsCreated, visitsPlanned] = await Promise.all([
      interactionRepository.countDistinctArtworks(userId, ['VIEW']),
      interactionRepository.countDistinctArtworks(userId, ['SAVE']),
      interactionRepository.countDistinctArtworks(userId, ['LIKE']),
      prisma.collection.count({ where: { userId } }),
      prisma.visit.count({ where: { userId } }),
    ]);

    return {
      artworksViewed: viewed,
      artworksSaved: saved,
      artworksLiked: liked,
      collectionsCreated,
      visitsPlanned,
    };
  },
};

function rank<K extends string>(
  weights: PreferenceWeights,
  dimension: PreferenceDimension,
  labels: Record<K, string>,
): TasteRanking<K>[] {
  return topKeys(weights, dimension, TOP_N).map(({ key, weight }) => ({
    key: key as K,
    label: labels[key as K] ?? key,
    weight,
  }));
}
