'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import type { UserProfile, UserPublicProfile } from '@/types/api';
import { extractData } from './shared';
import { queryKeys } from './query-keys';

// ── Auth ──
export function useDevLogin() {
  const { login } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (nickname: string) => {
      const res = await api.post('/auth/dev-login', { nickname });
      return extractData<{ accessToken: string; refreshToken: string; user: UserProfile }>(res);
    },
    onSuccess: (data) => {
      const { accessToken, refreshToken, user } = data;
      login(accessToken, refreshToken, user as never);
      queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

export function useEmailRegister() {
  const { login } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: { email: string; password: string; nickname: string }) => {
      const res = await api.post('/auth/register', dto);
      return extractData<{ accessToken: string; refreshToken: string; user: UserProfile }>(res);
    },
    onSuccess: (data) => {
      const { accessToken, refreshToken, user } = data;
      login(accessToken, refreshToken, user as never);
      queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

export function useEmailLogin() {
  const { login } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: { email: string; password: string }) => {
      const res = await api.post('/auth/login', dto);
      return extractData<{ accessToken: string; refreshToken: string; user: UserProfile }>(res);
    },
    onSuccess: (data) => {
      const { accessToken, refreshToken, user } = data;
      login(accessToken, refreshToken, user as never);
      queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

export function useMe() {
  const { isAuthenticated } = useAuthStore();
  return useQuery<UserProfile>({
    queryKey: queryKeys.me,
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return extractData<UserProfile>(res);
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });
}

// ── User profile (public) ──
export function useUserProfile(id: string) {
  return useQuery<UserProfile>({
    queryKey: queryKeys.user(id),
    queryFn: async () => {
      const res = await api.get(`/users/${id}`);
      return extractData<UserProfile>(res);
    },
    enabled: !!id,
  });
}

// ── User public profile (PII-stripped) ──
// Uses a distinct cache key from useUserProfile to avoid type ambiguity.
// The server applies toPublicProfile() projector (Wave 2B) so the response
// never contains email/phone/birthYear regardless of which hook is used.
export function useUserPublicProfile(userId: string) {
  return useQuery<UserPublicProfile>({
    queryKey: queryKeys.userPublic(userId),
    queryFn: async () => {
      const res = await api.get(`/users/${userId}`);
      return extractData<UserPublicProfile>(res);
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}

// ── User Search ──
export function useSearchUsers(query: string) {
  return useQuery<UserProfile[]>({
    queryKey: queryKeys.users.search(query),
    queryFn: async () => {
      const res = await api.get('/users/search', { params: { q: query } });
      return extractData<UserProfile[]>(res);
    },
    enabled: query.length >= 2,
    staleTime: 30 * 1000,
  });
}
