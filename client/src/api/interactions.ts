import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiSuccess, Interaction, RecordInteractionInput } from '@musematch/shared';
import { api } from './client';
import { queryKeys } from './queryKeys';

/**
 * Records a behavioral signal.
 *
 * Interactions teach the taste profile, so a successful one invalidates the
 * dashboard and preferences. The feed is deliberately *not* invalidated:
 * re-sorting the grid under someone's cursor the moment they save something is
 * disorienting, and the next visit picks the change up anyway.
 */
export function useRecordInteraction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: RecordInteractionInput) =>
      (await api.post<ApiSuccess<Interaction>>('/interactions', input)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      void queryClient.invalidateQueries({ queryKey: queryKeys.preferences });
    },
  });
}

/**
 * Fire-and-forget view tracking.
 *
 * A view is the weakest signal there is; if the request fails, the user should
 * never see an error about it.
 */
export function trackView(artworkId: string, sourcePage: string): void {
  void api
    .post('/interactions', { artworkId, type: 'VIEW', sourcePage } satisfies RecordInteractionInput)
    .catch(() => undefined);
}
