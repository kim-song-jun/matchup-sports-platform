'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

// ── Auth ──
export function useDevLogin() {
  const { login } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (nickname: string) => {
      const res = await api.post('/auth/dev-login', { nickname });
      return res as unknown as {
        data: { accessToken: string; refreshToken: string; user: any };
      };
    },
    onSuccess: (res) => {
      const { accessToken, refreshToken, user } = res.data;
      login(accessToken, refreshToken, user);
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
}

export function useMe() {
  const { isAuthenticated } = useAuthStore();
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return (res as any).data;
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });
}

// ── Matches ──
export function useMatches(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['matches', params],
    queryFn: async () => {
      const res = await api.get('/matches', { params });
      return (res as any).data;
    },
  });
}

export function useRecommendedMatches() {
  const { isAuthenticated } = useAuthStore();
  return useQuery({
    queryKey: ['matches', 'recommended'],
    queryFn: async () => {
      const res = await api.get('/matches/recommended');
      return (res as any).data;
    },
    enabled: isAuthenticated,
  });
}

export function useMatch(id: string) {
  return useQuery({
    queryKey: ['match', id],
    queryFn: async () => {
      const res = await api.get(`/matches/${id}`);
      return (res as any).data;
    },
    enabled: !!id,
  });
}

// ── Venues ──
export function useVenues(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['venues', params],
    queryFn: async () => {
      const res = await api.get('/venues', { params });
      return (res as any).data;
    },
  });
}

// ── Marketplace ──
export function useListings(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['listings', params],
    queryFn: async () => {
      const res = await api.get('/marketplace/listings', { params });
      return (res as any).data;
    },
  });
}

// ── Notifications ──
export function useNotifications() {
  const { isAuthenticated } = useAuthStore();
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await api.get('/notifications');
      return (res as any).data;
    },
    enabled: isAuthenticated,
  });
}
