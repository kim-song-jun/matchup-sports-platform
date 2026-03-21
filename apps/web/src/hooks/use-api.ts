'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import type {
  ApiResponse,
  PaginatedResponse,
  Match,
  Venue,
  VenueScheduleSlot,
  Lesson,
  MarketplaceListing,
  UserProfile,
  SportTeam,
  TeamMatch,
  Payment,
  AdminStats,
  ChatRoom,
  ChatMessage,
  MercenaryPost,
  Badge,
  Dispute,
  Settlement,
  SettlementSummary,
  PendingReview,
  Notification,
  CreateTeamInput,
  CreateLessonInput,
  CreateListingInput,
  CreateVenueReviewInput,
  PreparePaymentInput,
  ConfirmPaymentInput,
  RefundPaymentInput,
  CreateTeamMatchInput,
  ApplyTeamMatchInput,
  TeamMatchEvaluationInput,
  SendMessageInput,
  CreateMercenaryPostInput,
  ApplyMercenaryInput,
  UpdateStatusInput,
} from '@/types/api';

// Helper: the axios response interceptor returns `response.data` (the ApiResponse),
// so `api.get(...)` resolves to `ApiResponse<T>`. We cast accordingly.
function extractData<T>(res: unknown): T {
  return (res as ApiResponse<T>).data;
}

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
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
}

export function useMe() {
  const { isAuthenticated } = useAuthStore();
  return useQuery<UserProfile>({
    queryKey: ['me'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return extractData<UserProfile>(res);
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });
}

// ── Matches ──
export function useMatches(params?: Record<string, string>) {
  return useQuery<PaginatedResponse<Match>>({
    queryKey: ['matches', params],
    queryFn: async () => {
      const res = await api.get('/matches', { params });
      return extractData<PaginatedResponse<Match>>(res);
    },
  });
}

export function useRecommendedMatches() {
  const { isAuthenticated } = useAuthStore();
  return useQuery<Match[]>({
    queryKey: ['matches', 'recommended'],
    queryFn: async () => {
      const res = await api.get('/matches/recommended');
      return extractData<Match[]>(res);
    },
    enabled: isAuthenticated,
  });
}

export function useMatch(id: string) {
  return useQuery<Match>({
    queryKey: ['match', id],
    queryFn: async () => {
      const res = await api.get(`/matches/${id}`);
      return extractData<Match>(res);
    },
    enabled: !!id,
  });
}

// ── Teams ──
export function useTeams(params?: Record<string, string>) {
  return useQuery<PaginatedResponse<SportTeam>>({
    queryKey: ['teams', params],
    queryFn: async () => {
      const res = await api.get('/teams', { params });
      return extractData<PaginatedResponse<SportTeam>>(res);
    },
  });
}

export function useTeam(id: string) {
  return useQuery<SportTeam>({
    queryKey: ['team', id],
    queryFn: async () => {
      const res = await api.get(`/teams/${id}`);
      return extractData<SportTeam>(res);
    },
    enabled: !!id,
  });
}

export function useCreateTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateTeamInput) => {
      const res = await api.post('/teams', data);
      return extractData<SportTeam>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}

// ── Lessons ──
export function useLessons(params?: Record<string, string>) {
  return useQuery<PaginatedResponse<Lesson>>({
    queryKey: ['lessons', params],
    queryFn: async () => {
      const res = await api.get('/lessons', { params });
      return extractData<PaginatedResponse<Lesson>>(res);
    },
  });
}

export function useLesson(id: string) {
  return useQuery<Lesson>({
    queryKey: ['lesson', id],
    queryFn: async () => {
      const res = await api.get(`/lessons/${id}`);
      return extractData<Lesson>(res);
    },
    enabled: !!id,
  });
}

export function useCreateLesson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateLessonInput) => {
      const res = await api.post('/lessons', data);
      return extractData<Lesson>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lessons'] });
    },
  });
}

// ── Venues ──
export function useVenues(params?: Record<string, string>) {
  return useQuery<PaginatedResponse<Venue>>({
    queryKey: ['venues', params],
    queryFn: async () => {
      const res = await api.get('/venues', { params });
      return extractData<PaginatedResponse<Venue>>(res);
    },
  });
}

export function useVenue(id: string) {
  return useQuery<Venue>({
    queryKey: ['venue', id],
    queryFn: async () => {
      const res = await api.get(`/venues/${id}`);
      return extractData<Venue>(res);
    },
    enabled: !!id,
  });
}

export function useVenueSchedule(id: string) {
  return useQuery<VenueScheduleSlot[]>({
    queryKey: ['venue', id, 'schedule'],
    queryFn: async () => {
      const res = await api.get(`/venues/${id}/schedule`);
      return extractData<VenueScheduleSlot[]>(res);
    },
    enabled: !!id,
  });
}

export function useCreateVenueReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CreateVenueReviewInput }) => {
      const res = await api.post(`/venues/${id}/reviews`, data);
      return extractData<{ id: string }>(res);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['venue', id] });
    },
  });
}

// ── Marketplace ──
export function useListings(params?: Record<string, string>) {
  return useQuery<PaginatedResponse<MarketplaceListing>>({
    queryKey: ['listings', params],
    queryFn: async () => {
      const res = await api.get('/marketplace/listings', { params });
      return extractData<PaginatedResponse<MarketplaceListing>>(res);
    },
  });
}

export function useListing(id: string) {
  return useQuery<MarketplaceListing>({
    queryKey: ['listing', id],
    queryFn: async () => {
      const res = await api.get(`/marketplace/listings/${id}`);
      return extractData<MarketplaceListing>(res);
    },
    enabled: !!id,
  });
}

export function useCreateListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateListingInput) => {
      const res = await api.post('/marketplace/listings', data);
      return extractData<MarketplaceListing>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listings'] });
    },
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await api.post(`/marketplace/listings/${id}/order`, data);
      return extractData<{ id: string }>(res);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['listing', id] });
    },
  });
}

// ── Payments ──
export function usePayments() {
  const { isAuthenticated } = useAuthStore();
  return useQuery<Payment[]>({
    queryKey: ['payments'],
    queryFn: async () => {
      const res = await api.get('/payments/me');
      return extractData<Payment[]>(res);
    },
    enabled: isAuthenticated,
  });
}

export function usePayment(id: string) {
  return useQuery<Payment>({
    queryKey: ['payment', id],
    queryFn: async () => {
      const res = await api.get(`/payments/${id}`);
      return extractData<Payment>(res);
    },
    enabled: !!id,
  });
}

export function usePreparePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: PreparePaymentInput) => {
      const res = await api.post('/payments/prepare', data);
      return extractData<Payment>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
    },
  });
}

export function useConfirmPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: ConfirmPaymentInput) => {
      const res = await api.post('/payments/confirm', data);
      return extractData<Payment>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
    },
  });
}

export function useRefundPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: RefundPaymentInput }) => {
      const res = await api.post(`/payments/${id}/refund`, data);
      return extractData<Payment>(res);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['payment', id] });
    },
  });
}

// ── Team Matches ──
export function useTeamMatches(params?: Record<string, string>) {
  return useQuery<PaginatedResponse<TeamMatch>>({
    queryKey: ['team-matches', params],
    queryFn: async () => {
      const res = await api.get('/team-matches', { params });
      return extractData<PaginatedResponse<TeamMatch>>(res);
    },
  });
}

export function useTeamMatch(id: string) {
  return useQuery<TeamMatch>({
    queryKey: ['team-match', id],
    queryFn: async () => {
      const res = await api.get(`/team-matches/${id}`);
      return extractData<TeamMatch>(res);
    },
    enabled: !!id,
  });
}

export function useTeamMatchRefereeSchedule(id: string) {
  return useQuery({
    queryKey: ['team-match-referee', id],
    queryFn: async () => {
      const res = await api.get(`/team-matches/${id}/referee-schedule`);
      return extractData<Array<{ quarter: number; teamName: string }>>(res);
    },
    enabled: !!id,
  });
}

export function useCreateTeamMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateTeamMatchInput) => {
      const res = await api.post('/team-matches', data);
      return extractData<TeamMatch>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-matches'] });
    },
  });
}

export function useApplyTeamMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ApplyTeamMatchInput }) => {
      const res = await api.post(`/team-matches/${id}/apply`, data);
      return extractData<{ id: string }>(res);
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
      return extractData<{ id: string }>(res);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['team-match', id] });
    },
  });
}

export function useSubmitTeamMatchEvaluation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: TeamMatchEvaluationInput }) => {
      const res = await api.post(`/team-matches/${id}/evaluate`, data);
      return extractData<{ id: string }>(res);
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
      return extractData<{ id: string }>(res);
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['team-match', id] });
    },
  });
}

// ── Admin ──
export function useAdminUsers(params?: Record<string, string>) {
  return useQuery<PaginatedResponse<UserProfile>>({
    queryKey: ['admin', 'users', params],
    queryFn: async () => {
      const res = await api.get('/admin/users', { params });
      return extractData<PaginatedResponse<UserProfile>>(res);
    },
  });
}

export function useAdminUser(id: string) {
  return useQuery<UserProfile>({
    queryKey: ['admin', 'user', id],
    queryFn: async () => {
      const res = await api.get(`/admin/users/${id}`);
      return extractData<UserProfile>(res);
    },
    enabled: !!id,
  });
}

export function useAdminMatches() {
  return useQuery<PaginatedResponse<Match>>({
    queryKey: ['admin', 'matches'],
    queryFn: async () => {
      const res = await api.get('/admin/matches');
      return extractData<PaginatedResponse<Match>>(res);
    },
  });
}

export function useAdminLessons() {
  return useQuery<Lesson[]>({
    queryKey: ['admin', 'lessons'],
    queryFn: async () => {
      const res = await api.get('/admin/lessons');
      return extractData<Lesson[]>(res);
    },
  });
}

export function useAdminTeams() {
  return useQuery<SportTeam[]>({
    queryKey: ['admin', 'teams'],
    queryFn: async () => {
      const res = await api.get('/admin/teams');
      return extractData<SportTeam[]>(res);
    },
  });
}

export function useAdminVenues() {
  return useQuery<Venue[]>({
    queryKey: ['admin', 'venues'],
    queryFn: async () => {
      const res = await api.get('/admin/venues');
      return extractData<Venue[]>(res);
    },
  });
}

export function useAdminPayments() {
  return useQuery<PaginatedResponse<Payment>>({
    queryKey: ['admin', 'payments'],
    queryFn: async () => {
      const res = await api.get('/admin/payments');
      return extractData<PaginatedResponse<Payment>>(res);
    },
  });
}

export function useAdminStats() {
  return useQuery<AdminStats>({
    queryKey: ['admin', 'stats'],
    queryFn: async () => {
      const res = await api.get('/admin/stats');
      return extractData<AdminStats>(res);
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

// ── Chat ──
export function useChatRooms() {
  const { isAuthenticated } = useAuthStore();
  return useQuery<ChatRoom[]>({
    queryKey: ['chat', 'rooms'],
    queryFn: async () => {
      const res = await api.get('/chat/rooms');
      return extractData<ChatRoom[]>(res);
    },
    enabled: isAuthenticated,
  });
}

export function useChatMessages(roomId: string) {
  return useQuery<ChatMessage[]>({
    queryKey: ['chat', 'messages', roomId],
    queryFn: async () => {
      const res = await api.get(`/chat/rooms/${roomId}`);
      return extractData<ChatMessage[]>(res);
    },
    enabled: !!roomId,
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ roomId, data }: { roomId: string; data: SendMessageInput }) => {
      const res = await api.post(`/chat/rooms/${roomId}/messages`, data);
      return extractData<ChatMessage>(res);
    },
    onSuccess: (_, { roomId }) => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'messages', roomId] });
    },
  });
}

// ── Mercenary ──
export function useMercenaryPosts(params?: Record<string, string>) {
  return useQuery<PaginatedResponse<MercenaryPost>>({
    queryKey: ['mercenary', params],
    queryFn: async () => {
      const res = await api.get('/mercenary', { params });
      return extractData<PaginatedResponse<MercenaryPost>>(res);
    },
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
      queryClient.invalidateQueries({ queryKey: ['mercenary'] });
    },
  });
}

export function useApplyMercenary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ApplyMercenaryInput }) => {
      const res = await api.post(`/mercenary/${id}/apply`, data);
      return extractData<{ id: string }>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mercenary'] });
    },
  });
}

// ── Badges ──
export function useTeamBadges(teamId: string) {
  return useQuery<Badge[]>({
    queryKey: ['badges', 'team', teamId],
    queryFn: async () => {
      const res = await api.get(`/badges/team/${teamId}`);
      return extractData<Badge[]>(res);
    },
    enabled: !!teamId,
  });
}

export function useAllBadgeTypes() {
  return useQuery<Badge[]>({
    queryKey: ['badges'],
    queryFn: async () => {
      const res = await api.get('/badges');
      return extractData<Badge[]>(res);
    },
  });
}

// ── Disputes ──
export function useAdminDisputes() {
  return useQuery<Dispute[]>({
    queryKey: ['admin', 'disputes'],
    queryFn: async () => {
      const res = await api.get('/admin/disputes');
      return extractData<Dispute[]>(res);
    },
  });
}

export function useAdminDispute(id: string) {
  return useQuery<Dispute>({
    queryKey: ['admin', 'dispute', id],
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
    mutationFn: async ({ id, data }: { id: string; data: UpdateStatusInput }) => {
      const res = await api.patch(`/admin/disputes/${id}/status`, data);
      return extractData<Dispute>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'disputes'] });
    },
  });
}

// ── Settlements ──
export function useAdminSettlements() {
  return useQuery<Settlement[]>({
    queryKey: ['admin', 'settlements'],
    queryFn: async () => {
      const res = await api.get('/admin/settlements');
      return extractData<Settlement[]>(res);
    },
  });
}

export function useSettlementsSummary() {
  return useQuery<SettlementSummary>({
    queryKey: ['admin', 'settlements', 'summary'],
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
      queryClient.invalidateQueries({ queryKey: ['admin', 'settlements'] });
    },
  });
}

// ── Reviews ──
export function useCreateReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { matchId: string; targetId: string; skillRating: number; mannerRating: number; comment?: string }) => {
      const res = await api.post('/reviews', data);
      return extractData<{ id: string }>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
    },
  });
}

export function usePendingReviews() {
  const { isAuthenticated } = useAuthStore();
  return useQuery<PendingReview[]>({
    queryKey: ['reviews', 'pending'],
    queryFn: async () => {
      const res = await api.get('/reviews/pending');
      return extractData<PendingReview[]>(res);
    },
    enabled: isAuthenticated,
  });
}

// ── Notifications ──
export function useNotifications() {
  const { isAuthenticated } = useAuthStore();
  return useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await api.get('/notifications');
      return extractData<Notification[]>(res);
    },
    enabled: isAuthenticated,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/notifications/${id}/read`);
      return extractData<{ id: string }>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

// ── User profile (public) ──
export function useUserProfile(id: string) {
  return useQuery<UserProfile>({
    queryKey: ['user', id],
    queryFn: async () => {
      const res = await api.get(`/users/${id}`);
      return extractData<UserProfile>(res);
    },
    enabled: !!id,
  });
}

// ── My matches ──
export function useMyMatches(params?: Record<string, string>) {
  return useQuery<PaginatedResponse<Match>>({
    queryKey: ['my-matches', params],
    queryFn: async () => {
      const res = await api.get('/users/me/matches', { params });
      return extractData<PaginatedResponse<Match>>(res);
    },
  });
}
