'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import type {
  Match,
  PaginatedResponse,
  Upload,
  CreateMatchInput,
  UpdateMatchInput,
  CancelMatchPayload,
  ArriveMatchInput,
} from '@/types/api';
import { extractData } from './shared';
import { queryKeys } from './query-keys';

// ── Matches ──
export function useMatches(params?: Record<string, string>) {
  return useQuery<PaginatedResponse<Match>>({
    queryKey: queryKeys.matches.list(params),
    queryFn: async () => {
      const res = await api.get('/matches', { params });
      return extractData<PaginatedResponse<Match>>(res);
    },
    staleTime: 3 * 60 * 1000,
  });
}

export function useRecommendedMatches() {
  const { isAuthenticated } = useAuthStore();
  return useQuery<Match[]>({
    queryKey: queryKeys.matches.recommended,
    queryFn: async () => {
      const res = await api.get('/matches/recommended');
      return extractData<Match[]>(res);
    },
    enabled: isAuthenticated,
  });
}

export function useMatch(id: string) {
  return useQuery<Match>({
    queryKey: queryKeys.matches.detail(id),
    queryFn: async () => {
      const res = await api.get(`/matches/${id}`);
      return extractData<Match>(res);
    },
    enabled: !!id,
  });
}

export function useCreateMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateMatchInput) => {
      const res = await api.post('/matches', data);
      return extractData<Match>(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.matches.all });
    },
  });
}

export function useJoinMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/matches/${id}/join`);
      return extractData<{ id: string }>(res);
    },
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.matches.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.matches.all });
    },
  });
}

export function useLeaveMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/matches/${id}/leave`);
      return { id };
    },
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.matches.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.matches.all });
    },
  });
}

export function useUpdateMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateMatchInput }) => {
      const res = await api.patch(`/matches/${id}`, data);
      return extractData<Match>(res);
    },
    onSuccess: (_match, { id }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.matches.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.matches.detail(id) });
      void queryClient.invalidateQueries({ queryKey: ['my-matches'] });
    },
  });
}

export function useCancelMatch(matchId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data?: CancelMatchPayload) => {
      const res = await api.post(`/matches/${matchId}/cancel`, data);
      return extractData<Match>(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.matches.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.matches.detail(matchId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.matches.my() });
    },
  });
}

export function useCloseMatch(matchId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await api.post(`/matches/${matchId}/close`);
      return extractData<Match>(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.matches.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.matches.detail(matchId) });
    },
  });
}

export function useArriveMatch(matchId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ArriveMatchInput) => {
      const res = await api.post(`/matches/${matchId}/arrive`, data);
      return extractData<{ arrivedAt: string }>(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.matches.detail(matchId) });
    },
  });
}

// ── My matches ──
export function useMyMatches(params?: Record<string, string>) {
  return useQuery<PaginatedResponse<Match>>({
    queryKey: queryKeys.matches.my(params),
    queryFn: async () => {
      const res = await api.get('/users/me/matches', { params });
      return extractData<PaginatedResponse<Match>>(res);
    },
  });
}

// ── Upload (shared utility used by match creation) ──
export function useUploadImages() {
  return useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      files.forEach((f) => formData.append('files', f));
      const res = await api.post('/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return extractData<Upload[]>(res);
    },
  });
}

export function useDeleteUpload() {
  return useMutation({
    mutationFn: async (uploadId: string) => {
      const res = await api.delete(`/uploads/${uploadId}`);
      return extractData<{ id: string }>(res);
    },
  });
}
