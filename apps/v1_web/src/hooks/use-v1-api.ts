'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { v1Get, v1Patch, v1Post, getV1ApiBaseUrl, getV1DevAuthHeaders, V1ApiError } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';
import type {
  ApiEnvelope,
  ApiErrorBody,
  AdminListFilters,
  CursorPage,
  V1AdminGrantResult,
  V1AdminLog,
  V1AdminRow,
  V1AdminMatchDetail,
  V1AdminMatchRow,
  V1AdminMe,
  V1AdminOverview,
  V1AdminStatusChangeLog,
  V1AdminStatusChangeResult,
  V1AdminTeamDetail,
  V1AdminTeamMatchRow,
  V1AdminTeamRow,
  V1AdminUserDetail,
  V1AdminUserRow,
  V1AuthMe,
  V1AuthSessionResponse,
  V1ChatMessage,
  V1ChatMessageSendResult,
  V1ChatRoom,
  V1ChatRoomDetail,
  V1ChatRoomLeaveResult,
  V1ChatRoomMeUpdate,
  V1ChatRoomResolveResult,
  V1DevLoginResponse,
  V1Home,
  V1MasterRegionsResponse,
  V1MasterSportsResponse,
  V1Match,
  V1MatchApplicationEligibility,
  V1MatchApplicationsPage,
  V1MatchApplicationResult,
  V1MatchEdit,
  V1MatchMutationPayload,
  V1MatchMutationResult,
  V1MatchUpdatePayload,
  V1MyActivitySummary,
  V1MyRegionUpdateResult,
  V1MyTeamsResponse,
  V1MyTeamMatch,
  V1Notification,
  V1NotificationPreferences,
  V1NotificationsPage,
  V1Notice,
  V1NoticeResponse,
  V1NoticesResponse,
  V1OnboardingDetail,
  V1OnboardingMutationResult,
  V1OnboardingPreferencePayload,
  V1Profile,
  V1Region,
  V1ResolveLocationResponse,
  V1RecentSearch,
  V1RecentSearchesResponse,
  V1ReviewListResponse,
  V1ReviewReceivedResponse,
  V1ReviewSourceResponse,
  V1ReviewSourceType,
  V1ReviewSubmitPayload,
  V1ReviewSubmitResponse,
  V1Settings,
  V1Sport,
  V1Team,
  V1TeamDetail,
  V1TeamJoinApplicationResult,
  V1TeamJoinApplicationsPage,
  V1TeamJoinEligibility,
  V1TeamMembersPage,
  V1TeamMembershipMutationResult,
  V1TeamMatch,
  V1TeamMatchApplicationResult,
  V1TeamMatchApplicationsPage,
  V1TeamMatchEdit,
  V1TeamMatchEligibility,
  V1TeamMatchMutationPayload,
  V1TeamMatchMutationResult,
  V1TeamMatchUpdatePayload,
  V1TeamMutationPayload,
  V1TeamMutationResult,
  V1TeamUpdatePayload,
  V1UploadImagesResult,
} from '@/types/api';

type ListFilters = Record<string, string | number | boolean | null | undefined>;
type QueryOptions = { enabled?: boolean };

export function useV1AuthMe(options?: { enabled?: boolean; retry?: boolean | number }) {
  return useQuery({
    queryKey: v1Keys.authMe(),
    queryFn: () => v1Get<V1AuthMe>('/auth/me'),
    enabled: options?.enabled,
    retry: options?.retry,
  });
}

export function useV1DevLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string }) => v1Post<V1DevLoginResponse>('/auth/dev-login', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: v1Keys.authMe() }),
  });
}

export function useV1Logout() {
  return useMutation({
    mutationFn: () => v1Post<{ ok: boolean }>('/auth/logout'),
  });
}

export function useV1EmailLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) => v1Post<V1AuthSessionResponse>('/auth/login', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: v1Keys.authMe() }),
  });
}

export function useV1Register() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      nickname: string;
      email: string;
      password: string;
      gender: 'male' | 'female';
      displayName?: string;
      phone?: string;
      birthDate?: string;
      profileImageUrl?: string;
      requiredTermsAccepted: boolean;
    }) =>
      v1Post<V1AuthSessionResponse>('/auth/register', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: v1Keys.authMe() }),
  });
}

export function useV1CompleteSocialProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      nickname: string;
      gender: 'male' | 'female';
      displayName?: string;
      phone?: string;
      birthDate?: string;
      profileImageUrl?: string;
    }) =>
      v1Post<V1AuthSessionResponse>('/auth/social-profile', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: v1Keys.authMe() }),
  });
}

export function useV1CompleteSocialTerms() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { requiredTermsAccepted: boolean }) => v1Post<V1AuthSessionResponse>('/auth/social-terms', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: v1Keys.authMe() }),
  });
}

export function useV1CheckEmail() {
  return useMutation({
    mutationFn: (email: string) => v1Get<{ available: boolean }>('/auth/check-email', { email }),
  });
}

export function useV1CheckNickname() {
  return useMutation({
    mutationFn: (nickname: string) => v1Get<{ available: boolean }>('/auth/check-nickname', { nickname }),
  });
}

export function useV1Onboarding() {
  return useQuery({
    queryKey: v1Keys.onboarding(),
    queryFn: () => v1Get<V1OnboardingDetail>('/onboarding'),
  });
}

export function useV1SaveOnboardingPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1OnboardingPreferencePayload) => v1Patch<V1OnboardingMutationResult>('/onboarding/preferences', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.onboarding() });
      queryClient.invalidateQueries({ queryKey: v1Keys.profile() });
      queryClient.invalidateQueries({ queryKey: v1Keys.home() });
    },
  });
}

export function useV1CompleteOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => v1Post<V1OnboardingMutationResult>('/onboarding/complete'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: v1Keys.authMe() }),
  });
}

export function useV1DeferOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { reason: 'skip_now' | 'later' | 'unknown' }) => v1Post<V1OnboardingMutationResult>('/onboarding/defer', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.authMe() });
      queryClient.invalidateQueries({ queryKey: v1Keys.onboarding() });
    },
  });
}

export function useV1MasterSports() {
  return useQuery({
    queryKey: v1Keys.masterSports(),
    queryFn: async () => {
      const response = await v1Get<V1Sport[] | V1MasterSportsResponse>('/master/sports');
      return Array.isArray(response) ? response : response.sports;
    },
  });
}

export function useV1MasterRegions() {
  return useQuery({
    queryKey: v1Keys.masterRegions(),
    queryFn: async () => {
      const response = await v1Get<V1Region[] | V1MasterRegionsResponse>('/master/regions');
      const regions = Array.isArray(response) ? response : response.regions;
      return regions.flatMap((region) => [
        { ...region, parentId: region.parentId ?? null },
        ...(region.children ?? []).map((child) => ({ ...child, parentId: child.parentId ?? region.id })),
      ]);
    },
  });
}

export function useV1ResolveLocation() {
  return useMutation({
    mutationFn: (body: { latitude: number; longitude: number }) =>
      v1Post<V1ResolveLocationResponse>('/master/regions/resolve-location', body),
  });
}

export function useV1UpdateMyRegion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { regionId: string }) => v1Patch<V1MyRegionUpdateResult>('/me/regions', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.profile() });
      queryClient.invalidateQueries({ queryKey: v1Keys.settings() });
      queryClient.invalidateQueries({ queryKey: v1Keys.home() });
    },
  });
}

export function useV1UpdateMyPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      sports: Array<{ sportId: string; levelId?: string | null }>;
      regions: Array<{ regionId: string; primary: boolean }>;
    }) =>
      v1Patch<{
        sports: NonNullable<V1Profile['sports']>;
        regions: Array<{ regionId: string; name: string; primary: boolean }>;
        updatedAt: string;
      }>('/me/preferences', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.profile() });
      queryClient.invalidateQueries({ queryKey: v1Keys.onboarding() });
      queryClient.invalidateQueries({ queryKey: v1Keys.settings() });
      queryClient.invalidateQueries({ queryKey: v1Keys.home() });
    },
  });
}

export function useV1RecentSearches() {
  return useQuery({
    queryKey: v1Keys.recentSearches(),
    queryFn: () => v1Get<V1RecentSearchesResponse>('/search/recent', { limit: 8 }),
  });
}

export function useV1RecordSearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { query: string; filters?: Record<string, unknown> }) => v1Post<V1RecentSearch>('/search/recent', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: v1Keys.recentSearches() }),
  });
}

export function useV1Home(filters?: ListFilters) {
  return useQuery({
    queryKey: v1Keys.home(filters),
    queryFn: () => v1Get<V1Home>('/home', filters),
  });
}

export function useV1Notices(filters?: ListFilters) {
  return useQuery({
    queryKey: v1Keys.notices(filters),
    queryFn: () => v1Get<V1NoticesResponse>('/notices', filters),
  });
}

export function useV1Notice(noticeId: string) {
  return useQuery({
    queryKey: v1Keys.notice(noticeId),
    queryFn: () => v1Get<V1NoticeResponse>(`/notices/${noticeId}`),
    enabled: Boolean(noticeId),
  });
}

export function useV1Matches(filters?: ListFilters, options?: QueryOptions) {
  return useQuery({
    queryKey: v1Keys.matches(filters),
    queryFn: () => v1Get<CursorPage<V1Match>>('/matches', filters),
    enabled: options?.enabled,
  });
}

export function useV1MyMatches(filters?: ListFilters) {
  return useQuery({
    queryKey: [...v1Keys.all, 'me', 'matches', filters ?? {}] as const,
    queryFn: () => v1Get<CursorPage<V1Match>>('/me/matches', filters),
  });
}

export function useV1Match(matchId: string) {
  return useQuery({
    queryKey: v1Keys.match(matchId),
    queryFn: () => v1Get<V1Match>(`/matches/${matchId}`),
    enabled: Boolean(matchId),
  });
}

export function useV1MatchEdit(matchId: string) {
  return useQuery({
    queryKey: [...v1Keys.match(matchId), 'edit'] as const,
    queryFn: () => v1Get<V1MatchEdit>(`/matches/${matchId}/edit`),
    enabled: Boolean(matchId),
  });
}

export function useV1MatchApplicationEligibility(matchId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...v1Keys.match(matchId), 'application-eligibility'] as const,
    queryFn: () => v1Get<V1MatchApplicationEligibility>(`/matches/${matchId}/application-eligibility`),
    enabled: Boolean(matchId) && (options?.enabled ?? true),
    retry: false,
  });
}

export function useV1CreateMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1MatchMutationPayload) => v1Post<V1MatchMutationResult>('/matches', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: v1Keys.matches() }),
  });
}

export function useV1ApplyMatch(matchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body?: { message?: string | null }) => v1Post<V1MatchApplicationResult>(`/matches/${matchId}/applications`, body ?? {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.match(matchId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.matches() });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.match(matchId), 'application-eligibility'] });
    },
  });
}

export function useV1UpdateMatch(matchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1MatchUpdatePayload) => v1Patch<V1MatchMutationResult>(`/matches/${matchId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.match(matchId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.matches() });
    },
  });
}

export function useV1CancelMatch(matchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body?: { reason?: string | null }) => v1Post<{ matchId: string; status: string; detailRoute: string }>(`/matches/${matchId}/cancel`, body ?? {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.match(matchId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.matches() });
    },
  });
}

export function useV1MatchApplications(matchId: string, filters?: ListFilters, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...v1Keys.match(matchId), 'applications', filters ?? {}] as const,
    queryFn: () => v1Get<V1MatchApplicationsPage>(`/matches/${matchId}/applications`, filters),
    enabled: Boolean(matchId) && (options?.enabled ?? true),
    retry: false,
  });
}

export function useV1WithdrawMatchApplication(matchId: string, applicationId?: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body?: { reason?: string | null }) =>
      v1Post<V1MatchApplicationResult>(`/match-applications/${applicationId}/withdraw`, body ?? {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.match(matchId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.matches() });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.match(matchId), 'application-eligibility'] });
    },
  });
}

export function useV1ApproveMatchApplication(matchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ applicationId, note }: { applicationId: string; note?: string | null }) =>
      v1Post<V1MatchApplicationResult>(`/match-applications/${applicationId}/approve`, { note: note ?? null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.match(matchId) });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.match(matchId), 'applications'] });
      queryClient.invalidateQueries({ queryKey: v1Keys.matches() });
    },
  });
}

export function useV1RejectMatchApplication(matchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ applicationId, reason }: { applicationId: string; reason?: string | null }) =>
      v1Post<V1MatchApplicationResult>(`/match-applications/${applicationId}/reject`, { reason: reason ?? null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.match(matchId) });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.match(matchId), 'applications'] });
      queryClient.invalidateQueries({ queryKey: v1Keys.matches() });
    },
  });
}

export function useV1Teams(filters?: ListFilters, options?: QueryOptions) {
  return useQuery({
    queryKey: v1Keys.teams(filters),
    queryFn: () => v1Get<CursorPage<V1Team>>('/teams', filters),
    enabled: options?.enabled,
  });
}

export function useV1Team(teamId: string) {
  return useQuery({
    queryKey: v1Keys.team(teamId),
    queryFn: () => v1Get<V1Team>(`/teams/${teamId}`),
    enabled: Boolean(teamId),
  });
}

export function useV1TeamDetail(teamId: string) {
  return useQuery({
    queryKey: [...v1Keys.team(teamId), 'detail'] as const,
    queryFn: () => v1Get<V1TeamDetail>(`/teams/${teamId}`),
    enabled: Boolean(teamId),
  });
}

export function useV1CreateTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1TeamMutationPayload) => v1Post<V1TeamMutationResult>('/teams', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: v1Keys.teams() }),
  });
}

export function useV1UpdateTeam(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1TeamUpdatePayload) => v1Patch<V1TeamMutationResult>(`/teams/${teamId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.team(teamId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.teams() });
    },
  });
}

export function useV1MyTeams(filters?: ListFilters) {
  return useQuery({
    queryKey: [...v1Keys.all, 'me', 'teams', filters ?? {}] as const,
    queryFn: () => v1Get<V1MyTeamsResponse>('/me/teams', filters),
  });
}

export function useV1TeamMembers(teamId: string, filters?: ListFilters, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...v1Keys.team(teamId), 'members', filters ?? {}] as const,
    queryFn: () => v1Get<V1TeamMembersPage>(`/teams/${teamId}/members`, filters),
    enabled: Boolean(teamId) && (options?.enabled ?? true),
  });
}

export function useV1TeamJoinEligibility(teamId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...v1Keys.team(teamId), 'join-eligibility'] as const,
    queryFn: () => v1Get<V1TeamJoinEligibility>(`/teams/${teamId}/join-eligibility`),
    enabled: Boolean(teamId) && (options?.enabled ?? true),
    retry: false,
  });
}

export function useV1CreateTeamJoinApplication(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body?: { message?: string | null }) =>
      v1Post<V1TeamJoinApplicationResult>(`/teams/${teamId}/join-applications`, body ?? {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.team(teamId) });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.team(teamId), 'join-eligibility'] });
      queryClient.invalidateQueries({ queryKey: v1Keys.teams() });
    },
  });
}

export function useV1TeamJoinApplications(teamId: string, filters?: ListFilters, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...v1Keys.team(teamId), 'join-applications', filters ?? {}] as const,
    queryFn: () => v1Get<V1TeamJoinApplicationsPage>(`/teams/${teamId}/join-applications`, filters),
    enabled: Boolean(teamId) && (options?.enabled ?? true),
    retry: false,
  });
}

export function useV1WithdrawTeamJoinApplication(teamId: string, applicationId?: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body?: { reason?: string | null }) =>
      v1Post<V1TeamJoinApplicationResult>(`/team-join-applications/${applicationId}/withdraw`, body ?? {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.team(teamId) });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.team(teamId), 'join-eligibility'] });
      queryClient.invalidateQueries({ queryKey: v1Keys.teams() });
    },
  });
}

export function useV1ApproveTeamJoinApplication(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ applicationId, note }: { applicationId: string; note?: string | null }) =>
      v1Post<V1TeamJoinApplicationResult>(`/team-join-applications/${applicationId}/approve`, { note: note ?? null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.team(teamId) });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.team(teamId), 'members'] });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.team(teamId), 'join-applications'] });
    },
  });
}

export function useV1RejectTeamJoinApplication(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ applicationId, reason }: { applicationId: string; reason?: string | null }) =>
      v1Post<V1TeamJoinApplicationResult>(`/team-join-applications/${applicationId}/reject`, { reason: reason ?? null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.team(teamId) });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.team(teamId), 'join-applications'] });
    },
  });
}

export function useV1ChangeTeamMembershipRole(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ membershipId, role }: { membershipId: string; role: 'owner' | 'manager' | 'member' }) =>
      v1Patch<V1TeamMembershipMutationResult>(`/team-memberships/${membershipId}/role`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.team(teamId) });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.team(teamId), 'members'] });
    },
  });
}

export function useV1RemoveTeamMembership(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ membershipId, reason }: { membershipId: string; reason?: string | null }) =>
      v1Post<V1TeamMembershipMutationResult>(`/team-memberships/${membershipId}/remove`, { reason: reason ?? null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.team(teamId) });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.team(teamId), 'members'] });
    },
  });
}

export function useV1TeamMatches(filters?: ListFilters, options?: QueryOptions) {
  return useQuery({
    queryKey: v1Keys.teamMatches(filters),
    queryFn: () => v1Get<CursorPage<V1TeamMatch>>('/team-matches', filters),
    enabled: options?.enabled,
  });
}

export function useV1TeamMatch(teamMatchId: string) {
  return useQuery({
    queryKey: v1Keys.teamMatch(teamMatchId),
    queryFn: () => v1Get<V1TeamMatch>(`/team-matches/${teamMatchId}`),
    enabled: Boolean(teamMatchId),
  });
}

export function useV1TeamMatchEdit(teamMatchId: string) {
  return useQuery({
    queryKey: [...v1Keys.teamMatch(teamMatchId), 'edit'] as const,
    queryFn: () => v1Get<V1TeamMatchEdit>(`/team-matches/${teamMatchId}/edit`),
    enabled: Boolean(teamMatchId),
  });
}

export function useV1TeamMatchEligibility(teamMatchId: string, filters?: ListFilters, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...v1Keys.teamMatch(teamMatchId), 'application-eligibility', filters ?? {}] as const,
    queryFn: () => v1Get<V1TeamMatchEligibility>(`/team-matches/${teamMatchId}/application-eligibility`, filters),
    enabled: Boolean(teamMatchId) && (options?.enabled ?? true),
    retry: false,
  });
}

export function useV1CreateTeamMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1TeamMatchMutationPayload) => v1Post<V1TeamMatchMutationResult>('/team-matches', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: v1Keys.teamMatches() }),
  });
}

export function useV1UpdateTeamMatch(teamMatchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1TeamMatchUpdatePayload) => v1Patch<V1TeamMatchMutationResult>(`/team-matches/${teamMatchId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.teamMatch(teamMatchId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.teamMatches() });
    },
  });
}

export function useV1CancelTeamMatch(teamMatchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body?: { reason?: string | null }) =>
      v1Post<{ teamMatchId: string; status: string; detailRoute: string }>(`/team-matches/${teamMatchId}/cancel`, body ?? {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.teamMatch(teamMatchId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.teamMatches() });
    },
  });
}

export function useV1ApplyTeamMatch(teamMatchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { applicantTeamId: string; message?: string | null }) =>
      v1Post<V1TeamMatchApplicationResult>(`/team-matches/${teamMatchId}/applications`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.teamMatch(teamMatchId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.teamMatches() });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.teamMatch(teamMatchId), 'application-eligibility'] });
    },
  });
}

export function useV1TeamMatchApplications(teamMatchId: string, filters?: ListFilters, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...v1Keys.teamMatch(teamMatchId), 'applications', filters ?? {}] as const,
    queryFn: () => v1Get<V1TeamMatchApplicationsPage>(`/team-matches/${teamMatchId}/applications`, filters),
    enabled: Boolean(teamMatchId) && (options?.enabled ?? true),
    retry: false,
  });
}

export function useV1WithdrawTeamMatchApplication(teamMatchId: string, applicationId?: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body?: { reason?: string | null }) =>
      v1Post<V1TeamMatchApplicationResult>(`/team-match-applications/${applicationId}/withdraw`, body ?? {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.teamMatch(teamMatchId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.teamMatches() });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.teamMatch(teamMatchId), 'application-eligibility'] });
    },
  });
}

export function useV1ApproveTeamMatchApplication(teamMatchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ applicationId, note }: { applicationId: string; note?: string | null }) =>
      v1Post<V1TeamMatchApplicationResult>(`/team-match-applications/${applicationId}/approve`, { note: note ?? null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.teamMatch(teamMatchId) });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.teamMatch(teamMatchId), 'applications'] });
      queryClient.invalidateQueries({ queryKey: v1Keys.teamMatches() });
    },
  });
}

export function useV1RejectTeamMatchApplication(teamMatchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ applicationId, reason }: { applicationId: string; reason?: string | null }) =>
      v1Post<V1TeamMatchApplicationResult>(`/team-match-applications/${applicationId}/reject`, { reason: reason ?? null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.teamMatch(teamMatchId) });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.teamMatch(teamMatchId), 'applications'] });
      queryClient.invalidateQueries({ queryKey: v1Keys.teamMatches() });
    },
  });
}

export function useV1MyTeamMatches(filters?: ListFilters) {
  return useQuery({
    queryKey: [...v1Keys.all, 'me', 'team-matches', filters ?? {}] as const,
    queryFn: () => v1Get<CursorPage<V1MyTeamMatch>>('/me/team-matches', filters),
  });
}

export function useV1Reviews(filters?: ListFilters, options?: QueryOptions) {
  return useQuery({
    queryKey: v1Keys.reviews(filters),
    queryFn: () => v1Get<V1ReviewListResponse>('/reviews', filters),
    enabled: options?.enabled,
  });
}

export function useV1ReceivedReviews(filters?: ListFilters, options?: QueryOptions) {
  return useQuery({
    queryKey: v1Keys.reviewsReceived(filters),
    queryFn: () => v1Get<V1ReviewReceivedResponse>('/reviews/received', filters),
    enabled: options?.enabled,
  });
}

export function useV1ReviewSource(sourceType: V1ReviewSourceType, sourceId: string, options?: QueryOptions) {
  return useQuery({
    queryKey: v1Keys.reviewSource(sourceType, sourceId),
    queryFn: () => v1Get<V1ReviewSourceResponse>(`/reviews/sources/${sourceType}/${sourceId}`),
    enabled: Boolean(sourceType && sourceId) && (options?.enabled ?? true),
    retry: false,
  });
}

export function useV1SubmitReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1ReviewSubmitPayload) => v1Post<V1ReviewSubmitResponse>('/reviews', body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: v1Keys.reviews() });
      queryClient.invalidateQueries({ queryKey: v1Keys.reviewsReceived() });
      queryClient.invalidateQueries({ queryKey: v1Keys.reviewSource(variables.sourceType, variables.sourceId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.profile() });
      queryClient.invalidateQueries({ queryKey: v1Keys.teams() });
      if (variables.targetTeamId) queryClient.invalidateQueries({ queryKey: v1Keys.team(variables.targetTeamId) });
    },
  });
}

export function useV1ChatRooms() {
  return useQuery({
    queryKey: v1Keys.chatRooms(),
    queryFn: () => v1Get<CursorPage<V1ChatRoom>>('/chat/rooms'),
  });
}

export function useV1ChatMessages(roomId: string, filters?: ListFilters) {
  return useQuery({
    queryKey: [...v1Keys.chatMessages(roomId), filters ?? {}] as const,
    queryFn: () => v1Get<CursorPage<V1ChatMessage>>(`/chat/rooms/${roomId}/messages`, filters),
    enabled: Boolean(roomId),
  });
}

export function useV1ChatRoom(roomId: string) {
  return useQuery({
    queryKey: v1Keys.chatRoom(roomId),
    queryFn: () => v1Get<V1ChatRoomDetail>(`/chat/rooms/${roomId}`),
    enabled: Boolean(roomId),
  });
}

export function useV1ResolveChatRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { targetType: 'match' | 'team' | 'team_match'; targetId: string }) =>
      v1Post<V1ChatRoomResolveResult>('/chat/rooms/resolve', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.chatRooms() });
    },
  });
}

export function useV1SendChatMessage(roomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { content: string }) => v1Post<V1ChatMessageSendResult>(`/chat/rooms/${roomId}/messages`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.chatRooms() });
      queryClient.invalidateQueries({ queryKey: v1Keys.chatMessages(roomId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.notifications() });
    },
  });
}

export function useV1UpdateMyChatRoom(roomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { pinned?: boolean; lastReadMessageId?: string | null; mutedUntil?: string | null }) =>
      v1Patch<V1ChatRoomMeUpdate>(`/chat/rooms/${roomId}/me`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.chatRooms() });
      queryClient.invalidateQueries({ queryKey: v1Keys.chatRoom(roomId) });
    },
  });
}

export function useV1UpdateChatRoomMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roomId, ...body }: { roomId: string; pinned?: boolean; lastReadMessageId?: string | null; mutedUntil?: string | null }) =>
      v1Patch<V1ChatRoomMeUpdate>(`/chat/rooms/${roomId}/me`, body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: v1Keys.chatRooms() });
      queryClient.invalidateQueries({ queryKey: v1Keys.chatRoom(variables.roomId) });
    },
  });
}

export function useV1LeaveChatRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roomId, reason }: { roomId: string; reason?: string | null }) =>
      v1Post<V1ChatRoomLeaveResult>(`/chat/rooms/${roomId}/leave`, { reason: reason ?? null }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: v1Keys.chatRooms() });
      queryClient.invalidateQueries({ queryKey: v1Keys.chatRoom(variables.roomId) });
    },
  });
}

export function useV1Notifications(filters?: ListFilters) {
  return useQuery({
    queryKey: v1Keys.notifications(filters),
    queryFn: () => v1Get<V1NotificationsPage>('/notifications', filters),
  });
}

export function useV1ReadNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) => v1Patch<{ notificationId: string; status: 'read'; readAt: string }>(`/notifications/${notificationId}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: v1Keys.notifications() }),
  });
}

export function useV1ReadAllNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body?: { type?: string | null }) =>
      v1Post<{ updatedCount: number; readAt: string; unreadCount: number }>('/notifications/read-all', body ?? {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: v1Keys.notifications() }),
  });
}

export function useV1NotificationPreferences() {
  return useQuery({
    queryKey: v1Keys.notificationPreferences(),
    queryFn: () => v1Get<V1NotificationPreferences>('/notification-preferences'),
  });
}

export function useV1Profile() {
  return useQuery({
    queryKey: v1Keys.profile(),
    queryFn: () => v1Get<V1Profile>('/me/profile'),
  });
}

export function useV1MyActivitySummary() {
  return useQuery({
    queryKey: [...v1Keys.all, 'me', 'activity-summary'] as const,
    queryFn: () => v1Get<V1MyActivitySummary>('/me/activity-summary'),
  });
}

export function useV1UpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      displayName: string;
      nickname: string;
      email: string;
      profileImageUrl?: string | null;
      phone?: string | null;
      birthDate?: string | null;
      bio?: string | null;
      visibilityStatus: 'public' | 'members_only' | 'private';
    }) =>
      v1Patch<{ profile: V1Profile['profile']; updatedAt: string }>('/me/profile', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.profile() });
      queryClient.invalidateQueries({ queryKey: v1Keys.authMe() });
      queryClient.invalidateQueries({ queryKey: v1Keys.settings() });
      queryClient.invalidateQueries({ queryKey: v1Keys.home() });
    },
  });
}

export function useV1Settings() {
  return useQuery({
    queryKey: v1Keys.settings(),
    queryFn: () => v1Get<V1Settings>('/me/settings'),
  });
}

export function useV1UpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      visibilityStatus?: 'public' | 'members_only' | 'private';
      notifications?: Partial<V1Settings['notifications']>;
    }) => v1Patch<{ profile: V1Settings['profile']; notifications: V1Settings['notifications']; updatedAt: string }>('/me/settings', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.settings() });
      queryClient.invalidateQueries({ queryKey: v1Keys.profile() });
    },
  });
}

export function useV1WithdrawalRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body?: { reason?: string | null }) =>
      v1Post<{ userId: string; accountStatus: string; requestedAt: string }>('/me/withdrawal-request', body ?? {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.settings() });
      queryClient.invalidateQueries({ queryKey: v1Keys.authMe() });
    },
  });
}

// ---------------------------------------------------------------------------
// Upload (multipart/form-data — no application/json header)
// ---------------------------------------------------------------------------

/**
 * Multipart POST helper.
 * Omits `content-type` so the browser sets the correct `multipart/form-data; boundary=...` header.
 */
async function v1MultipartPost<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(`${getV1ApiBaseUrl()}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      // intentionally no content-type — browser sets multipart boundary automatically
      ...getV1DevAuthHeaders(),
    },
    body: formData,
  });

  const body: ApiEnvelope<T> | ApiErrorBody | null = await response.json().catch(() => null);

  if (!response.ok || (body !== null && 'status' in body && body.status === 'error')) {
    throw new V1ApiError(
      (body as ApiErrorBody) ?? {
        status: 'error' as const,
        statusCode: response.status,
        code: 'NETWORK_OR_PARSE_ERROR',
        message: response.statusText || '업로드에 실패했어요.',
        timestamp: new Date().toISOString(),
      },
    );
  }

  if (body === null) {
    // 200이지만 바디 파싱 실패(빈 바디/HTML 등) → data 접근 전 에러로 가드.
    throw new V1ApiError({
      status: 'error' as const,
      statusCode: response.status,
      code: 'NETWORK_OR_PARSE_ERROR',
      message: '업로드 응답을 해석하지 못했어요. 다시 시도해 주세요.',
      timestamp: new Date().toISOString(),
    });
  }
  return (body as ApiEnvelope<T>).data;
}

/**
 * 이미지 업로드 mutation.
 *
 * BE 계약: POST /uploads  multipart/form-data, field 이름 = 'files'
 * 응답: { urls: string[] }
 *
 * 호출 예시:
 *   const { mutateAsync } = useV1UploadImages();
 *   const { urls } = await mutateAsync(fileList);
 *
 * 업로드 파일은 v1_api가 /uploads 정적 경로로 서빙하며, 응답 url은 루트-상대(/uploads/...).
 * web은 next.config rewrite로 /uploads/* → v1_api 프록시.
 */
export function useV1UploadImages() {
  return useMutation({
    mutationFn: (files: File | File[] | FileList) => {
      const formData = new FormData();
      const fileArray = files instanceof FileList
        ? Array.from(files)
        : Array.isArray(files)
          ? files
          : [files];
      fileArray.forEach((file) => formData.append('files', file));
      return v1MultipartPost<V1UploadImagesResult>('/uploads', formData);
    },
  });
}

export function useV1AdminOverview() {
  return useQuery({
    queryKey: v1Keys.adminOverview(),
    queryFn: () => v1Get<V1AdminOverview>('/admin/overview'),
  });
}

export function useV1AdminActionLogs(filters?: ListFilters) {
  return useQuery({
    queryKey: [...v1Keys.adminActionLogs(), filters ?? {}] as const,
    queryFn: () => v1Get<CursorPage<V1AdminLog>>('/admin/action-logs', filters),
  });
}

// ---------------------------------------------------------------------------
// Admin — Wave-1 hooks
// ---------------------------------------------------------------------------

export function useV1AdminMe() {
  return useQuery({
    queryKey: v1Keys.adminMe(),
    queryFn: () => v1Get<V1AdminMe>('/admin/me'),
  });
}

export function useV1AdminUsers(filters?: AdminListFilters) {
  return useQuery({
    queryKey: v1Keys.adminUsers(filters as Record<string, unknown>),
    queryFn: () => v1Get<CursorPage<V1AdminUserRow>>('/admin/users', filters),
  });
}

export function useV1AdminUser(userId: string) {
  return useQuery({
    queryKey: v1Keys.adminUser(userId),
    queryFn: () => v1Get<V1AdminUserDetail>(`/admin/users/${userId}`),
    enabled: !!userId,
  });
}

export function useV1AdminMatches(filters?: AdminListFilters) {
  return useQuery({
    queryKey: v1Keys.adminMatches(filters as Record<string, unknown>),
    queryFn: () => v1Get<CursorPage<V1AdminMatchRow>>('/admin/matches', filters),
  });
}

export function useV1AdminMatch(matchId: string) {
  return useQuery({
    queryKey: v1Keys.adminMatch(matchId),
    queryFn: () => v1Get<V1AdminMatchDetail>(`/admin/matches/${matchId}`),
    enabled: !!matchId,
  });
}

export function useV1AdminTeams(filters?: AdminListFilters) {
  return useQuery({
    queryKey: v1Keys.adminTeams(filters as Record<string, unknown>),
    queryFn: () => v1Get<CursorPage<V1AdminTeamRow>>('/admin/teams', filters),
  });
}

export function useV1AdminTeam(teamId: string) {
  return useQuery({
    queryKey: v1Keys.adminTeam(teamId),
    queryFn: () => v1Get<V1AdminTeamDetail>(`/admin/teams/${teamId}`),
    enabled: !!teamId,
  });
}

export function useV1AdminTeamMatches(filters?: AdminListFilters) {
  return useQuery({
    queryKey: v1Keys.adminTeamMatches(filters as Record<string, unknown>),
    queryFn: () => v1Get<CursorPage<V1AdminTeamMatchRow>>('/admin/team-matches', filters),
  });
}

export function useV1AdminStatusChangeLogs(filters?: AdminListFilters) {
  return useQuery({
    queryKey: v1Keys.adminStatusChangeLogs(filters as Record<string, unknown>),
    queryFn: () => v1Get<CursorPage<V1AdminStatusChangeLog>>('/admin/status-change-logs', filters),
  });
}

// ---------------------------------------------------------------------------
// Admin — status-change mutations
// ---------------------------------------------------------------------------

type StatusChangeMutationVars = { id: string; status: string; reason: string };

export function useV1ChangeUserStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, reason }: StatusChangeMutationVars) =>
      v1Post<V1AdminStatusChangeResult>(`/admin/users/${id}/status`, { status, reason }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminUsers() });
      queryClient.invalidateQueries({ queryKey: v1Keys.adminUser(id) });
      queryClient.invalidateQueries({ queryKey: v1Keys.adminOverview() });
    },
  });
}

export function useV1ChangeMatchStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, reason }: StatusChangeMutationVars) =>
      v1Post<V1AdminStatusChangeResult>(`/admin/matches/${id}/status`, { status, reason }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminMatches() });
      queryClient.invalidateQueries({ queryKey: v1Keys.adminMatch(id) });
      queryClient.invalidateQueries({ queryKey: v1Keys.adminOverview() });
    },
  });
}

export function useV1ChangeTeamStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, reason }: StatusChangeMutationVars) =>
      v1Post<V1AdminStatusChangeResult>(`/admin/teams/${id}/status`, { status, reason }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTeams() });
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTeam(id) });
      queryClient.invalidateQueries({ queryKey: v1Keys.adminOverview() });
    },
  });
}

export function useV1ChangeTeamMatchStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, reason }: StatusChangeMutationVars) =>
      v1Post<V1AdminStatusChangeResult>(`/admin/team-matches/${id}/status`, { status, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTeamMatches() });
      queryClient.invalidateQueries({ queryKey: v1Keys.adminOverview() });
    },
  });
}

// ---------------------------------------------------------------------------
// Admin — admin-management (owner-only)
// ---------------------------------------------------------------------------

export function useV1AdminAdmins(filters?: AdminListFilters) {
  return useQuery({
    queryKey: v1Keys.adminAdmins(filters as Record<string, unknown>),
    queryFn: () => v1Get<CursorPage<V1AdminRow>>('/admin/admins', filters),
  });
}

export function useV1GrantAdmin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { userId: string; adminRole: 'ops' | 'support'; reason: string }) =>
      v1Post<V1AdminGrantResult>('/admin/admins', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminAdmins() });
      queryClient.invalidateQueries({ queryKey: v1Keys.adminOverview() });
    },
  });
}

export function useV1UpdateAdminRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, ...body }: { userId: string; adminRole?: 'ops' | 'support' | 'owner'; status?: 'active' | 'revoked'; reason: string }) =>
      v1Patch<V1AdminGrantResult>(`/admin/admins/${userId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminAdmins() });
      queryClient.invalidateQueries({ queryKey: v1Keys.adminOverview() });
    },
  });
}
