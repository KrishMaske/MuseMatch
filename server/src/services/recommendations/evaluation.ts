import { parseArtworkFacets, type Artwork, type QuizAnswers } from '@musematch/shared';
import { createEmptyWeights } from '../../utils/weights.js';
import { transformQuizAnswers } from '../profile/preferenceService.js';
import { scoreArtwork, toMatchPercent, type ScoringSignals } from './scoring.js';

/**
 * Recommendation evaluation.
 *
 * Checking that the scorer runs proves nothing; what matters is whether the
 * ranking it produces is *plausible*. These synthetic visitors give that a
 * concrete, repeatable definition: each one states a taste in quiz answers and
 * declares which facets its top results ought to carry.
 *
 * Used by both the unit tests and `npm run eval:recommendations`, so tuning a
 * weight in `config.ts` immediately shows whether ranking behavior held up.
 */

export interface EvaluationProfile {
  id: string;
  description: string;
  answers: QuizAnswers;
  /** At least one of these facet tags should appear on a good top result. */
  expectedTags: string[];
  /** How many of the top results must carry one, out of `topN`. */
  minMatchingTopResults: number;
}

export const EVALUATION_PROFILES: EvaluationProfile[] = [
  {
    id: 'landscape-calm',
    description: 'Loves Impressionism, nature and relaxing paintings',
    answers: {
      medium: ['painting'],
      era: ['19th-century', 'modern'],
      theme: ['nature'],
      experience: ['relaxing'],
      style: ['colorful', 'peaceful'],
      doorway: ['light-room'],
      pace: ['slow'],
      exploration: ['familiar'],
    },
    expectedTags: ['theme:nature', 'style:peaceful', 'medium:painting'],
    minMatchingTopResults: 4,
  },
  {
    id: 'contemporary-experimental',
    description: 'Loves contemporary sculpture and experimental work',
    answers: {
      medium: ['sculpture', 'digital-art'],
      era: ['contemporary', 'modern'],
      theme: ['abstraction'],
      experience: ['experimental', 'thought-provoking'],
      style: ['minimal', 'abstract'],
      doorway: ['white-room'],
      pace: ['wander'],
      exploration: ['exploratory'],
    },
    expectedTags: [
      'era:contemporary',
      'era:modern',
      'medium:sculpture',
      'theme:abstraction',
      'experience:experimental',
    ],
    minMatchingTopResults: 3,
  },
  {
    id: 'historical-portraits',
    description: 'Loves historical portraiture and Renaissance art',
    answers: {
      medium: ['painting'],
      era: ['renaissance', 'baroque'],
      theme: ['portraits', 'religion'],
      experience: ['historical', 'educational'],
      style: ['realistic', 'detailed'],
      doorway: ['dark-room'],
      pace: ['reader'],
      exploration: ['familiar'],
    },
    expectedTags: [
      'theme:portraits',
      'theme:religion',
      'era:renaissance',
      'era:baroque',
      'experience:historical',
    ],
    minMatchingTopResults: 3,
  },
];

export interface EvaluationResult {
  profile: EvaluationProfile;
  topResults: Array<{ artwork: Artwork; score: number; matchPercent: number; matched: boolean }>;
  matchingCount: number;
  passed: boolean;
}

/**
 * Scores artworks against a synthetic profile using only explicit preferences.
 *
 * Behavior and semantics are deliberately left out: this measures whether the
 * structured scorer alone puts sensible work at the top, which is the part a
 * weight change is most likely to break.
 */
export function evaluateProfile(
  profile: EvaluationProfile,
  artworks: Artwork[],
  topN = 10,
): EvaluationResult {
  const { weights, explorationScore } = transformQuizAnswers(profile.answers);

  const signals: ScoringSignals = {
    blended: weights,
    behavioral: createEmptyWeights(),
    explorationSetting: explorationScore,
  };

  const ranked = artworks
    .map((artwork) => {
      const result = scoreArtwork(artwork, signals);
      return { artwork, score: result.score, matchPercent: toMatchPercent(result.score) };
    })
    .sort((a, b) => b.score - a.score || a.artwork.id.localeCompare(b.artwork.id))
    .slice(0, topN);

  const expected = new Set(profile.expectedTags);
  const topResults = ranked.map((entry) => ({
    ...entry,
    matched: entry.artwork.tags.some((tag) => expected.has(tag)),
  }));

  const matchingCount = topResults.filter((entry) => entry.matched).length;

  return {
    profile,
    topResults,
    matchingCount,
    passed: matchingCount >= profile.minMatchingTopResults,
  };
}

/** Facet tags of an artwork, for reporting. */
export function describeFacets(artwork: Artwork): string {
  const facets = parseArtworkFacets(artwork.tags);
  return [
    facets.mediums.join('/') || '-',
    facets.era ?? '-',
    facets.themes.join('/') || '-',
    facets.styles.join('/') || '-',
  ].join(' | ');
}
