'use client';

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import {
  markAllNotificationsReadInList,
  markNotificationReadInList,
  unreadNotificationCount,
} from '@/lib/notification-center';
import type {
  ApiResponse,
  PaginatedResponse,
  Match,
  Venue,
  VenueScheduleSlot,
  Lesson,
  MarketplaceListing,
  UserProfile,
  AdminUserDetail,
  SportTeam,
  TeamMatch,
  TeamMatchApplication,
  Payment,
  PreparedPayment,
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
  NotificationPreference,
  TeamInvitation,
  CreateTeamInput,
  UpdateMatchInput,
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
  CancelMatchPayload,
  Upload,
  ArriveMatchInput,
} from '@/types/api';

// Helper: the axios response interceptor returns `response.data` (the ApiResponse),
// so `api.get(...)` resolves to `ApiResponse<T>`. We cast accordingly.
function extractData<T>(res: unknown): T {
  return (res as ApiResponse<T>).data;
}

function extractCollection<T>(res: unknown): T[] {
  const data = extractData<T[] | { items?: T[] }>(res);
  if (Array.isArray(data)) {
    return data;
  }

  return data.items ?? [];
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
    me: ['teams', 'me'] as const,
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
    detail: (id: string) => ['mercenary', id] as const,
    myApplications: (status?: string) => ['mercenary', 'me', 'applications', status] as const,
  },
  teamMembers: {
    list: (teamId: string) => ['teams', teamId, 'members'] as const,
  },
  teamMatchApplications: {
    byMatch: (matchId: string) => ['team-matches', matchId, 'applications'] as const,
    mine: ['team-matches', 'me', 'applications'] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: (isRead?: boolean) => ['notifications', { isRead }] as const,
    unreadCount: ['notifications', 'unread-count'] as const,
    preferences: ['notifications', 'preferences'] as const,
  },
  invitations: {
    byTeam: (teamId: string) => ['invitations', 'team', teamId] as const,
    mine: ['invitations', 'me'] as const,
  },
  users: {
    search: (query: string) => ['users', 'search', query] as const,
  },
  badges: {
    all: ['badges'] as const,
    team: (teamId: string) => ['badges', 'team', teamId] as const,
  },
  reviews: {
    all: ['reviews'] as const,
    pending: ['reviews', 'pending'] as const,
  },
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

export function useMyTeams() {
  const { isAuthenticated } = useAuthStore();
  return useQuery({
    queryKey: queryKeys.teams.me,
    queryFn: () => api.get('/teams/me').then(extractData<SportTeam[]>),
    enabled: isAuthenticated,
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
      return extractData<PreparedPayment>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
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
  return useQuery<AdminUserDetail>({
    queryKey: queryKeys.admin.user(id),
    queryFn: async () => {
      const res = await api.get(`/admin/users/${id}`);
      return extractData<AdminUserDetail>(res);
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
  return useQuery<Payment[]>({
    queryKey: queryKeys.admin.payments,
    queryFn: async () => {
      const res = await api.get('/admin/payments');
      return extractCollection<Payment>(res);
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
      const data = extractData<ChatRoom[] | PaginatedResponse<ChatRoom>>(res);
      if (Array.isArray(data)) {
        return data;
      }

      const paginated = data as PaginatedResponse<ChatRoom> & { data?: ChatRoom[] };
      return paginated.items ?? paginated.data ?? [];
    },
    enabled: isAuthenticated,
  });
}

export function useChatUnreadTotal(): number {
  const { data: rooms = [] } = useChatRooms();
  return rooms.reduce((sum, r) => sum + (r.unreadCount ?? 0), 0);
}

export function useChatMessages(roomId: string) {
  return useInfiniteQuery<ChatMessage[]>({
    queryKey: queryKeys.chat.messages(roomId),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const url = `/chat/rooms/${roomId}/messages?limit=20${pageParam ? `&before=${pageParam}` : ''}`;
      const res = await api.get(url);
      return extractData<ChatMessage[]>(res);
    },
    getNextPageParam: (lastPage) =>
      lastPage.length === 20 ? lastPage[lastPage.length - 1].id : undefined,
    enabled: !!roomId,
  });
}

export function useCreateChatRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { teamMatchId?: string; teamId?: string; participantIds?: string[] }) => {
      const res = await api.post('/chat/rooms', data);
      return extractData<ChatRoom>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.rooms });
    },
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ roomId, data }: { roomId: string; data: SendMessageInput }) => {
      const res = await api.post(`/chat/rooms/${roomId}/messages`, data);
      return extractData<ChatMessage>(res);
    },
    onSuccess: () => {
      // New messages arrive via WebSocket — only refresh rooms list for preview update
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.rooms });
    },
  });
}

export function useMarkChatRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (roomId: string) => {
      const res = await api.post(`/chat/rooms/${roomId}/read`, {});
      return extractData<{ success: boolean }>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.rooms });
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
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreateMercenaryPostInput> }) => {
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
      return extractData<{ id: string }>(res);
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
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mercenary.detail(id) });
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

// ── Settlements ──
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
export function useNotifications(isRead?: boolean) {
  const { isAuthenticated } = useAuthStore();
  return useQuery<Notification[]>({
    queryKey: queryKeys.notifications.list(isRead),
    queryFn: async () => {
      const params = isRead !== undefined ? { isRead: String(isRead) } : undefined;
      const res = await api.get('/notifications', { params });
      return extractData<Notification[]>(res);
    },
    enabled: isAuthenticated,
    // Backfill notifications if a realtime event is missed during socket handshakes.
    refetchInterval: isAuthenticated ? 5_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

export function useUnreadCount() {
  const { isAuthenticated } = useAuthStore();
  return useQuery<{ count: number }>({
    queryKey: queryKeys.notifications.unreadCount,
    queryFn: async () => {
      const res = await api.get('/notifications/unread-count');
      return extractData<{ count: number }>(res);
    },
    enabled: isAuthenticated,
    staleTime: 30 * 1000,
    refetchInterval: isAuthenticated ? 15_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/notifications/${id}/read`);
      return extractData<Notification>(res);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications.all });

      const previousAll = queryClient.getQueryData<Notification[]>(queryKeys.notifications.list(undefined));
      const previousUnread = queryClient.getQueryData<Notification[]>(queryKeys.notifications.list(false));
      const previousUnreadCount = queryClient.getQueryData<{ count: number }>(queryKeys.notifications.unreadCount);

      const nextAll = markNotificationReadInList(previousAll, id);
      const nextUnread = markNotificationReadInList(previousUnread, id)?.filter((notification) => !notification.isRead);
      const countSource = nextAll ?? nextUnread;

      queryClient.setQueryData(queryKeys.notifications.list(undefined), nextAll);
      queryClient.setQueryData(queryKeys.notifications.list(false), nextUnread);
      queryClient.setQueryData(queryKeys.notifications.unreadCount, {
        count: countSource
          ? unreadNotificationCount(countSource)
          : Math.max(0, (previousUnreadCount?.count ?? 0) - 1),
      });

      return {
        previousAll,
        previousUnread,
        previousUnreadCount,
      };
    },
    onError: (_error, _id, context) => {
      if (!context) {
        return;
      }

      queryClient.setQueryData(queryKeys.notifications.list(undefined), context.previousAll);
      queryClient.setQueryData(queryKeys.notifications.list(false), context.previousUnread);
      queryClient.setQueryData(queryKeys.notifications.unreadCount, context.previousUnreadCount);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all, refetchType: 'inactive' });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.patch('/notifications/read-all');
      return extractData<{ count: number }>(res);
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications.all });

      const previousAll = queryClient.getQueryData<Notification[]>(queryKeys.notifications.list(undefined));
      const previousUnread = queryClient.getQueryData<Notification[]>(queryKeys.notifications.list(false));
      const previousUnreadCount = queryClient.getQueryData<{ count: number }>(queryKeys.notifications.unreadCount);

      queryClient.setQueryData(
        queryKeys.notifications.list(undefined),
        markAllNotificationsReadInList(previousAll),
      );
      queryClient.setQueryData(queryKeys.notifications.list(false), []);
      queryClient.setQueryData(queryKeys.notifications.unreadCount, { count: 0 });

      return {
        previousAll,
        previousUnread,
        previousUnreadCount,
      };
    },
    onError: (_error, _variables, context) => {
      if (!context) {
        return;
      }

      queryClient.setQueryData(queryKeys.notifications.list(undefined), context.previousAll);
      queryClient.setQueryData(queryKeys.notifications.list(false), context.previousUnread);
      queryClient.setQueryData(queryKeys.notifications.unreadCount, context.previousUnreadCount);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all, refetchType: 'inactive' });
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

// ── Team Match Applications (host view) ──
export function useTeamMatchApplications(matchId: string) {
  return useQuery<TeamMatchApplication[]>({
    queryKey: queryKeys.teamMatchApplications.byMatch(matchId),
    queryFn: async () => {
      const res = await api.get(`/team-matches/${matchId}/applications`);
      return extractData<TeamMatchApplication[]>(res);
    },
    enabled: !!matchId,
  });
}

export function useApproveTeamMatchApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ matchId, applicationId }: { matchId: string; applicationId: string }) => {
      const res = await api.patch(`/team-matches/${matchId}/applications/${applicationId}`, { action: 'approve' });
      return extractData<{ id: string }>(res);
    },
    onSuccess: (_, { matchId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMatchApplications.byMatch(matchId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMatches.detail(matchId) });
    },
  });
}

export function useRejectTeamMatchApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ matchId, applicationId }: { matchId: string; applicationId: string }) => {
      const res = await api.patch(`/team-matches/${matchId}/applications/${applicationId}`, { action: 'reject' });
      return extractData<{ id: string }>(res);
    },
    onSuccess: (_, { matchId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMatchApplications.byMatch(matchId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMatches.detail(matchId) });
    },
  });
}

// ── My Team Match Applications (applicant view) ──
export interface MyTeamMatchApplication {
  id: string;
  status: string;
  message: string | null;
  createdAt: string;
  teamMatch: {
    id: string;
    title: string;
    matchDate: string;
    startTime: string;
    endTime: string;
    venueName: string;
    hostTeam?: { id: string; name: string };
  };
}

export function useMyTeamMatchApplications() {
  const { isAuthenticated } = useAuthStore();
  return useQuery<MyTeamMatchApplication[]>({
    queryKey: queryKeys.teamMatchApplications.mine,
    queryFn: async () => {
      const res = await api.get('/team-matches/me/applications');
      return extractData<MyTeamMatchApplication[]>(res);
    },
    enabled: isAuthenticated,
  });
}

// ── Team Members ──
export interface TeamMember {
  id: string;
  userId: string;
  teamId: string;
  role: 'owner' | 'manager' | 'member';
  status: string;
  joinedAt: string;
  user: {
    id: string;
    nickname: string;
    profileImageUrl: string | null;
    mannerScore?: number;
  };
}

export function useTeamMembers(teamId: string) {
  return useQuery<TeamMember[]>({
    queryKey: queryKeys.teamMembers.list(teamId),
    queryFn: async () => {
      const res = await api.get(`/teams/${teamId}/members`);
      return extractData<TeamMember[]>(res);
    },
    enabled: !!teamId,
  });
}

export function useAddTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ teamId, userId, role }: { teamId: string; userId: string; role?: string }) => {
      const res = await api.post(`/teams/${teamId}/members`, { userId, role });
      return extractData<TeamMember>(res);
    },
    onSuccess: (_, { teamId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMembers.list(teamId) });
    },
  });
}

export function useUpdateTeamMemberRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ teamId, userId, role }: { teamId: string; userId: string; role: string }) => {
      const res = await api.patch(`/teams/${teamId}/members/${userId}`, { role });
      return extractData<TeamMember>(res);
    },
    onSuccess: (_, { teamId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMembers.list(teamId) });
    },
  });
}

export function useRemoveTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ teamId, memberId }: { teamId: string; memberId: string }) => {
      const res = await api.delete(`/teams/${teamId}/members/${memberId}`);
      return extractData<{ id: string }>(res);
    },
    onSuccess: (_, { teamId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMembers.list(teamId) });
    },
  });
}

export function useLeaveTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (teamId: string) => {
      const res = await api.delete(`/teams/${teamId}/members/me`);
      return extractData<{ id: string }>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teams.me });
    },
  });
}

export function useTransferTeamOwnership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      teamId,
      toUserId,
      demoteTo,
    }: {
      teamId: string;
      toUserId: string;
      demoteTo: 'manager' | 'member';
    }) => {
      // POST /teams/:id/transfer-ownership — backend expects { toUserId, demoteTo }
      const res = await api.post(`/teams/${teamId}/transfer-ownership`, {
        toUserId,
        demoteTo,
      });
      return extractData<{ success: boolean }>(res);
    },
    onSuccess: (_, { teamId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMembers.list(teamId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.teams.detail(teamId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.teams.me });
    },
  });
}

// ── Mercenary Applications (host management) ──
export interface MercenaryApplicationItem {
  id: string;
  postId: string;
  applicantId: string;
  status: string;
  message: string | null;
  position: string | null;
  createdAt: string;
  applicant: {
    id: string;
    nickname: string;
    profileImageUrl: string | null;
    mannerScore?: number;
  };
}

export function useAcceptMercenaryApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, applicationId }: { postId: string; applicationId: string }) => {
      const res = await api.patch(`/mercenary/${postId}/applications/${applicationId}/accept`);
      return extractData<{ id: string }>(res);
    },
    onSuccess: (_, { postId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mercenary.detail(postId) });
    },
  });
}

export function useRejectMercenaryApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, applicationId, reason }: { postId: string; applicationId: string; reason?: string }) => {
      const res = await api.patch(`/mercenary/${postId}/applications/${applicationId}/reject`, { reason });
      return extractData<{ id: string }>(res);
    },
    onSuccess: (_, { postId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mercenary.detail(postId) });
    },
  });
}

export interface MyMercenaryApplication {
  id: string;
  status: string;
  message: string | null;
  createdAt: string;
  post: {
    id: string;
    title: string;
    matchDate: string;
    startTime: string;
    venueName: string;
    sportType: string;
    team?: { id: string; name: string };
  };
}

export function useMyMercenaryApplications() {
  const { isAuthenticated } = useAuthStore();
  return useQuery<MyMercenaryApplication[]>({
    queryKey: queryKeys.mercenary.myApplications(),
    queryFn: async () => {
      const res = await api.get('/mercenary/me/applications');
      return extractData<MyMercenaryApplication[]>(res);
    },
    enabled: isAuthenticated,
  });
}

export function useWithdrawMercenaryApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, applicationId }: { postId: string; applicationId: string }) => {
      const res = await api.delete(`/mercenary/${postId}/applications/${applicationId}`);
      return extractData<{ id: string }>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mercenary.myApplications() });
    },
  });
}

// ── Notification Preferences ──
export function useNotificationPreferences() {
  const { isAuthenticated } = useAuthStore();
  return useQuery<NotificationPreference>({
    queryKey: queryKeys.notifications.preferences,
    queryFn: async () => {
      const res = await api.get('/notifications/preferences');
      return extractData<NotificationPreference>(res);
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Pick<NotificationPreference, 'matchEnabled' | 'teamEnabled' | 'chatEnabled' | 'paymentEnabled'>>) => {
      const res = await api.patch('/notifications/preferences', data);
      return extractData<NotificationPreference>(res);
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications.preferences });
      const previous = queryClient.getQueryData<NotificationPreference>(queryKeys.notifications.preferences);
      if (previous) {
        queryClient.setQueryData(queryKeys.notifications.preferences, { ...previous, ...updates });
      }
      return { previous };
    },
    onError: (_error, _updates, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.notifications.preferences, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.preferences });
    },
  });
}

// ── Team Invitations ──
export function useTeamInvitations(teamId: string) {
  return useQuery<TeamInvitation[]>({
    queryKey: queryKeys.invitations.byTeam(teamId),
    queryFn: async () => {
      const res = await api.get(`/teams/${teamId}/invitations`);
      return extractData<TeamInvitation[]>(res);
    },
    enabled: !!teamId,
  });
}

export function useMyInvitations() {
  const { isAuthenticated } = useAuthStore();
  return useQuery<TeamInvitation[]>({
    queryKey: queryKeys.invitations.mine,
    queryFn: async () => {
      const res = await api.get('/users/me/invitations');
      return extractData<TeamInvitation[]>(res);
    },
    enabled: isAuthenticated,
  });
}

export function useInviteTeamMember(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { inviteeId: string; role?: string }) => {
      const res = await api.post(`/teams/${teamId}/invitations`, data);
      return extractData<TeamInvitation>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invitations.byTeam(teamId) });
    },
  });
}

export function useAcceptInvitation(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const res = await api.patch(`/teams/${teamId}/invitations/${invitationId}/accept`);
      return extractData<TeamInvitation>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invitations.mine });
      queryClient.invalidateQueries({ queryKey: queryKeys.teams.me });
    },
  });
}

export function useDeclineInvitation(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const res = await api.patch(`/teams/${teamId}/invitations/${invitationId}/decline`);
      return extractData<TeamInvitation>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invitations.mine });
    },
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

