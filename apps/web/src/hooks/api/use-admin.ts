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
  Settlement,
  SettlementSummary,
  PaginatedResponse,
  CursorPage,
  UpdateStatusInput,
} from '@/types/api';
import type { Dispute, ResolveDisputeInput, ReviewDisputeInput } from '@/types/dispute';
import type {
  Payout,
  PayoutStatus,
  EligibleSettlement,
  CreatePayoutBatchInput,
  CreatePayoutBatchResponse,
  MarkPayoutPaidInput,
  MarkPayoutFailedInput,
} from '@/types/payout';
import type { MarketplaceOrder } from '@/types/marketplace';
import { extractData, extractCollection, extractCursorPage } from './shared';
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
/** Returns cursor-paginated dispute list. UI consumers read `query.data.data[]` (CursorPage — axios unwraps outer envelope). */
export function useAdminDisputes(params?: Record<string, string>) {
  return useQuery<CursorPage<Dispute>>({
    queryKey: queryKeys.admin.disputes,
    queryFn: async () => {
      const res = await api.get('/admin/disputes', { params });
      return extractCursorPage<Dispute>(res);
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

/**
 * @deprecated REMOVED endpoint (PATCH /admin/disputes/:id/status).
 * Use useReviewDispute + useResolveDispute instead (Task 70 tech-design §2.2).
 */
export function useUpdateDisputeStatus(): never {
  throw new Error(
    'useUpdateDisputeStatus is retired. Use useReviewDispute or useResolveDispute (Task 70).'
  );
}

export function useReviewDispute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data?: ReviewDisputeInput }) => {
      const res = await api.post(`/admin/disputes/${id}/review`, data ?? {});
      return extractData<Dispute>(res);
    },
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.disputes });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.dispute(id) });
    },
  });
}

export function useResolveDispute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ResolveDisputeInput }) => {
      const res = await api.patch(`/admin/disputes/${id}/resolve`, data);
      return extractData<Dispute>(res);
    },
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.disputes });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.dispute(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      // Task 76: keep ops summary in sync after dispute resolution
      void queryClient.invalidateQueries({ queryKey: ['admin-ops-summary'] });
    },
  });
}

export function useForceReleaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const res = await api.post(`/admin/orders/${id}/force-release`, { note });
      return extractData<MarketplaceOrder>(res);
    },
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.mine });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.settlements });
    },
  });
}

// ── Admin Payouts ──

/** Returns cursor-paginated payout list. UI consumers should read `.data[]` (CursorPage shape). */
export function useAdminPayouts(params?: Record<string, string | PayoutStatus>) {
  return useQuery<CursorPage<Payout>>({
    queryKey: queryKeys.admin.payouts(params as Record<string, string> | undefined),
    queryFn: async () => {
      const res = await api.get('/admin/payouts', { params });
      return extractCursorPage<Payout>(res);
    },
  });
}

export function useAdminEligibleSettlements() {
  return useQuery<EligibleSettlement[]>({
    queryKey: queryKeys.admin.payoutsEligible,
    queryFn: async () => {
      const res = await api.get('/admin/payouts/eligible');
      return extractCollection<EligibleSettlement>(res);
    },
  });
}

export function useCreatePayoutBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data?: CreatePayoutBatchInput) => {
      const res = await api.post('/admin/payouts/batch', data ?? {});
      return extractData<CreatePayoutBatchResponse>(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.payoutsEligible });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.payouts() });
    },
  });
}

export function useMarkPayoutPaid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data?: MarkPayoutPaidInput }) => {
      const res = await api.patch(`/admin/payouts/${id}/mark-paid`, data ?? {});
      return extractData<Payout>(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.payouts() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.settlements });
      void queryClient.invalidateQueries({ queryKey: ['admin-ops-summary'] });
    },
  });
}

export function useMarkPayoutFailed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: MarkPayoutFailedInput }) => {
      const res = await api.patch(`/admin/payouts/${id}/mark-failed`, data);
      return extractData<Payout>(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.payouts() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.payoutsEligible });
      void queryClient.invalidateQueries({ queryKey: ['admin-ops-summary'] });
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
