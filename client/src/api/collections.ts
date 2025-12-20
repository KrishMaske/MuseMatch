import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApiSuccess,
  Collection,
  CollectionDetail,
  CreateCollectionInput,
  UpdateCollectionInput,
} from '@musematch/shared';
import { api } from './client';
import { queryKeys } from './queryKeys';

export function useCollections() {
  return useQuery({
    queryKey: queryKeys.collections,
    queryFn: async () => (await api.get<ApiSuccess<Collection[]>>('/collections')).data,
  });
}

export function useCollection(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.collection(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () =>
      (
        await api.get<ApiSuccess<CollectionDetail>>(
          `/collections/${encodeURIComponent(id as string)}`,
        )
      ).data,
  });
}

export function useCreateCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateCollectionInput) =>
      (await api.post<ApiSuccess<Collection>>('/collections', input)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.collections });
    },
  });
}

export function useUpdateCollection(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateCollectionInput) =>
      (await api.patch<ApiSuccess<Collection>>(`/collections/${encodeURIComponent(id)}`, input))
        .data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.collections });
      void queryClient.invalidateQueries({ queryKey: queryKeys.collection(id) });
    },
  });
}

export function useDeleteCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => api.delete<void>(`/collections/${encodeURIComponent(id)}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.collections });
    },
  });
}

export function useAddToCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ collectionId, artworkId }: { collectionId: string; artworkId: string }) =>
      (
        await api.post<ApiSuccess<CollectionDetail>>(
          `/collections/${encodeURIComponent(collectionId)}/items`,
          { artworkId },
        )
      ).data,
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.collections });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.collection(variables.collectionId),
      });
      // The detail page shows which collections already hold this artwork.
      void queryClient.invalidateQueries({ queryKey: queryKeys.artwork(variables.artworkId) });
    },
  });
}

export function useRemoveFromCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ collectionId, artworkId }: { collectionId: string; artworkId: string }) =>
      (
        await api.delete<ApiSuccess<CollectionDetail>>(
          `/collections/${encodeURIComponent(collectionId)}/items/${encodeURIComponent(artworkId)}`,
        )
      ).data,
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.collections });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.collection(variables.collectionId),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.artwork(variables.artworkId) });
    },
  });
}
