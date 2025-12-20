import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApiSuccess,
  CreateVisitInput,
  UpdateVisitInput,
  Visit,
  VisitDetail,
} from '@musematch/shared';
import { api } from './client';
import { queryKeys } from './queryKeys';

function useVisitMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<VisitDetail>,
  visitId?: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (visit) => {
      queryClient.setQueryData(queryKeys.visit(visit.id), visit);
      void queryClient.invalidateQueries({ queryKey: queryKeys.visits });
      if (visitId && visit.id !== visitId)
        void queryClient.invalidateQueries({ queryKey: queryKeys.visit(visitId) });
    },
  });
}

export function useVisits() {
  return useQuery({
    queryKey: queryKeys.visits,
    queryFn: async () => (await api.get<ApiSuccess<Visit[]>>('/visits')).data,
  });
}

export function useVisit(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.visit(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () =>
      (await api.get<ApiSuccess<VisitDetail>>(`/visits/${encodeURIComponent(id as string)}`)).data,
  });
}

export function useCreateVisit() {
  return useVisitMutation(
    async (input: CreateVisitInput) =>
      (await api.post<ApiSuccess<VisitDetail>>('/visits', input)).data,
  );
}

export function useUpdateVisit(id: string) {
  return useVisitMutation(
    async (input: UpdateVisitInput) =>
      (await api.patch<ApiSuccess<VisitDetail>>(`/visits/${encodeURIComponent(id)}`, input)).data,
    id,
  );
}

export function useGenerateVisit(id: string) {
  return useVisitMutation(
    async () =>
      (await api.post<ApiSuccess<VisitDetail>>(`/visits/${encodeURIComponent(id)}/generate`)).data,
    id,
  );
}

export function useAddToVisit() {
  return useVisitMutation(
    async ({ visitId, artworkId }: { visitId: string; artworkId: string }) =>
      (
        await api.post<ApiSuccess<VisitDetail>>(`/visits/${encodeURIComponent(visitId)}/items`, {
          artworkId,
        })
      ).data,
  );
}

export function useRemoveFromVisit(id: string) {
  return useVisitMutation(
    async (artworkId: string) =>
      (
        await api.delete<ApiSuccess<VisitDetail>>(
          `/visits/${encodeURIComponent(id)}/items/${encodeURIComponent(artworkId)}`,
        )
      ).data,
    id,
  );
}

export function useReorderVisit(id: string) {
  return useVisitMutation(
    async (artworkIds: string[]) =>
      (
        await api.put<ApiSuccess<VisitDetail>>(`/visits/${encodeURIComponent(id)}/reorder`, {
          artworkIds,
        })
      ).data,
    id,
  );
}

export function useDeleteVisit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete<void>(`/visits/${encodeURIComponent(id)}`),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: queryKeys.visit(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.visits });
    },
  });
}
