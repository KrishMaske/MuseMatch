import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApiSuccess,
  QuizAnswers,
  QuizQuestion,
  TasteDashboard,
  TasteProfile,
  UpdateProfileInput,
  UserProfile,
} from '@musematch/shared';
import { api } from './client';
import { queryKeys } from './queryKeys';

export function useProfile() {
  return useQuery({
    queryKey: queryKeys.profile,
    queryFn: async () => (await api.get<ApiSuccess<UserProfile>>('/profile')).data,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateProfileInput) =>
      (await api.put<ApiSuccess<UserProfile>>('/profile', input)).data,
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.profile, profile);
    },
  });
}

export function usePreferences() {
  return useQuery({
    queryKey: queryKeys.preferences,
    queryFn: async () => (await api.get<ApiSuccess<TasteProfile>>('/profile/preferences')).data,
  });
}

export function useTasteDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: async () => (await api.get<ApiSuccess<TasteDashboard>>('/profile/dashboard')).data,
  });
}

/**
 * The quiz definition comes from the server so the questions rendered are
 * exactly the ones the server will validate the answers against.
 */
export function useQuizQuestions() {
  return useQuery({
    queryKey: queryKeys.quiz,
    queryFn: async () =>
      (await api.get<ApiSuccess<{ questions: QuizQuestion[] }>>('/onboarding/quiz')).data.questions,
    staleTime: Infinity,
  });
}

export function useCompleteOnboarding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (answers: QuizAnswers) =>
      (await api.post<ApiSuccess<TasteProfile>>('/profile/onboarding', { answers })).data,
    onSuccess: () => {
      // Completing onboarding changes the profile, the preferences and every
      // recommendation, so the whole cache is stale.
      void queryClient.invalidateQueries();
    },
  });
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { explorationScore?: number }) =>
      (await api.put<ApiSuccess<TasteProfile>>('/profile/preferences', input)).data,
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.preferences, profile);
      void queryClient.invalidateQueries({ queryKey: ['recommendations'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}
