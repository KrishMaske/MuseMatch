import type { Era, Experience, Medium, PreferenceDimension, Style, Theme } from './preferences.js';

/**
 * Facets are the bridge between messy museum metadata and the taste
 * vocabulary. The server derives them once during normalization and stores
 * them on `Artwork.tags` as prefixed strings (`theme:nature`), which makes them
 * both filterable in SQL and readable back into a typed shape on either side.
 */
export interface ArtworkFacets {
  mediums: Medium[];
  era: Era | null;
  themes: Theme[];
  styles: Style[];
  experiences: Experience[];
  /** Tags that carry no prefix, e.g. an artist movement pulled from metadata. */
  free: string[];
}

const DIMENSION_PREFIX: Record<PreferenceDimension, string> = {
  medium: 'medium',
  era: 'era',
  theme: 'theme',
  style: 'style',
  experience: 'experience',
};

export function buildFacetTag(dimension: PreferenceDimension, key: string): string {
  return `${DIMENSION_PREFIX[dimension]}:${key}`;
}

export function parseArtworkFacets(tags: readonly string[]): ArtworkFacets {
  const facets: ArtworkFacets = {
    mediums: [],
    era: null,
    themes: [],
    styles: [],
    experiences: [],
    free: [],
  };

  for (const tag of tags) {
    const separator = tag.indexOf(':');
    if (separator === -1) {
      facets.free.push(tag);
      continue;
    }

    const prefix = tag.slice(0, separator);
    const value = tag.slice(separator + 1);
    if (!value) continue;

    switch (prefix) {
      case 'medium':
        facets.mediums.push(value as Medium);
        break;
      case 'era':
        facets.era = value as Era;
        break;
      case 'theme':
        facets.themes.push(value as Theme);
        break;
      case 'style':
        facets.styles.push(value as Style);
        break;
      case 'experience':
        facets.experiences.push(value as Experience);
        break;
      default:
        facets.free.push(tag);
    }
  }

  return facets;
}

/** Facet keys an artwork carries for one dimension, for scoring. */
export function facetKeysFor(facets: ArtworkFacets, dimension: PreferenceDimension): string[] {
  switch (dimension) {
    case 'medium':
      return facets.mediums;
    case 'era':
      return facets.era ? [facets.era] : [];
    case 'theme':
      return facets.themes;
    case 'style':
      return facets.styles;
    case 'experience':
      return facets.experiences;
    default:
      return [];
  }
}
