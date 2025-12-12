import { useQuery } from '@tanstack/react-query';
import type { ApiSuccess, MuseumSource, Recommendation } from '@musematch/shared';
import { api, buildQuery } from './client';
import { queryKeys } from './queryKeys';

export interface RecommendationParams {
  limit?: number;
  museum?: MuseumSource;
}

export function useRecommendations(params: RecommendationParams = {}) {
  return useQuery({
    queryKey: queryKeys.recommendations(params),
    // Generating a feed can involve live museum calls; keep it warm for a
    // while so navigating back to Home is instant.
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }) =>
      (
        await api.get<ApiSuccess<{ recommendations: Recommendation[] }>>(
          `/recommendations${buildQuery({ limit: params.limit, museum: params.museum })}`,
          signal,
        )
      ).data.recommendations,
  });
}
