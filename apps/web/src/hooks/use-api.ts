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

// ── Query Key Factory ──
export const queryKeys = {
  me: ['me'] as const,
  matches: {
    all: ['matches'] as const,
    list: (params?: Record<string, string>) => ['matches', params] as const,
    detail: (id: string) => ['matches', id] as const,
    recommended: ['matches', 'recommended'] as const,
    my: (params?: Record<string, string>) => ['my-matches', params] as const,
  },
  teams: {
    all: ['teams'] as const,
    list: (params?: Record<string, string>) => ['teams', params] as const,
    detail: (id: string) => ['teams', id] as const,
  },
  teamMatches: {
    all: ['team-matches'] as const,
    list: (params?: Record<string, string>) => ['team-matches', params] as const,
    detail: (id: string) => ['team-matches', id] as const,
    referee: (id: string) => ['team-matches', id, 'referee'] as const,
  },
  lessons: {
    all: ['lessons'] as const,
    list: (params?: Record<string, string>) => ['lessons', params] as const,
    detail: (id: string) => ['lessons', id] as const,
  },
  venues: {
    all: ['venues'] as const,
    list: (params?: Record<string, string>) => ['venues', params] as const,
    detail: (id: string) => ['venues', id] as const,
    schedule: (id: string) => ['venues', id, 'schedule'] as const,
  },
  listings: {
    all: ['listings'] as const,
    list: (params?: Record<string, string>) => ['listings', params] as const,
    detail: (id: string) => ['listings', id] as const,
  },
  payments: {
    all: ['payments'] as const,
    detail: (id: string) => ['payments', id] as const,
  },
  chat: {
    rooms: ['chat', 'rooms'] as const,
    messages: (roomId: string) => ['chat', 'messages', roomId] as const,
  },
  mercenary: {
    all: ['mercenary'] as const,
    list: (params?: Record<string, string>) => ['mercenary', params] as const,
  },
  badges: {
    all: ['badges'] as const,
    team: (teamId: string) => ['badges', 'team', teamId] as const,
  },
  reviews: {
    all: ['reviews'] as const,
    pending: ['reviews', 'pending'] as const,
  },
  notifications: ['notifications'] as const,
  user: (id: string) => ['user', id] as const,
  admin: {
    users: (params?: Record<string, string>) => ['admin', 'users', params] as const,
    user: (id: string) => ['admin', 'user', id] as const,
    matches: ['admin', 'matches'] as const,
    lessons: ['admin', 'lessons'] as const,
    teams: ['admin', 'teams'] as const,
    venues: ['admin', 'venues'] as const,
    payments: ['admin', 'payments'] as const,
    stats: ['admin', 'stats'] as const,
    disputes: ['admin', 'disputes'] as const,
    dispute: (id: string) => ['admin', 'dispute', id] as const,
    settlements: ['admin', 'settlements'] as const,
    settlementsSummary: ['admin', 'settlements', 'summary'] as const,
  },
} as const;

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

// ── Matches ──
export function useMatches(params?: Record<string, string>) {
  return useQuery<PaginatedResponse<Match>>({
    queryKey: queryKeys.matches.list(params),
    queryFn: async () => {
      const res = await api.get('/matches', { params });
      return extractData<PaginatedResponse<Match>>(res);
    },
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

// ── Teams ──
export function useTeams(params?: Record<string, string>) {
  return useQuery<PaginatedResponse<SportTeam>>({
    queryKey: queryKeys.teams.list(params),
    queryFn: async () => {
      const res = await api.get('/teams', { params });
      return extractData<PaginatedResponse<SportTeam>>(res);
    },
  });
}

export function useTeam(id: string) {
  return useQuery<SportTeam>({
    queryKey: queryKeys.teams.detail(id),
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
      queryClient.invalidateQueries({ queryKey: queryKeys.teams.all });
    },
  });
}

// ── Lessons ──
export function useLessons(params?: Record<string, string>) {
  return useQuery<PaginatedResponse<Lesson>>({
    queryKey: queryKeys.lessons.list(params),
    queryFn: async () => {
      const res = await api.get('/lessons', { params });
      return extractData<PaginatedResponse<Lesson>>(res);
    },
  });
}

export function useLesson(id: string) {
  return useQuery<Lesson>({
    queryKey: queryKeys.lessons.detail(id),
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
      queryClient.invalidateQueries({ queryKey: queryKeys.lessons.all });
    },
  });
}

// ── Venues ──
export function useVenues(params?: Record<string, string>) {
  return useQuery<PaginatedResponse<Venue>>({
    queryKey: queryKeys.venues.list(params),
    queryFn: async () => {
      const res = await api.get('/venues', { params });
      return extractData<PaginatedResponse<Venue>>(res);
    },
  });
}

export function useVenue(id: string) {
  return useQuery<Venue>({
    queryKey: queryKeys.venues.detail(id),
    queryFn: async () => {
      const res = await api.get(`/venues/${id}`);
      return extractData<Venue>(res);
    },
    enabled: !!id,
  });
}

export function useVenueSchedule(id: string) {
  return useQuery<VenueScheduleSlot[]>({
    queryKey: queryKeys.venues.schedule(id),
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
      queryClient.invalidateQueries({ queryKey: queryKeys.venues.detail(id) });
    },
  });
}

// ── Marketplace ──
export function useListings(params?: Record<string, string>) {
  return useQuery<PaginatedResponse<MarketplaceListing>>({
    queryKey: queryKeys.listings.list(params),
    queryFn: async () => {
      const res = await api.get('/marketplace/listings', { params });
      return extractData<PaginatedResponse<MarketplaceListing>>(res);
    },
  });
}

export function useListing(id: string) {
  return useQuery<MarketplaceListing>({
    queryKey: queryKeys.listings.detail(id),
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
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
    },
  });
}

// ── Payments ──
export function usePayments() {
  const { isAuthenticated } = useAuthStore();
  return useQuery<Payment[]>({
    queryKey: queryKeys.payments.all,
    queryFn: async () => {
      const res = await api.get('/payments/me');
      return extractData<Payment[]>(res);
    },
    enabled: isAuthenticated,
  });
}

export function usePayment(id: string) {
  return useQuery<Payment>({
    queryKey: queryKeys.payments.detail(id),
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
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.detail(id) });
    },
  });
}

// ── Team Matches ──
export function useTeamMatches(params?: Record<string, string>) {
  return useQuery<PaginatedResponse<TeamMatch>>({
    queryKey: queryKeys.teamMatches.list(params),
    queryFn: async () => {
      const res = await api.get('/team-matches', { params });
      return extractData<PaginatedResponse<TeamMatch>>(res);
    },
  });
}

export function useTeamMatch(id: string) {
  return useQuery<TeamMatch>({
    queryKey: queryKeys.teamMatches.detail(id),
    queryFn: async () => {
      const res = await api.get(`/team-matches/${id}`);
      return extractData<TeamMatch>(res);
    },
    enabled: !!id,
  });
}

export function useTeamMatchRefereeSchedule(id: string) {
  return useQuery({
    queryKey: queryKeys.teamMatches.referee(id),
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
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMatches.all });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMatches.detail(id) });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMatches.detail(id) });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMatches.detail(id) });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMatches.detail(id) });
    },
  });
}

// ── Admin ──
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
  return useQuery<UserProfile>({
    queryKey: queryKeys.admin.user(id),
    queryFn: async () => {
      const res = await api.get(`/admin/users/${id}`);
      return extractData<UserProfile>(res);
    },
    enabled: !!id,
  });
}

export function useAdminMatches() {
  return useQuery<PaginatedResponse<Match>>({
    queryKey: queryKeys.admin.matches,
    queryFn: async () => {
      const res = await api.get('/admin/matches');
      return extractData<PaginatedResponse<Match>>(res);
    },
  });
}

export function useAdminLessons() {
  return useQuery<Lesson[]>({
    queryKey: queryKeys.admin.lessons,
    queryFn: async () => {
      const res = await api.get('/admin/lessons');
      return extractData<Lesson[]>(res);
    },
  });
}

export function useAdminTeams() {
  return useQuery<SportTeam[]>({
    queryKey: queryKeys.admin.teams,
    queryFn: async () => {
      const res = await api.get('/admin/teams');
      return extractData<SportTeam[]>(res);
    },
  });
}

export function useAdminVenues() {
  return useQuery<Venue[]>({
    queryKey: queryKeys.admin.venues,
    queryFn: async () => {
      const res = await api.get('/admin/venues');
      return extractData<Venue[]>(res);
    },
  });
}

export function useAdminPayments() {
  return useQuery<PaginatedResponse<Payment>>({
    queryKey: queryKeys.admin.payments,
    queryFn: async () => {
      const res = await api.get('/admin/payments');
      return extractData<PaginatedResponse<Payment>>(res);
    },
  });
}

export function useAdminStats() {
  return useQuery<AdminStats>({
    queryKey: queryKeys.admin.stats,
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
    queryKey: queryKeys.chat.rooms,
    queryFn: async () => {
      const res = await api.get('/chat/rooms');
      return extractData<ChatRoom[]>(res);
    },
    enabled: isAuthenticated,
  });
}

export function useChatMessages(roomId: string) {
  return useQuery<ChatMessage[]>({
    queryKey: queryKeys.chat.messages(roomId),
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
    queryKey: queryKeys.mercenary.list(params),
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
      queryClient.invalidateQueries({ queryKey: queryKeys.mercenary.all });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.mercenary.all });
    },
  });
}

// ── Badges ──
export function useTeamBadges(teamId: string) {
  return useQuery<Badge[]>({
    queryKey: queryKeys.badges.team(teamId),
    queryFn: async () => {
      const res = await api.get(`/badges/team/${teamId}`);
      return extractData<Badge[]>(res);
    },
    enabled: !!teamId,
  });
}

export function useAllBadgeTypes() {
  return useQuery<Badge[]>({
    queryKey: queryKeys.badges.all,
    queryFn: async () => {
      const res = await api.get('/badges');
      return extractData<Badge[]>(res);
    },
  });
}

// ── Disputes ──
export function useAdminDisputes() {
  return useQuery<Dispute[]>({
    queryKey: queryKeys.admin.disputes,
    queryFn: async () => {
      const res = await api.get('/admin/disputes');
      return extractData<Dispute[]>(res);
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
    queryKey: queryKeys.admin.settlements,
    queryFn: async () => {
      const res = await api.get('/admin/settlements');
      return extractData<Settlement[]>(res);
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
      queryClient.invalidateQueries({ queryKey: queryKeys.reviews.all });
    },
  });
}

export function usePendingReviews() {
  const { isAuthenticated } = useAuthStore();
  return useQuery<PendingReview[]>({
    queryKey: queryKeys.reviews.pending,
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
    queryKey: queryKeys.notifications,
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
    queryKey: queryKeys.user(id),
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
    queryKey: queryKeys.matches.my(params),
    queryFn: async () => {
      const res = await api.get('/users/me/matches', { params });
      return extractData<PaginatedResponse<Match>>(res);
    },
  });
}
