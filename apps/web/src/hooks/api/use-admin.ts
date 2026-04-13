'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  Match,
  Venue,
  Lesson,
  SportTeam,
  Payment,
  UserProfile,
  AdminUserDetail,
  AdminTeamDetail,
  AdminStats,
  AdminReview,
  AdminStatisticsOverview,
  MercenaryPost,
  Dispute,
  Settlement,
  SettlementSummary,
  PaginatedResponse,
  UpdateStatusInput,
} from '@/types/api';
import { extractData, extractCollection } from './shared';
import { queryKeys } from './query-keys';

// ── Admin Users ──
export function useAdminUsers(params?: Record<string, string>) {
  return useQuery<PaginatedResponse<UserProfile>>({
    queryKey: queryKeys.admin.users(params),
    queryFn: async () => {
      const res = await api.get('/admin/users', { params });
      return extractData<PaginatedResponse<UserProfile>>(res);
    },
  });
}

export function useAdminUser(id: string) {
  return useQuery<AdminUserDetail>({
    queryKey: queryKeys.admin.user(id),
    queryFn: async () => {
      const res = await api.get(`/admin/users/${id}`);
      return extractData<AdminUserDetail>(res);
    },
    enabled: !!id,
  });
}

// ── Admin Matches ──
export function useAdminMatches() {
  return useQuery<PaginatedResponse<Match>>({
    queryKey: queryKeys.admin.matches,
    queryFn: async () => {
      const res = await api.get('/admin/matches');
      return extractData<PaginatedResponse<Match>>(res);
    },
  });
}

export function useUpdateMatchStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateStatusInput }) => {
      const res = await api.patch(`/admin/matches/${id}/status`, data);
      return extractData<Match>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'matches'] });
    },
  });
}

// ── Admin Lessons ──
export function useAdminLessons() {
  return useQuery<Lesson[]>({
    queryKey: queryKeys.admin.lessons,
    queryFn: async () => {
      const res = await api.get('/admin/lessons');
      return extractData<Lesson[]>(res);
    },
  });
}

export function useUpdateLessonStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateStatusInput }) => {
      const res = await api.patch(`/admin/lessons/${id}/status`, data);
      return extractData<Lesson>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'lessons'] });
    },
  });
}

// ── Admin Teams ──
export function useAdminTeams() {
  return useQuery<SportTeam[]>({
    queryKey: queryKeys.admin.teams,
    queryFn: async () => {
      const res = await api.get('/admin/teams');
      return extractData<SportTeam[]>(res);
    },
  });
}

export function useAdminTeam(id: string) {
  return useQuery<AdminTeamDetail>({
    queryKey: queryKeys.admin.team(id),
    queryFn: async () => {
      const res = await api.get(`/admin/teams/${id}`);
      return extractData<AdminTeamDetail>(res);
    },
    enabled: !!id,
  });
}

// ── Admin Venues ──
export function useAdminVenues() {
  return useQuery<Venue[]>({
    queryKey: queryKeys.admin.venues,
    queryFn: async () => {
      const res = await api.get('/admin/venues');
      return extractData<Venue[]>(res);
    },
  });
}

export function useAdminVenue(id: string) {
  return useQuery<Venue>({
    queryKey: queryKeys.admin.venue(id),
    queryFn: async () => {
      const res = await api.get(`/admin/venues/${id}`);
      return extractData<Venue>(res);
    },
    enabled: !!id,
  });
}

export function useUpdateAdminVenue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await api.patch(`/admin/venues/${id}`, data);
      return extractData<Venue>(res);
    },
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.venues });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.venue(id) });
    },
  });
}

export function useDeleteAdminVenue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/admin/venues/${id}`);
      return extractData<{ id: string }>(res);
    },
    onSuccess: (_result, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.venues });
      queryClient.removeQueries({ queryKey: queryKeys.admin.venue(id) });
    },
  });
}

// ── Admin Payments ──
export function useAdminPayments() {
  return useQuery<Payment[]>({
    queryKey: queryKeys.admin.payments,
    queryFn: async () => {
      const res = await api.get('/admin/payments');
      return extractCollection<Payment>(res);
    },
  });
}

// ── Admin Stats ──
export function useAdminStats() {
  return useQuery<AdminStats>({
    queryKey: queryKeys.admin.stats,
    queryFn: async () => {
      const res = await api.get('/admin/stats');
      return extractData<AdminStats>(res);
    },
  });
}

export function useAdminStatisticsOverview() {
  return useQuery<AdminStatisticsOverview>({
    queryKey: queryKeys.admin.statistics,
    queryFn: async () => {
      const res = await api.get('/admin/statistics');
      return extractData<AdminStatisticsOverview>(res);
    },
  });
}

// ── Admin Reviews ──
export function useAdminReviews() {
  return useQuery<AdminReview[]>({
    queryKey: queryKeys.admin.reviews,
    queryFn: async () => {
      const res = await api.get('/admin/reviews');
      return extractData<AdminReview[]>(res);
    },
  });
}

// ── Admin Mercenary ──
export function useAdminMercenaryPosts() {
  return useQuery<MercenaryPost[]>({
    queryKey: queryKeys.admin.mercenary,
    queryFn: async () => {
      const res = await api.get('/admin/mercenary');
      return extractData<MercenaryPost[]>(res);
    },
  });
}

export function useDeleteAdminMercenaryPost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/admin/mercenary/${id}`);
      return extractData<{ id: string }>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.mercenary });
    },
  });
}

// ── Admin Disputes ──
export function useAdminDisputes() {
  return useQuery<Dispute[]>({
    queryKey: queryKeys.admin.disputes,
    queryFn: async () => {
      const res = await api.get('/admin/disputes');
      return extractCollection<Dispute>(res);
    },
  });
}

export function useAdminDispute(id: string) {
  return useQuery<Dispute>({
    queryKey: queryKeys.admin.dispute(id),
    queryFn: async () => {
      const res = await api.get(`/admin/disputes/${id}`);
      return extractData<Dispute>(res);
    },
    enabled: !!id,
  });
}

export function useUpdateDisputeStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateStatusInput & Record<string, unknown> }) => {
      const res = await api.patch(`/admin/disputes/${id}/status`, data);
      return extractData<Dispute>(res);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.disputes });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.dispute(id) });
    },
  });
}

// ── Admin Settlements ──
export function useAdminSettlements() {
  return useQuery<Settlement[]>({
    queryKey: queryKeys.admin.settlements,
    queryFn: async () => {
      const res = await api.get('/admin/settlements');
      return extractCollection<Settlement>(res);
    },
  });
}

export function useSettlementsSummary() {
  return useQuery<SettlementSummary>({
    queryKey: queryKeys.admin.settlementsSummary,
    queryFn: async () => {
      const res = await api.get('/admin/settlements/summary');
      return extractData<SettlementSummary>(res);
    },
  });
}

export function useProcessSettlement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await api.patch(`/admin/settlements/${id}/process`, data);
      return extractData<Settlement>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.settlements });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.settlementsSummary });
    },
  });
}
