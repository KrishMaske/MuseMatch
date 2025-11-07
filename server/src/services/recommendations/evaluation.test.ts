import { describe, expect, it } from 'vitest';
import type { Artwork } from '@musematch/shared';
import { normalizeArtwork } from '../museums/normalize.js';
import { EVALUATION_PROFILES, evaluateProfile } from './evaluation.js';

/**
 * Ranking behavior, not just execution.
 *
 * The fixture below stands in for a small museum: a few works that clearly
 * belong to each synthetic visitor's taste, plus some that clearly do not. If
 * a weight change starts putting armour in front of the landscape lover, this
 * fails.
 */

const COLLECTION: Artwork[] = [
  normalizeArtwork({
    source: 'MET',
    externalId: '1',
    title: 'Mountain Brook, a Landscape',
    artist: 'Albert Bierstadt',
    medium: 'Oil on canvas',
    classification: 'Paintings',
    dateStart: 1863,
    dateEnd: 1863,
  }),
  normalizeArtwork({
    source: 'AIC',
    externalId: '2',
    title: 'Garden Landscape at Sunset',
    artist: 'Claude Monet',
    medium: 'Oil on canvas',
    classification: 'Paintings',
    period: 'Impressionism',
    dateStart: 1890,
    dateEnd: 1890,
  }),
  normalizeArtwork({
    source: 'AIC',
    externalId: '3',
    title: 'Untitled (Abstract Composition)',
    medium: 'Bronze sculpture',
    classification: 'Sculpture',
    description: 'A non-objective abstract form exploring negative space.',
    dateStart: 1998,
    dateEnd: 1998,
  }),
  normalizeArtwork({
    source: 'AIC',
    externalId: '4',
    title: 'Video Installation for an Empty Room',
    medium: 'Digital video installation',
    classification: 'Installation',
    description: 'An immersive abstract projection.',
    dateStart: 2012,
    dateEnd: 2012,
  }),
  normalizeArtwork({
    source: 'MET',
    externalId: '5',
    title: 'Portrait of a Man',
    artist: 'Hans Memling',
    medium: 'Oil on wood',
    classification: 'Paintings',
    dateStart: 1470,
    dateEnd: 1480,
  }),
  normalizeArtwork({
    source: 'MET',
    externalId: '6',
    title: 'The Virgin and Child with Saint Anne',
    medium: 'Tempera and gold on panel',
    classification: 'Paintings',
    dateStart: 1500,
    dateEnd: 1520,
  }),
  normalizeArtwork({
    source: 'MET',
    externalId: '7',
    title: 'Field Armor for Man',
    medium: 'Steel, iron, brass and leather',
    classification: 'Armor',
    dateStart: 1550,
    dateEnd: 1560,
  }),
  normalizeArtwork({
    source: 'MET',
    externalId: '8',
    title: 'Snuffbox',
    medium: 'Porcelain with enamel decoration',
    classification: 'Ceramics',
    dateStart: 1745,
    dateEnd: 1750,
  }),
  normalizeArtwork({
    source: 'AIC',
    externalId: '9',
    title: 'Composition No. 4',
    medium: 'Acrylic on canvas',
    classification: 'Paintings',
    description: 'A geometric, non-objective composition in flat blocks of colour.',
    dateStart: 1975,
    dateEnd: 1975,
  }),
];

describe('recommendation evaluation', () => {
  for (const profile of EVALUATION_PROFILES) {
    it(`ranks plausibly for ${profile.id}: ${profile.description}`, () => {
      const result = evaluateProfile(profile, COLLECTION, 4);

      expect(
        result.matchingCount,
        `Top results were: ${result.topResults.map((entry) => entry.artwork.title).join(', ')}`,
      ).toBeGreaterThanOrEqual(Math.min(profile.minMatchingTopResults, 3));
    });
  }

  it('gives different visitors different top picks', () => {
    const [landscape, contemporary, historical] = EVALUATION_PROFILES;
    if (!landscape || !contemporary || !historical) throw new Error('Expected three profiles');

    const topFor = (profile: typeof landscape): string =>
      evaluateProfile(profile, COLLECTION, 1).topResults[0]?.artwork.title ?? '';

    const picks = new Set([topFor(landscape), topFor(contemporary), topFor(historical)]);

    // Three genuinely different tastes should not converge on one artwork.
    expect(picks.size).toBeGreaterThan(1);
  });

  it('puts a landscape in front of the landscape lover', () => {
    const landscape = EVALUATION_PROFILES[0];
    if (!landscape) throw new Error('Expected the landscape profile');

    const top = evaluateProfile(landscape, COLLECTION, 1).topResults[0];
    expect(top?.artwork.title).toMatch(/landscape/i);
  });

  it('puts historical portraiture in front of the historian', () => {
    const historian = EVALUATION_PROFILES[2];
    if (!historian) throw new Error('Expected the historical profile');

    const top = evaluateProfile(historian, COLLECTION, 2).topResults;
    expect(top.map((entry) => entry.artwork.title).join(' ')).toMatch(/portrait|virgin|saint/i);
  });

  it('is stable across runs', () => {
    const profile = EVALUATION_PROFILES[0];
    if (!profile) throw new Error('Expected a profile');

    const first = evaluateProfile(profile, COLLECTION, 5).topResults.map(
      (entry) => entry.artwork.id,
    );
    const second = evaluateProfile(profile, COLLECTION, 5).topResults.map(
      (entry) => entry.artwork.id,
    );

    expect(first).toEqual(second);
  });
});
