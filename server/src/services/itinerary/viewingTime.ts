import {
  VIEWING_TIME_MINUTES,
  parseArtworkFacets,
  type Artwork,
  type ViewingTimeClass,
} from '@musematch/shared';

/**
 * Dwell-time estimation.
 *
 * These are planning conventions, not measurements of how long anyone actually
 * looks at anything. They exist so that a two-hour budget yields a walkable
 * number of stops instead of a list nobody could finish. Centralized here so
 * the assumption can be changed in one place, and so the itinerary can be
 * honest with the user about it being an estimate.
 */

const INSTALLATION_PATTERN = /installation|video|projection|environment|immersive|digital/i;

export function classifyViewingTime(artwork: Artwork): ViewingTimeClass {
  const facets = parseArtworkFacets(artwork.tags);
  const descriptor = `${artwork.classification ?? ''} ${artwork.medium ?? ''}`;

  if (facets.mediums.includes('digital-art') || INSTALLATION_PATTERN.test(descriptor)) {
    return 'installation';
  }

  // The Met flags its own highlights; treat those as works people linger on.
  if (artwork.metadata['isHighlight'] === true) return 'major';

  // A long curatorial description usually means there is something to read.
  if (artwork.description && artwork.description.length > 400) return 'major';

  return 'standard';
}

export function estimateViewingMinutes(artwork: Artwork): number {
  return VIEWING_TIME_MINUTES[classifyViewingTime(artwork)];
}
