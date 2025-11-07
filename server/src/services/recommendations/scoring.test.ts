import { describe, expect, it } from 'vitest';
import { parseArtworkFacets, type Artwork, type PreferenceWeights } from '@musematch/shared';
import { createEmptyWeights } from '../../utils/weights.js';
import { normalizeArtwork } from '../museums/normalize.js';
import {
  calculateExplorationScore,
  calculateStructuredScore,
  generateRecommendationReasons,
  scoreArtwork,
  toMatchPercent,
  type ScoringSignals,
} from './scoring.js';

function makeWeights(overrides: Partial<PreferenceWeights>): PreferenceWeights {
  return { ...createEmptyWeights(), ...overrides };
}

function signals(overrides: Partial<ScoringSignals> = {}): ScoringSignals {
  return {
    blended: createEmptyWeights(),
    behavioral: createEmptyWeights(),
    explorationSetting: 0.5,
    ...overrides,
  };
}

const landscapePainting: Artwork = normalizeArtwork({
  source: 'MET',
  externalId: 'landscape',
  title: 'Mountain Brook',
  artist: 'Albert Bierstadt',
  medium: 'Oil on canvas',
  classification: 'Paintings',
  dateStart: 1863,
  dateEnd: 1863,
});

const contemporarySculpture: Artwork = normalizeArtwork({
  source: 'AIC',
  externalId: 'sculpture',
  title: 'Untitled (Abstract Form)',
  medium: 'Bronze sculpture',
  classification: 'Sculpture',
  dateStart: 1995,
  dateEnd: 1995,
});

describe('calculateStructuredScore', () => {
  it('scores an artwork higher when it matches the profile', () => {
    const landscapeLover = makeWeights({
      medium: { painting: 1 },
      era: { '19th-century': 1 },
      theme: { nature: 1 },
      style: { peaceful: 1 },
    });

    const landscapeScore = calculateStructuredScore(
      landscapeLover,
      parseArtworkFacets(landscapePainting.tags),
    );
    const sculptureScore = calculateStructuredScore(
      landscapeLover,
      parseArtworkFacets(contemporarySculpture.tags),
    );

    expect(landscapeScore).toBeGreaterThan(sculptureScore);
  });

  it('is deterministic for the same inputs', () => {
    const weights = makeWeights({ medium: { painting: 0.8 } });
    const facets = parseArtworkFacets(landscapePainting.tags);

    expect(calculateStructuredScore(weights, facets)).toBe(
      calculateStructuredScore(weights, facets),
    );
  });

  it('stays within [0, 1] for an empty profile', () => {
    const score = calculateStructuredScore(
      createEmptyWeights(),
      parseArtworkFacets(landscapePainting.tags),
    );
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe('calculateExplorationScore', () => {
  it('peaks where novelty meets the user setting', () => {
    // A user asking for adventurous picks should be best served by novel work.
    expect(calculateExplorationScore(0.9, 0.9)).toBeCloseTo(1);
    expect(calculateExplorationScore(0.1, 0.9)).toBeCloseTo(0.2);

    // And a user asking for familiar picks by the opposite.
    expect(calculateExplorationScore(0.1, 0.1)).toBeCloseTo(1);
    expect(calculateExplorationScore(0.9, 0.1)).toBeCloseTo(0.2);
  });
});

describe('scoreArtwork', () => {
  it('ranks two different profiles differently over the same artworks', () => {
    const landscapeLover = signals({
      blended: makeWeights({
        medium: { painting: 1 },
        era: { '19th-century': 1 },
        theme: { nature: 1 },
        style: { peaceful: 1 },
      }),
    });

    const modernist = signals({
      blended: makeWeights({
        medium: { sculpture: 1 },
        era: { contemporary: 1 },
        theme: { abstraction: 1 },
        style: { abstract: 1 },
      }),
    });

    const a = scoreArtwork(landscapePainting, landscapeLover).score;
    const b = scoreArtwork(contemporarySculpture, landscapeLover).score;
    const c = scoreArtwork(landscapePainting, modernist).score;
    const d = scoreArtwork(contemporarySculpture, modernist).score;

    expect(a).toBeGreaterThan(b);
    expect(d).toBeGreaterThan(c);
  });

  it('redistributes the semantic weight when there is no embedding signal', () => {
    const base = signals({ blended: makeWeights({ medium: { painting: 1 } }) });

    const withoutSemantic = scoreArtwork(landscapePainting, base);
    const withZeroSemantic = scoreArtwork(landscapePainting, { ...base, semanticSimilarity: 0 });

    // With no vector to compare against, an artwork should not be penalized
    // for a component that had nothing to say.
    expect(withoutSemantic.score).toBeGreaterThan(withZeroSemantic.score);
  });

  it('reports every component for debugging', () => {
    const result = scoreArtwork(landscapePainting, signals());
    expect(Object.keys(result.components).sort()).toEqual(
      [
        'behavior',
        'era',
        'experience',
        'exploration',
        'medium',
        'semantic',
        'style',
        'theme',
      ].sort(),
    );
  });
});

describe('toMatchPercent', () => {
  it('is monotonic and bounded', () => {
    expect(toMatchPercent(0)).toBeLessThan(toMatchPercent(0.4));
    expect(toMatchPercent(0.4)).toBeLessThan(toMatchPercent(0.7));
    expect(toMatchPercent(2)).toBeLessThanOrEqual(100);
    expect(toMatchPercent(0)).toBeGreaterThanOrEqual(0);
  });
});

describe('generateRecommendationReasons', () => {
  it('explains a strong match in words, never in numbers', () => {
    const signal = signals({
      blended: makeWeights({
        medium: { painting: 1 },
        theme: { nature: 1 },
        era: { '19th-century': 1 },
      }),
    });

    const reasons = generateRecommendationReasons(scoreArtwork(landscapePainting, signal), signal);

    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.length).toBeLessThanOrEqual(3);
    expect(reasons.join(' ')).toMatch(/painting|nature|19th/i);
    // Era labels legitimately contain digits ("19th century"); what must never
    // leak is an internal value, e.g. "themeWeight=0.872".
    expect(reasons.join(' ')).not.toMatch(/\d+\.\d+|weight|score|=/i);
  });

  it('always returns at least one reason, even with no profile', () => {
    const signal = signals();
    const reasons = generateRecommendationReasons(scoreArtwork(landscapePainting, signal), signal);
    expect(reasons.length).toBeGreaterThan(0);
  });

  it('names a saved artist when one matches', () => {
    const signal = signals({ blended: makeWeights({ medium: { painting: 1 } }) });
    const reasons = generateRecommendationReasons(scoreArtwork(landscapePainting, signal), signal, {
      savedArtistMatch: 'Albert Bierstadt',
    });

    expect(reasons.join(' ')).toContain('Albert Bierstadt');
  });
});
