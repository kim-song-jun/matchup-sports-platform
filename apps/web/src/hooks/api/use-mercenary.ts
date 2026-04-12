'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import type {
  MercenaryPost,
  MercenaryApplication,
  PaginatedResponse,
  CreateMercenaryPostInput,
  UpdateMercenaryPostInput,
  ApplyMercenaryInput,
} from '@/types/api';
import { extractData } from './shared';
import { queryKeys } from './query-keys';

// ── Mercenary ──
export function useMercenaryPosts(params?: Record<string, string>) {
  return useQuery<PaginatedResponse<MercenaryPost>>({
    queryKey: queryKeys.mercenary.list(params),
    queryFn: async () => {
      const res = await api.get('/mercenary', { params });
      return extractData<PaginatedResponse<MercenaryPost>>(res);
    },
  });
}

export function useMercenaryPost(id: string) {
  return useQuery<MercenaryPost>({
    queryKey: queryKeys.mercenary.detail(id),
    queryFn: async () => {
      const res = await api.get(`/mercenary/${id}`);
      return extractData<MercenaryPost>(res);
    },
    enabled: !!id,
  });
}

export function useCreateMercenaryPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateMercenaryPostInput) => {
      const res = await api.post('/mercenary', data);
      return extractData<MercenaryPost>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mercenary.all });
    },
  });
}

export function useUpdateMercenaryPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateMercenaryPostInput }) => {
      const res = await api.patch(`/mercenary/${id}`, data);
      return extractData<MercenaryPost>(res);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mercenary.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.mercenary.all });
    },
  });
}

export function useDeleteMercenaryPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/mercenary/${id}`);
      return extractData<{ message: string }>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mercenary.all });
    },
  });
}

export function useApplyMercenary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ApplyMercenaryInput }) => {
      const res = await api.post(`/mercenary/${id}/apply`, data);
      return extractData<MercenaryApplication>(res);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mercenary.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.mercenary.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.mercenary.myApplications() });
    },
  });
}

// ── Mercenary Applications (host management) ──
export interface MercenaryApplicationItem {
  id: string;
  postId: string;
  userId: string;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  message: string | null;
  appliedAt: string;
  decidedAt?: string | null;
  user?: {
    id: string;
    nickname: string;
    profileImageUrl: string | null;
  };
}

export function useAcceptMercenaryApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, applicationId }: { postId: string; applicationId: string }) => {
      const res = await api.patch(`/mercenary/${postId}/applications/${applicationId}/accept`);
      return extractData<MercenaryApplication>(res);
    },
    onSuccess: (_, { postId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mercenary.detail(postId) });
    },
  });
}

export function useRejectMercenaryApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, applicationId }: { postId: string; applicationId: string }) => {
      const res = await api.patch(`/mercenary/${postId}/applications/${applicationId}/reject`);
      return extractData<MercenaryApplication>(res);
    },
    onSuccess: (_, { postId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mercenary.detail(postId) });
    },
  });
}

export interface MyMercenaryApplication {
  id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  message: string | null;
  appliedAt: string;
  decidedAt: string | null;
  post: {
    id: string;
    matchDate: string;
    venue?: string | null;
    position?: string | null;
    fee?: number | null;
    sportType: string;
    team?: { id: string; name: string };
  };
}

export function useMyMercenaryApplications() {
  const { isAuthenticated } = useAuthStore();
  return useQuery<PaginatedResponse<MyMercenaryApplication>>({
    queryKey: queryKeys.mercenary.myApplications(),
    queryFn: async () => {
      const res = await api.get('/mercenary/me/applications');
      const data = extractData<PaginatedResponse<MyMercenaryApplication> | MyMercenaryApplication[]>(res);
      if (Array.isArray(data)) {
        return { items: data, nextCursor: null };
      }
      return data;
    },
    enabled: isAuthenticated,
  });
}

export function useWithdrawMercenaryApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => {
      const res = await api.delete(`/mercenary/${postId}/applications/me`);
      return extractData<MercenaryApplication>(res);
    },
    onSuccess: (_, postId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mercenary.detail(postId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.mercenary.myApplications() });
      queryClient.invalidateQueries({ queryKey: queryKeys.mercenary.all });
    },
  });
}
