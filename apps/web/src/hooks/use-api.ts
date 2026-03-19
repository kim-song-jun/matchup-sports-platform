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

// ── Team Matches ──
export function useTeamMatches(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['team-matches', params],
    queryFn: async () => {
      const res = await api.get('/team-matches', { params });
      return (res as any).data;
    },
  });
}

export function useTeamMatch(id: string) {
  return useQuery({
    queryKey: ['team-match', id],
    queryFn: async () => {
      const res = await api.get(`/team-matches/${id}`);
      return (res as any).data;
    },
    enabled: !!id,
  });
}

export function useTeamMatchRefereeSchedule(id: string) {
  return useQuery({
    queryKey: ['team-match-referee', id],
    queryFn: async () => {
      const res = await api.get(`/team-matches/${id}/referee-schedule`);
      return (res as any).data;
    },
    enabled: !!id,
  });
}

export function useCreateTeamMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/team-matches', data);
      return (res as any).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-matches'] });
    },
  });
}

export function useApplyTeamMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.post(`/team-matches/${id}/apply`, data);
      return (res as any).data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['team-match', id] });
    },
  });
}

export function useRespondTeamMatchApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, applicationId, action }: { id: string; applicationId: string; action: 'approve' | 'reject' }) => {
      const res = await api.patch(`/team-matches/${id}/applications/${applicationId}`, { action });
      return (res as any).data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['team-match', id] });
    },
  });
}

export function useSubmitTeamMatchEvaluation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.post(`/team-matches/${id}/evaluate`, data);
      return (res as any).data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['team-match', id] });
    },
  });
}

export function useTeamMatchArrival() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/team-matches/${id}/arrival`);
      return (res as any).data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['team-match', id] });
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
