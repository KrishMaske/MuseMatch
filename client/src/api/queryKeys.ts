import type { ArtworkSearchParams, MuseumSource } from '@musematch/shared';

/**
 * Query keys, defined centrally.
 *
 * Invalidation is only reliable if every caller spells a key the same way, so
 * no component builds one by hand.
 */
export const queryKeys = {
  profile: ['profile'] as const,
  preferences: ['profile', 'preferences'] as const,
  dashboard: ['profile', 'dashboard'] as const,
  quiz: ['onboarding', 'quiz'] as const,

  recommendations: (params: { limit?: number; museum?: MuseumSource }) =>
    ['recommendations', params] as const,

  artworks: (params: ArtworkSearchParams) => ['artworks', params] as const,
  artwork: (id: string) => ['artworks', id] as const,
  similarArtworks: (id: string) => ['artworks', id, 'similar'] as const,

  collections: ['collections'] as const,
  collection: (id: string) => ['collections', id] as const,

  visits: ['visits'] as const,
  visit: (id: string) => ['visits', id] as const,
};
