import { useQuery } from '@tanstack/react-query';
import type {
  ApiSuccess,
  Artwork,
  ArtworkMatch,
  ArtworkSearchParams,
  MuseumSource,
  Pagination,
  Recommendation,
} from '@musematch/shared';
import { api, buildQuery } from './client';
import { queryKeys } from './queryKeys';

interface SearchEnvelope<T> {
  data: T[];
  pagination: Pagination;
  meta?: { unavailableMuseums?: MuseumSource[] };
}

export interface ArtworkResults {
  artworks: Artwork[];
  /** Present only for semantic search, which returns scored results. */
  recommendations?: Recommendation[];
  pagination: Pagination;
  unavailableMuseums: MuseumSource[];
}

function toQuery(params: ArtworkSearchParams): string {
  return buildQuery({
    q: params.q,
    museum: params.museum,
    medium: params.medium,
    theme: params.theme,
    period: params.period,
    artist: params.artist,
    department: params.department,
    classification: params.classification,
    culture: params.culture,
    sort: params.sort,
    page: params.page,
    limit: params.limit,
    semantic: params.semantic ? 'true' : undefined,
  });
}

/**
 * Discovery results.
 *
 * Three server behaviors behind one hook, chosen by the params:
 *   - a text query hits the live museum APIs (`/artworks/search`)
 *   - a semantic query goes through pgvector and comes back scored
 *   - no query at all browses the local cache with filters (`/artworks`)
 *
 * The component just renders artworks; which path ran is not its concern.
 */
export function useArtworkSearch(params: ArtworkSearchParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.artworks(params),
    enabled,
    // Live museum calls are slow enough that refetching on every focus is
    // wasteful and visibly janky.
    staleTime: 60_000,
    queryFn: async ({ signal }): Promise<ArtworkResults> => {
      const hasQuery = Boolean(params.q?.trim());
      const path = hasQuery ? '/artworks/search' : '/artworks';

      if (hasQuery && params.semantic) {
        const response = await api.get<SearchEnvelope<Recommendation>>(
          `${path}${toQuery(params)}`,
          signal,
        );

        return {
          artworks: response.data.map((item) => item.artwork),
          recommendations: response.data,
          pagination: response.pagination,
          unavailableMuseums: response.meta?.unavailableMuseums ?? [],
        };
      }

      const response = await api.get<SearchEnvelope<Artwork>>(`${path}${toQuery(params)}`, signal);

      return {
        artworks: response.data,
        pagination: response.pagination,
        unavailableMuseums: response.meta?.unavailableMuseums ?? [],
      };
    },
  });
}

export interface ArtworkDetail {
  artwork: Artwork;
  savedInCollectionIds: string[];
  match: ArtworkMatch;
}

export function useArtwork(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.artwork(id ?? ''),
    enabled: Boolean(id),
    queryFn: async ({ signal }) =>
      (
        await api.get<ApiSuccess<ArtworkDetail>>(
          `/artworks/${encodeURIComponent(id as string)}`,
          signal,
        )
      ).data,
  });
}

export function useSimilarArtworks(id: string | undefined, limit = 8) {
  return useQuery({
    queryKey: queryKeys.similarArtworks(id ?? ''),
    enabled: Boolean(id),
    queryFn: async ({ signal }) =>
      (
        await api.get<ApiSuccess<Artwork[]>>(
          `/artworks/${encodeURIComponent(id as string)}/similar${buildQuery({ limit })}`,
          signal,
        )
      ).data,
  });
}
