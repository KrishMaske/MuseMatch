import { describe, expect, it } from 'vitest';
import { parseArtworkFacets } from '@musematch/shared';
import { normalizeArtwork } from './normalize.js';
import { classifyEra } from './taxonomy.js';

/**
 * Normalization and classification.
 *
 * These are the tests that protect the boundary between messy museum metadata
 * and everything downstream, so they use real record shapes from both APIs.
 */

const baseSource = {
  title: 'Untitled',
  artist: null,
  medium: null,
  classification: null,
  department: null,
  culture: null,
  period: null,
  description: null,
  dateStart: null,
  dateEnd: null,
  keywords: [] as string[],
};

describe('normalizeArtwork', () => {
  it('produces the same shape for both providers', () => {
    const met = normalizeArtwork({
      source: 'MET',
      externalId: '436535',
      title: 'Wheat Field with Cypresses',
      artist: 'Vincent van Gogh',
      year: '1889',
      dateStart: 1889,
      dateEnd: 1889,
      medium: 'Oil on canvas',
      department: 'European Paintings',
    });

    const aic = normalizeArtwork({
      source: 'AIC',
      externalId: '28560',
      title: 'The Bedroom',
      artist: 'Vincent van Gogh',
      year: '1889',
      dateStart: 1889,
      dateEnd: 1889,
      medium: 'Oil on canvas',
      department: 'Painting and Sculpture of Europe',
    });

    expect(Object.keys(met).sort()).toEqual(Object.keys(aic).sort());
    expect(met.museumName).toBe('The Metropolitan Museum of Art');
    expect(aic.museumName).toBe('Art Institute of Chicago');
  });

  it('never invents a value for a field the museum did not supply', () => {
    const artwork = normalizeArtwork({
      source: 'MET',
      externalId: '1',
      title: 'Fragment',
      artist: '',
      medium: '   ',
      culture: 'Unknown',
      dateStart: 0,
    });

    expect(artwork.artist).toBeNull();
    expect(artwork.medium).toBeNull();
    expect(artwork.culture).toBeNull();
    expect(artwork.dateStart).toBeNull();
  });

  it('falls back to a title rather than an empty string', () => {
    const artwork = normalizeArtwork({ source: 'AIC', externalId: '2', title: null });
    expect(artwork.title).toBe('Untitled');
  });

  it('strips the HTML the AIC returns in descriptions', () => {
    const artwork = normalizeArtwork({
      source: 'AIC',
      externalId: '3',
      title: 'A work',
      description: '<p>A view of the <em>harbour</em> &amp; its boats.</p>',
    });

    expect(artwork.description).toBe('A view of the harbour & its boats.');
  });
});

describe('classifyArtwork', () => {
  it('reads the medium from the medium field, not the department name', () => {
    // The real failure this guards: everything in "Painting and Sculpture of
    // Europe" was being tagged as sculpture because of the department name.
    const artwork = normalizeArtwork({
      source: 'AIC',
      externalId: '28560',
      title: 'The Bedroom',
      artist: 'Vincent van Gogh',
      medium: 'Oil on canvas',
      department: 'Painting and Sculpture of Europe',
      dateStart: 1889,
      dateEnd: 1889,
    });

    const facets = parseArtworkFacets(artwork.tags);
    expect(facets.mediums).toContain('painting');
    expect(facets.mediums).not.toContain('sculpture');
  });

  it('does not read a hyphenated place name as a religious subject', () => {
    const artwork = normalizeArtwork({
      source: 'AIC',
      externalId: '4',
      title: 'The Bedroom',
      medium: 'Oil on canvas',
      description: 'Painted at the asylum in Saint-Remy in southern France.',
      dateStart: 1889,
    });

    expect(parseArtworkFacets(artwork.tags).themes).not.toContain('religion');
  });

  it('does not treat a painted decoration as a painting', () => {
    const artwork = normalizeArtwork({
      source: 'MET',
      externalId: '5',
      title: 'Bowl',
      medium: 'Earthenware; painted decoration',
      classification: 'Ceramics',
      dateStart: 900,
    });

    const facets = parseArtworkFacets(artwork.tags);
    expect(facets.mediums).toContain('decorative-arts');
    expect(facets.mediums).not.toContain('painting');
  });

  it('does not treat silk as clothing when it is a painting support', () => {
    const artwork = normalizeArtwork({
      source: 'MET',
      externalId: '6',
      title: 'Eighteen Songs of a Nomad Flute',
      medium: 'Handscroll; ink, color, and gold on silk',
      classification: 'Paintings',
      dateStart: 1400,
    });

    const facets = parseArtworkFacets(artwork.tags);
    expect(facets.mediums).toContain('painting');
    expect(facets.mediums).not.toContain('fashion');
  });

  it('derives themes and an era from a landscape record', () => {
    const artwork = normalizeArtwork({
      source: 'MET',
      externalId: '7',
      title: 'Pastoral Landscape with a Brook',
      medium: 'Oil on canvas',
      classification: 'Paintings, Landscape',
      dateStart: 1863,
      dateEnd: 1863,
    });

    const facets = parseArtworkFacets(artwork.tags);
    expect(facets.themes).toContain('nature');
    expect(facets.styles).toContain('peaceful');
    expect(facets.era).toBe('19th-century');
  });

  it('leaves facets empty rather than guessing on a bare record', () => {
    const artwork = normalizeArtwork({ source: 'MET', externalId: '8', title: 'Fragment' });
    const facets = parseArtworkFacets(artwork.tags);

    expect(facets.mediums).toEqual([]);
    expect(facets.era).toBeNull();
  });
});

describe('classifyEra', () => {
  it('places an artwork by the midpoint of its date range', () => {
    expect(classifyEra({ ...baseSource, dateStart: 1480, dateEnd: 1500 })).toBe('renaissance');
    expect(classifyEra({ ...baseSource, dateStart: 1850, dateEnd: 1860 })).toBe('19th-century');
    expect(classifyEra({ ...baseSource, dateStart: 1985, dateEnd: 1985 })).toBe('contemporary');
  });

  it('handles BCE dates', () => {
    expect(classifyEra({ ...baseSource, dateStart: -1300, dateEnd: -1200 })).toBe('ancient');
  });

  it('falls back to period text when there are no dates', () => {
    expect(classifyEra({ ...baseSource, period: 'Edo period' })).toBeNull();
    expect(classifyEra({ ...baseSource, period: 'Baroque' })).toBe('baroque');
    expect(classifyEra({ ...baseSource, culture: 'Ancient Egypt' })).toBe('ancient');
  });
});
