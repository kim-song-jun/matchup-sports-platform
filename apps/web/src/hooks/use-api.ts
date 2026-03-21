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

// ── Teams ──
export function useTeams(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['teams', params],
    queryFn: async () => {
      const res = await api.get('/teams', { params });
      return (res as any).data;
    },
  });
}

export function useTeam(id: string) {
  return useQuery({
    queryKey: ['team', id],
    queryFn: async () => {
      const res = await api.get(`/teams/${id}`);
      return (res as any).data;
    },
    enabled: !!id,
  });
}

export function useCreateTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/teams', data);
      return (res as any).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}

// ── Lessons ──
export function useLessons(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['lessons', params],
    queryFn: async () => {
      const res = await api.get('/lessons', { params });
      return (res as any).data;
    },
  });
}

export function useLesson(id: string) {
  return useQuery({
    queryKey: ['lesson', id],
    queryFn: async () => {
      const res = await api.get(`/lessons/${id}`);
      return (res as any).data;
    },
    enabled: !!id,
  });
}

export function useCreateLesson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/lessons', data);
      return (res as any).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lessons'] });
    },
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

export function useVenue(id: string) {
  return useQuery({
    queryKey: ['venue', id],
    queryFn: async () => {
      const res = await api.get(`/venues/${id}`);
      return (res as any).data;
    },
    enabled: !!id,
  });
}

export function useVenueSchedule(id: string) {
  return useQuery({
    queryKey: ['venue', id, 'schedule'],
    queryFn: async () => {
      const res = await api.get(`/venues/${id}/schedule`);
      return (res as any).data;
    },
    enabled: !!id,
  });
}

export function useCreateVenueReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.post(`/venues/${id}/reviews`, data);
      return (res as any).data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['venue', id] });
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

export function useListing(id: string) {
  return useQuery({
    queryKey: ['listing', id],
    queryFn: async () => {
      const res = await api.get(`/marketplace/listings/${id}`);
      return (res as any).data;
    },
    enabled: !!id,
  });
}

export function useCreateListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/marketplace/listings', data);
      return (res as any).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listings'] });
    },
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.post(`/marketplace/listings/${id}/order`, data);
      return (res as any).data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['listing', id] });
    },
  });
}

// ── Payments ──
export function usePayments() {
  const { isAuthenticated } = useAuthStore();
  return useQuery({
    queryKey: ['payments'],
    queryFn: async () => {
      const res = await api.get('/payments/me');
      return (res as any).data;
    },
    enabled: isAuthenticated,
  });
}

export function usePayment(id: string) {
  return useQuery({
    queryKey: ['payment', id],
    queryFn: async () => {
      const res = await api.get(`/payments/${id}`);
      return (res as any).data;
    },
    enabled: !!id,
  });
}

export function usePreparePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/payments/prepare', data);
      return (res as any).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
    },
  });
}

export function useConfirmPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/payments/confirm', data);
      return (res as any).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
    },
  });
}

export function useRefundPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.post(`/payments/${id}/refund`, data);
      return (res as any).data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['payment', id] });
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

// ── Admin ──
export function useAdminUsers() {
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const res = await api.get('/admin/users');
      return (res as any).data;
    },
  });
}

export function useAdminUser(id: string) {
  return useQuery({
    queryKey: ['admin', 'user', id],
    queryFn: async () => {
      const res = await api.get(`/admin/users/${id}`);
      return (res as any).data;
    },
    enabled: !!id,
  });
}

export function useAdminMatches() {
  return useQuery({
    queryKey: ['admin', 'matches'],
    queryFn: async () => {
      const res = await api.get('/admin/matches');
      return (res as any).data;
    },
  });
}

export function useAdminLessons() {
  return useQuery({
    queryKey: ['admin', 'lessons'],
    queryFn: async () => {
      const res = await api.get('/admin/lessons');
      return (res as any).data;
    },
  });
}

export function useAdminTeams() {
  return useQuery({
    queryKey: ['admin', 'teams'],
    queryFn: async () => {
      const res = await api.get('/admin/teams');
      return (res as any).data;
    },
  });
}

export function useAdminVenues() {
  return useQuery({
    queryKey: ['admin', 'venues'],
    queryFn: async () => {
      const res = await api.get('/admin/venues');
      return (res as any).data;
    },
  });
}

export function useAdminPayments() {
  return useQuery({
    queryKey: ['admin', 'payments'],
    queryFn: async () => {
      const res = await api.get('/admin/payments');
      return (res as any).data;
    },
  });
}

export function useAdminStats() {
  return useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async () => {
      const res = await api.get('/admin/stats');
      return (res as any).data;
    },
  });
}

export function useUpdateMatchStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.patch(`/admin/matches/${id}/status`, data);
      return (res as any).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'matches'] });
    },
  });
}

export function useUpdateLessonStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.patch(`/admin/lessons/${id}/status`, data);
      return (res as any).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'lessons'] });
    },
  });
}

// ── Chat ──
export function useChatRooms() {
  const { isAuthenticated } = useAuthStore();
  return useQuery({
    queryKey: ['chat', 'rooms'],
    queryFn: async () => {
      const res = await api.get('/chat/rooms');
      return (res as any).data;
    },
    enabled: isAuthenticated,
  });
}

export function useChatMessages(roomId: string) {
  return useQuery({
    queryKey: ['chat', 'messages', roomId],
    queryFn: async () => {
      const res = await api.get(`/chat/rooms/${roomId}`);
      return (res as any).data;
    },
    enabled: !!roomId,
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ roomId, data }: { roomId: string; data: any }) => {
      const res = await api.post(`/chat/rooms/${roomId}/messages`, data);
      return (res as any).data;
    },
    onSuccess: (_, { roomId }) => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'messages', roomId] });
    },
  });
}

// ── Mercenary ──
export function useMercenaryPosts(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['mercenary', params],
    queryFn: async () => {
      const res = await api.get('/mercenary', { params });
      return (res as any).data;
    },
  });
}

export function useCreateMercenaryPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/mercenary', data);
      return (res as any).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mercenary'] });
    },
  });
}

export function useApplyMercenary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.post(`/mercenary/${id}/apply`, data);
      return (res as any).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mercenary'] });
    },
  });
}

// ── Badges ──
export function useTeamBadges(teamId: string) {
  return useQuery({
    queryKey: ['badges', 'team', teamId],
    queryFn: async () => {
      const res = await api.get(`/badges/team/${teamId}`);
      return (res as any).data;
    },
    enabled: !!teamId,
  });
}

export function useAllBadgeTypes() {
  return useQuery({
    queryKey: ['badges'],
    queryFn: async () => {
      const res = await api.get('/badges');
      return (res as any).data;
    },
  });
}

// ── Disputes ──
export function useAdminDisputes() {
  return useQuery({
    queryKey: ['admin', 'disputes'],
    queryFn: async () => {
      const res = await api.get('/admin/disputes');
      return (res as any).data;
    },
  });
}

export function useAdminDispute(id: string) {
  return useQuery({
    queryKey: ['admin', 'dispute', id],
    queryFn: async () => {
      const res = await api.get(`/admin/disputes/${id}`);
      return (res as any).data;
    },
    enabled: !!id,
  });
}

export function useUpdateDisputeStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.patch(`/admin/disputes/${id}/status`, data);
      return (res as any).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'disputes'] });
    },
  });
}

// ── Settlements ──
export function useAdminSettlements() {
  return useQuery({
    queryKey: ['admin', 'settlements'],
    queryFn: async () => {
      const res = await api.get('/admin/settlements');
      return (res as any).data;
    },
  });
}

export function useSettlementsSummary() {
  return useQuery({
    queryKey: ['admin', 'settlements', 'summary'],
    queryFn: async () => {
      const res = await api.get('/admin/settlements/summary');
      return (res as any).data;
    },
  });
}

export function useProcessSettlement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.patch(`/admin/settlements/${id}/process`, data);
      return (res as any).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settlements'] });
    },
  });
}

// ── Reviews ──
export function useCreateReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/reviews', data);
      return (res as any).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
    },
  });
}

export function usePendingReviews() {
  const { isAuthenticated } = useAuthStore();
  return useQuery({
    queryKey: ['reviews', 'pending'],
    queryFn: async () => {
      const res = await api.get('/reviews/pending');
      return (res as any).data;
    },
    enabled: isAuthenticated,
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

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/notifications/${id}/read`);
      return (res as any).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
