import { describe, expect, it } from 'vitest';
import type { Artwork, Recommendation } from '@musematch/shared';
import { normalizeArtwork } from '../museums/normalize.js';
import { ITINERARY_CONFIG } from '../recommendations/config.js';
import { applyDiversityCaps, orderByDepartment, toCandidates } from './itineraryService.js';
import { solveKnapsack } from './knapsack.js';
import { classifyViewingTime, estimateViewingMinutes } from './viewingTime.js';

describe('solveKnapsack', () => {
  it('never exceeds the budget', () => {
    const items = [
      { id: 'a', value: 5, cost: 30 },
      { id: 'b', value: 4, cost: 25 },
      { id: 'c', value: 3, cost: 20 },
      { id: 'd', value: 2, cost: 15 },
    ];

    const result = solveKnapsack(items, 60);
    expect(result.totalCost).toBeLessThanOrEqual(60);
  });

  it('finds the optimal set, not just the greedy one', () => {
    // Greedy by value-per-minute would take `a` (0.1/min) first and then have
    // only 40 minutes left, scoring 10 + 4 = 14. The optimum is b + c = 18.
    const items = [
      { id: 'a', value: 10, cost: 60 },
      { id: 'b', value: 9, cost: 50 },
      { id: 'c', value: 9, cost: 50 },
      { id: 'd', value: 4, cost: 40 },
    ];

    const result = solveKnapsack(items, 100);
    expect(result.totalValue).toBe(18);
    expect(result.items.map((item) => item.id).sort()).toEqual(['b', 'c']);
  });

  it('returns nothing when nothing fits', () => {
    const result = solveKnapsack([{ id: 'a', value: 5, cost: 90 }], 30);
    expect(result.items).toEqual([]);
    expect(result.totalCost).toBe(0);
  });

  it('handles an empty candidate list and a zero budget', () => {
    expect(solveKnapsack([], 120).items).toEqual([]);
    expect(solveKnapsack([{ id: 'a', value: 1, cost: 10 }], 0).items).toEqual([]);
  });

  it('ignores candidates with no value or no cost', () => {
    const result = solveKnapsack(
      [
        { id: 'free', value: 5, cost: 0 },
        { id: 'worthless', value: 0, cost: 10 },
        { id: 'real', value: 3, cost: 10 },
      ],
      60,
    );

    expect(result.items.map((item) => item.id)).toEqual(['real']);
  });

  it('is deterministic', () => {
    const items = [
      { id: 'a', value: 0.8, cost: 15 },
      { id: 'b', value: 0.7, cost: 10 },
      { id: 'c', value: 0.6, cost: 10 },
    ];

    expect(solveKnapsack(items, 25)).toEqual(solveKnapsack(items, 25));
  });
});

function makeRecommendation(
  id: string,
  overrides: { artist?: string | null; department?: string; score?: number } = {},
): Recommendation {
  const artwork: Artwork = {
    ...normalizeArtwork({
      source: 'MET',
      externalId: id,
      title: `Work ${id}`,
      artist: overrides.artist ?? null,
      medium: 'Oil on canvas',
      department: overrides.department ?? 'European Paintings',
      dateStart: 1880,
    }),
    id,
  };

  return {
    artwork,
    score: overrides.score ?? 0.5,
    matchPercent: 80,
    reasons: ['Because it matches your taste'],
  };
}

describe('applyDiversityCaps', () => {
  it('limits how many works one artist can contribute', () => {
    const candidates = toCandidates(
      Array.from({ length: 6 }, (_, index) =>
        makeRecommendation(`a${index}`, { artist: 'Claude Monet', score: 0.9 - index * 0.01 }),
      ),
    );

    const kept = applyDiversityCaps(candidates);
    expect(kept.length).toBe(ITINERARY_CONFIG.maxPerArtist);
  });

  it('limits how many works one department can contribute', () => {
    const candidates = toCandidates(
      Array.from({ length: 10 }, (_, index) =>
        makeRecommendation(`d${index}`, { department: 'Egyptian Art', score: 0.9 - index * 0.01 }),
      ),
    );

    expect(applyDiversityCaps(candidates).length).toBe(ITINERARY_CONFIG.maxPerDepartment);
  });

  it('keeps the strongest candidates when it has to drop some', () => {
    const candidates = toCandidates([
      makeRecommendation('weak', { artist: 'Monet', score: 0.2 }),
      makeRecommendation('strong', { artist: 'Monet', score: 0.9 }),
      makeRecommendation('middling', { artist: 'Monet', score: 0.5 }),
    ]);

    const kept = applyDiversityCaps(candidates).map((item) => item.id);
    expect(kept).toContain('strong');
    expect(kept).not.toContain('weak');
  });

  it('does not cap unattributed works by artist', () => {
    const candidates = toCandidates(
      Array.from({ length: 4 }, (_, index) =>
        makeRecommendation(`u${index}`, { artist: null, department: `Wing ${index}` }),
      ),
    );

    expect(applyDiversityCaps(candidates).length).toBe(4);
  });
});

describe('orderByDepartment', () => {
  it('groups a visit by wing rather than interleaving them', () => {
    const candidates = toCandidates([
      makeRecommendation('1', { department: 'Egyptian Art', score: 0.5 }),
      makeRecommendation('2', { department: 'Modern Art', score: 0.9 }),
      makeRecommendation('3', { department: 'Egyptian Art', score: 0.6 }),
      makeRecommendation('4', { department: 'Modern Art', score: 0.8 }),
    ]);

    const departments = orderByDepartment(candidates).map((item) => item.department);
    expect(departments).toEqual(['Modern Art', 'Modern Art', 'Egyptian Art', 'Egyptian Art']);
  });

  it('puts the strongest work first within a wing', () => {
    const candidates = toCandidates([
      makeRecommendation('low', { department: 'Modern Art', score: 0.3 }),
      makeRecommendation('high', { department: 'Modern Art', score: 0.9 }),
    ]);

    expect(orderByDepartment(candidates)[0]?.id).toBe('high');
  });

  it('keeps every selected item', () => {
    const candidates = toCandidates(
      Array.from({ length: 7 }, (_, index) =>
        makeRecommendation(`k${index}`, { department: index % 2 === 0 ? 'A' : 'B' }),
      ),
    );

    expect(orderByDepartment(candidates)).toHaveLength(7);
  });
});

describe('estimateViewingMinutes', () => {
  it('allows longer for a flagged highlight', () => {
    const standard = normalizeArtwork({
      source: 'MET',
      externalId: 's',
      title: 'A drawing',
      medium: 'Graphite on paper',
    });
    const highlight = normalizeArtwork({
      source: 'MET',
      externalId: 'h',
      title: 'A famous painting',
      medium: 'Oil on canvas',
      metadata: { isHighlight: true },
    });

    expect(estimateViewingMinutes(highlight)).toBeGreaterThan(estimateViewingMinutes(standard));
  });

  it('allows longest for an installation', () => {
    const installation = normalizeArtwork({
      source: 'AIC',
      externalId: 'i',
      title: 'Immersive room',
      medium: 'Video installation',
      classification: 'Installation',
      dateStart: 2015,
    });

    expect(classifyViewingTime(installation)).toBe('installation');
  });

  it('always returns a positive whole number of minutes', () => {
    const bare = normalizeArtwork({ source: 'MET', externalId: 'b', title: 'Fragment' });
    const minutes = estimateViewingMinutes(bare);

    expect(minutes).toBeGreaterThan(0);
    expect(Number.isInteger(minutes)).toBe(true);
  });
});

describe('itinerary generation end to end (pure stages)', () => {
  it('respects the time budget and the diversity caps together', () => {
    const recommendations = [
      ...Array.from({ length: 8 }, (_, index) =>
        makeRecommendation(`monet${index}`, {
          artist: 'Claude Monet',
          department: 'European Paintings',
          score: 0.95 - index * 0.01,
        }),
      ),
      ...Array.from({ length: 8 }, (_, index) =>
        makeRecommendation(`other${index}`, {
          artist: `Artist ${index}`,
          department: `Wing ${index}`,
          score: 0.6 - index * 0.01,
        }),
      ),
    ];

    const budget = 120 - ITINERARY_CONFIG.overheadMinutes;
    const eligible = applyDiversityCaps(toCandidates(recommendations));
    const solution = solveKnapsack(eligible, budget);

    expect(solution.totalCost).toBeLessThanOrEqual(budget);

    const monets = solution.items.filter((item) => item.artist === 'Claude Monet');
    expect(monets.length).toBeLessThanOrEqual(ITINERARY_CONFIG.maxPerArtist);
  });
});
