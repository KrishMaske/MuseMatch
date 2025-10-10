import { describe, expect, it } from 'vitest';
import { INTERACTION_STRENGTHS, parseArtworkFacets, type QuizAnswers } from '@musematch/shared';
import { AppError } from '../../utils/errors.js';
import { createEmptyWeights } from '../../utils/weights.js';
import { normalizeArtwork } from '../museums/normalize.js';
import {
  applyInteractionToWeights,
  transformQuizAnswers,
  validateQuizAnswers,
} from './preferenceService.js';

const completeAnswers: QuizAnswers = {
  medium: ['painting', 'photography'],
  era: ['19th-century'],
  theme: ['nature', 'cities'],
  experience: ['relaxing'],
  style: ['peaceful'],
  doorway: ['light-room'],
  pace: ['slow'],
  exploration: ['balanced'],
};

const landscape = normalizeArtwork({
  source: 'MET',
  externalId: 'landscape',
  title: 'Mountain Brook',
  medium: 'Oil on canvas',
  classification: 'Paintings',
  dateStart: 1863,
});

describe('transformQuizAnswers', () => {
  it('produces normalized weights inside [0, 1]', () => {
    const { weights } = transformQuizAnswers(completeAnswers);

    for (const map of Object.values(weights)) {
      for (const value of Object.values(map as Record<string, number>)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it('weights an earlier pick above a later one', () => {
    const { weights } = transformQuizAnswers({
      ...completeAnswers,
      medium: ['painting', 'photography'],
    });
    expect(weights.medium.painting ?? 0).toBeGreaterThan(weights.medium.photography ?? 0);
  });

  it('gives comparable magnitudes whether one or three boxes were ticked', () => {
    const oneBox = transformQuizAnswers({ ...completeAnswers, medium: ['painting'] });
    const threeBoxes = transformQuizAnswers({
      ...completeAnswers,
      medium: ['painting', 'photography', 'sculpture'],
    });

    // Normalization means the top preference is 1 either way, so a thorough
    // quiz-taker does not end up with a systematically stronger profile.
    expect(oneBox.weights.medium.painting).toBeCloseTo(1);
    expect(threeBoxes.weights.medium.painting).toBeCloseTo(1);
  });

  it('reads the exploration setting from its question', () => {
    expect(
      transformQuizAnswers({ ...completeAnswers, exploration: ['familiar'] }).explorationScore,
    ).toBeLessThan(0.3);
    expect(
      transformQuizAnswers({ ...completeAnswers, exploration: ['exploratory'] }).explorationScore,
    ).toBeGreaterThan(0.8);
  });

  it('carries cross-dimension contributions from scenario questions', () => {
    // The "bright room of landscapes" answer should push nature and calm.
    const { weights } = transformQuizAnswers({
      ...completeAnswers,
      theme: ['portraits'],
      doorway: ['light-room'],
    });

    expect(weights.theme.nature ?? 0).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    expect(transformQuizAnswers(completeAnswers)).toEqual(transformQuizAnswers(completeAnswers));
  });
});

describe('validateQuizAnswers', () => {
  it('accepts a complete set of answers', () => {
    expect(() => validateQuizAnswers(completeAnswers)).not.toThrow();
  });

  it('rejects an unknown option', () => {
    expect(() => validateQuizAnswers({ ...completeAnswers, medium: ['hologram'] })).toThrow(
      AppError,
    );
  });

  it('rejects more selections than a question allows', () => {
    expect(() =>
      validateQuizAnswers({
        ...completeAnswers,
        medium: ['painting', 'photography', 'sculpture', 'fashion'],
      }),
    ).toThrow(AppError);
  });

  it('rejects multiple answers to a single-choice question', () => {
    expect(() =>
      validateQuizAnswers({ ...completeAnswers, exploration: ['familiar', 'balanced'] }),
    ).toThrow(AppError);
  });

  it('rejects a missing required answer', () => {
    const { medium: _medium, ...withoutMedium } = completeAnswers;
    expect(() => validateQuizAnswers(withoutMedium)).toThrow(AppError);
  });
});

describe('applyInteractionToWeights', () => {
  const facets = parseArtworkFacets(landscape.tags);

  it("nudges the artwork's facets upward on a positive interaction", () => {
    const updated = applyInteractionToWeights(
      createEmptyWeights(),
      facets,
      INTERACTION_STRENGTHS.SAVE,
    );
    expect(updated.medium.painting ?? 0).toBeGreaterThan(0);
    expect(updated.theme.nature ?? 0).toBeGreaterThan(0);
  });

  it('moves further for a deliberate act than an incidental one', () => {
    const viewed = applyInteractionToWeights(
      createEmptyWeights(),
      facets,
      INTERACTION_STRENGTHS.VIEW,
    );
    const saved = applyInteractionToWeights(
      createEmptyWeights(),
      facets,
      INTERACTION_STRENGTHS.SAVE,
    );

    expect(saved.medium.painting ?? 0).toBeGreaterThan(viewed.medium.painting ?? 0);
  });

  it('does not swing the profile on a single interaction', () => {
    const updated = applyInteractionToWeights(
      createEmptyWeights(),
      facets,
      INTERACTION_STRENGTHS.ADD_TO_VISIT,
    );

    // The strongest possible single signal still moves a weight by well under
    // a tenth, so taste follows a session rather than one click.
    expect(updated.medium.painting ?? 0).toBeLessThan(0.1);
  });

  it('accumulates toward a stable preference over repeated interactions', () => {
    let weights = createEmptyWeights();
    for (let i = 0; i < 25; i += 1) {
      weights = applyInteractionToWeights(weights, facets, INTERACTION_STRENGTHS.SAVE);
    }

    expect(weights.medium.painting ?? 0).toBeGreaterThan(0.5);
    expect(weights.medium.painting ?? 0).toBeLessThanOrEqual(1);
  });

  it('decreases a weight on a negative interaction', () => {
    let weights = createEmptyWeights();
    for (let i = 0; i < 10; i += 1) {
      weights = applyInteractionToWeights(weights, facets, INTERACTION_STRENGTHS.SAVE);
    }

    const before = weights.medium.painting ?? 0;
    const after =
      applyInteractionToWeights(weights, facets, INTERACTION_STRENGTHS.DISLIKE).medium.painting ??
      0;

    expect(after).toBeLessThan(before);
  });

  it('never leaves a weight outside [0, 1]', () => {
    let weights = createEmptyWeights();
    for (let i = 0; i < 200; i += 1) {
      weights = applyInteractionToWeights(weights, facets, INTERACTION_STRENGTHS.ADD_TO_VISIT);
    }
    expect(weights.medium.painting ?? 0).toBeLessThanOrEqual(1);

    for (let i = 0; i < 400; i += 1) {
      weights = applyInteractionToWeights(weights, facets, INTERACTION_STRENGTHS.DISLIKE);
    }
    expect(weights.medium.painting ?? 0).toBeGreaterThanOrEqual(0);
  });

  it("splits the step across an artwork's facets so breadth is not strength", () => {
    const oneTheme = parseArtworkFacets(['theme:nature']);
    const threeThemes = parseArtworkFacets(['theme:nature', 'theme:cities', 'theme:portraits']);

    const narrow = applyInteractionToWeights(
      createEmptyWeights(),
      oneTheme,
      INTERACTION_STRENGTHS.SAVE,
    );
    const broad = applyInteractionToWeights(
      createEmptyWeights(),
      threeThemes,
      INTERACTION_STRENGTHS.SAVE,
    );

    expect(narrow.theme.nature ?? 0).toBeGreaterThan(broad.theme.nature ?? 0);
  });
});
