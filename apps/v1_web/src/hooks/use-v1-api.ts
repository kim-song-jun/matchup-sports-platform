'use client';

import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { v1Api, v1Delete, v1Get, v1Patch, v1Post, v1Put, getV1ApiBaseUrl, getV1DevAuthHeaders, V1ApiError } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';
import type {
  ApiEnvelope,
  ApiErrorBody,
  AdminListFilters,
  CursorPage,
  V1AdminGrantResult,
  V1AdminInquiryDetail,
  V1AdminInquiryReplyPayload,
  V1AdminInquiryRow,
  V1AdminInquiryStatusPayload,
  V1AdminLog,
  V1AdminNoticeCreatePayload,
  V1AdminNoticeCreateResult,
  V1AdminNoticeRow,
  V1AdminNoticeUpdatePayload,
  V1AdminNoticeUpdateResult,
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
  V1AdminDeleteUserPayload,
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
  V1CreateInquiryPayload,
  V1Home,
  V1InquiriesPage,
  V1Inquiry,
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
  V1PublicProfile,
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
  V1TournamentListPage,
  V1TournamentDetail,
  V1PendingTournamentReview,
  V1TournamentReview,
  V1TournamentReviewsPage,
  V1AdminTournamentReviewsPage,
  V1TournamentAward,
  V1TournamentRegistration,
  V1TournamentRosterResponse,
  V1TournamentPlayer,
  V1AdminTournamentListPage,
  V1AdminRegistrationListPage,
  V1AdminTournamentRegistration,
  V1AdminTournamentRegistrationWithIdempotent,
  V1AdminTournamentBracket,
  V1AdminBracketGroup,
  V1AdminBracketGroupTeam,
  V1AdminBracketFixture,
  V1AdminBracketResult,
  V1AdminTournamentAnnouncement,
  V1AdminTournamentAnnouncementWithIdempotent,
  V1AdminTournamentSponsor,
  V1AdminTournamentSponsorListResult,
  V1AdminTournamentStatusChangeResult,
  V1StandingsRecalculateResult,
  V1ExportRosterCsvResult,
  V1Tournament,
  V1CreateTournamentPayload,
  V1UpdateTournamentPayload,
  V1ChangeTournamentStatusPayload,
  V1CreateRegistrationPayload,
  V1SubmitRegistrationPayload,
  V1CancelRegistrationRequestPayload,
  V1AddPlayerPayload,
  V1UpdatePlayerEligibilityPayload,
  V1AdminConfirmPaymentPayload,
  V1AdminConfirmRegistrationPayload,
  V1AdminCancelRegistrationPayload,
  V1AdminRosterLockPayload,
  V1CreateGroupPayload,
  V1CreateGroupTeamPayload,
  V1CreateFixturePayload,
  V1UpdateFixturePayload,
  V1RecordResultPayload,
  V1CreateAnnouncementPayload,
  V1CreateTournamentSponsorPayload,
  V1UpdateTournamentSponsorPayload,
  V1DeleteAnnouncementResult,
  V1AdminAnnouncementListResult,
  V1UpdateAnnouncementPayload,
  V1TeamInvitationSummary,
  V1TeamInvitationsPage,
  V1ReceivedInvitation,
  V1ReceivedInvitationsPage,
  V1SendInvitationResult,
  V1InvitationActionResult,
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
      gender?: 'male' | 'female';
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
      gender?: 'male' | 'female';
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

export function useV1Inquiries(filters?: ListFilters) {
  return useQuery({
    queryKey: v1Keys.inquiries(filters),
    queryFn: () => v1Get<V1InquiriesPage>('/inquiries', filters),
  });
}

export function useV1Inquiry(inquiryId: string) {
  return useQuery({
    queryKey: v1Keys.inquiry(inquiryId),
    queryFn: () => v1Get<V1Inquiry>(`/inquiries/${inquiryId}`),
    enabled: Boolean(inquiryId),
    retry: false,
  });
}

export function useV1CreateInquiry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1CreateInquiryPayload) => v1Post<V1Inquiry>('/inquiries', body),
    onSuccess: (inquiry) => {
      queryClient.invalidateQueries({ queryKey: [...v1Keys.all, 'inquiries'] });
      queryClient.setQueryData(v1Keys.inquiry(inquiry.inquiryId), inquiry);
    },
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

// Cursor-paginated applicant list for the host management screen. A match can hold
// up to 100 participants while the server caps each page at 50, so a single page can
// hide applicants the host must act on. useInfiniteQuery accumulates pages and, on
// approve/reject invalidation, refetches every loaded page so acted-on applicants drop
// out while the host keeps their place (manual cursor accumulation would double-append).
export function useV1MatchApplicationsInfinite(
  matchId: string,
  filters?: ListFilters,
  options?: { enabled?: boolean },
) {
  return useInfiniteQuery({
    queryKey: [...v1Keys.match(matchId), 'applications', 'infinite', filters ?? {}] as const,
    queryFn: ({ pageParam }) =>
      v1Get<V1MatchApplicationsPage>(`/matches/${matchId}/applications`, {
        ...filters,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.pageInfo.hasNext ? lastPage.pageInfo.nextCursor : undefined),
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
    onSuccess: (result, variables) => {
      queryClient.setQueryData<V1TeamDetail | undefined>(
        [...v1Keys.team(teamId), 'detail'],
        (current) =>
          current
            ? {
                ...current,
                version: result.version ?? current.version,
                membersVisibilityEnabled: result.membersVisibilityEnabled ?? variables.membersVisibilityEnabled ?? current.membersVisibilityEnabled,
                profile: {
                  ...current.profile,
                  logoUrl: variables.logoUrl ?? null,
                  coverImageUrl: variables.coverImageUrl ?? null,
                  introduction: variables.introduction ?? null,
                  activityAreaText: variables.activityMemo ?? variables.activityAreaText ?? null,
                  activityDays: variables.activityDays ?? [],
                  activityFrequency: variables.activityFrequency ?? null,
                  activityTimeSlots: variables.activityTimeSlots ?? [],
                  activityTypes: variables.activityTypes ?? [],
                  activityMemo: variables.activityMemo ?? variables.activityAreaText ?? null,
                  activitySummary: formatTeamActivitySummaryFromPayload(variables),
                  skillLevelText: variables.skillLevelText ?? null,
                  genderRule: variables.genderRule ?? null,
                  joinPolicy: variables.joinPolicy,
                  memberGoalCount: variables.memberGoalCount ?? null,
                },
              }
            : current,
      );
      queryClient.invalidateQueries({ queryKey: v1Keys.team(teamId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.teams() });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.all, 'me', 'teams'] });
    },
  });
}

function formatTeamActivitySummaryFromPayload(payload: V1TeamUpdatePayload) {
  const parts = [
    formatActivityDays(payload.activityDays ?? []),
    formatActivityLabels(payload.activityTimeSlots ?? [], {
      morning: '오전',
      lunch: '점심',
      afternoon: '오후',
      evening: '저녁',
      late_night: '심야',
    }).join('/'),
    payload.activityFrequency
      ? ({
          weekly_1: '주 1회',
          weekly_2: '주 2회',
          weekly_3: '주 3회',
          weekly_4_plus: '주 4회 이상',
          biweekly_1: '격주 1회',
          irregular: '비정기',
        } as Record<string, string>)[payload.activityFrequency]
      : null,
    formatActivityLabels(payload.activityTypes ?? [], {
      regular_meetup: '정기 모임',
      friendly_match: '친선 경기',
      team_match: '팀매치',
      tournament_prep: '대회 준비',
      training: '훈련/레슨',
      free_participation: '자유 참여',
      beginner_friendly: '초보 환영',
      competitive: '실력 중심',
    }).join('/'),
    payload.activityMemo?.trim(),
  ].filter(Boolean);
  return parts.join(' · ') || payload.activityAreaText?.trim() || null;
}

function formatActivityDays(days: string[]) {
  const ordered = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].filter((day) => days.includes(day));
  if (ordered.length === 7) return '매일';
  if (ordered.join(',') === 'mon,tue,wed,thu,fri') return '평일';
  if (ordered.join(',') === 'sat,sun') return '주말';
  return formatActivityLabels(ordered, { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' }).join('·');
}

function formatActivityLabels(values: string[], labels: Record<string, string>) {
  return values.map((value) => labels[value]).filter(Boolean);
}

export function useV1MyTeams(filters?: ListFilters) {
  return useQuery({
    queryKey: [...v1Keys.all, 'me', 'teams', filters ?? {}] as const,
    queryFn: () => v1Get<V1MyTeamsResponse>('/me/teams', filters),
  });
}

export function useV1TeamMembers(teamId: string | null, filters?: ListFilters, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...v1Keys.team(teamId ?? ''), 'members', filters ?? {}] as const,
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

export function useV1CloseTeamMatch(teamMatchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body?: { reason?: string | null }) =>
      v1Post<{ teamMatchId: string; status: string; expiredApplications: number; detailRoute: string }>(`/team-matches/${teamMatchId}/close`, body ?? {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.teamMatch(teamMatchId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.teamMatches() });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.teamMatch(teamMatchId), 'applications'] });
    },
  });
}

export function useV1ReopenTeamMatch(teamMatchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body?: { reason?: string | null }) =>
      v1Post<{ teamMatchId: string; status: string; detailRoute: string }>(`/team-matches/${teamMatchId}/reopen`, body ?? {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.teamMatch(teamMatchId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.teamMatches() });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.teamMatch(teamMatchId), 'applications'] });
    },
  });
}

export function useV1CompleteTeamMatch(teamMatchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body?: { note?: string | null }) =>
      v1Post<{ teamMatchId: string; status: string; completedAt: string | null; detailRoute: string }>(`/team-matches/${teamMatchId}/complete`, body ?? {}),
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
      invalidateV1NotificationQueries(queryClient);
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

export function useV1NotificationUnreadSummary(options?: QueryOptions) {
  return useQuery({
    queryKey: v1Keys.notificationUnreadSummary(),
    queryFn: () => v1Get<V1NotificationsPage>('/notifications', { status: 'unread', limit: 1 }),
    select: (data) => ({
      unreadCount: Number.isFinite(data.unreadCount) ? data.unreadCount : 0,
    }),
    enabled: options?.enabled ?? true,
    retry: false,
    staleTime: 15_000,
  });
}

export function useV1ReadNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) => v1Patch<{ notificationId: string; status: 'read'; readAt: string }>(`/notifications/${notificationId}/read`),
    onSuccess: () => invalidateV1NotificationQueries(queryClient),
  });
}

export function useV1ReadAllNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body?: { type?: string | null }) =>
      v1Post<{ updatedCount: number; readAt: string; unreadCount: number }>('/notifications/read-all', body ?? {}),
    onSuccess: () => invalidateV1NotificationQueries(queryClient),
  });
}

function invalidateV1NotificationQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: v1Keys.notificationsRoot() });
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

export function useV1PublicProfile(userId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: v1Keys.publicProfile(userId),
    queryFn: () => v1Get<V1PublicProfile>(`/users/${userId}/public-profile`),
    enabled: Boolean(userId) && (options?.enabled ?? true),
    retry: false,
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
      email?: string | null;
      profileImageUrl?: string | null;
      phone?: string | null;
      birthDate?: string | null;
    }) =>
      v1Patch<{ profile: V1Profile['profile']; updatedAt: string }>('/me/profile', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.profile() });
      queryClient.invalidateQueries({ queryKey: v1Keys.authMe() });
      queryClient.invalidateQueries({ queryKey: v1Keys.settings() });
      queryClient.invalidateQueries({ queryKey: v1Keys.home() });
      queryClient.invalidateQueries({ queryKey: v1Keys.teams() });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.all, 'teams'] });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.all, 'me', 'teams'] });
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

  // `response.json()` can yield a non-object JSON primitive (e.g. a 200 with body "ok").
  // Guard `typeof === 'object'` before `'status' in body` — the `in` operator throws a
  // TypeError on primitives, which would turn upload error handling into a crash.
  if (!response.ok || (typeof body === 'object' && body !== null && 'status' in body && body.status === 'error')) {
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

  // 200이지만 정상 엔벨로프가 아닌 경우(빈 바디/HTML → null, 또는 "ok" 같은 JSON
  // primitive)를 모두 가드. data 필드를 가진 객체임을 확인한 뒤에만 .data 반환 —
  // primitive를 그대로 통과시키면 .data가 undefined로 호출부에서 크래시한다.
  if (typeof body !== 'object' || body === null || !('data' in body)) {
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
 * BE 계약: POST /api/v1/uploads (= getV1ApiBaseUrl + '/uploads')  multipart/form-data, field 이름 = 'files'
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

/**
 * 진행률 콜백이 필요한 대용량 업로드용 XHR 멀티파트 (fetch는 업로드 진행 이벤트가 없다).
 * 응답 파싱·에러 규약은 v1MultipartPost와 동일하게 맞춘다.
 */
function v1MultipartUploadWithProgress<T>(
  path: string,
  formData: FormData,
  onProgress?: (percent: number) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${getV1ApiBaseUrl()}${path}`);
    xhr.withCredentials = true;
    for (const [k, v] of Object.entries(getV1DevAuthHeaders())) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () =>
      reject(new V1ApiError({ status: 'error', statusCode: 0, code: 'NETWORK_OR_PARSE_ERROR', message: '업로드에 실패했어요.', timestamp: new Date().toISOString() }));
    xhr.onload = () => {
      let body: ApiEnvelope<T> | ApiErrorBody | null = null;
      try { body = JSON.parse(xhr.responseText); } catch { body = null; }
      const isError =
        xhr.status < 200 || xhr.status >= 300 ||
        (typeof body === 'object' && body !== null && 'status' in body && body.status === 'error');
      if (isError) {
        reject(new V1ApiError(
          (body as ApiErrorBody) ?? { status: 'error', statusCode: xhr.status, code: 'NETWORK_OR_PARSE_ERROR', message: xhr.statusText || '업로드에 실패했어요.', timestamp: new Date().toISOString() },
        ));
        return;
      }
      resolve((body as ApiEnvelope<T>).data);
    };
    xhr.send(formData);
  });
}

/**
 * 경기 영상 파일 업로드 mutation (1개, 최대 200MB, mp4/webm/mov).
 * BE 계약: POST /api/v1/uploads/videos — field 'files', 응답 { urls: string[] }.
 * 응답 url(/uploads/*.mp4)은 정적 서빙이 Range 요청을 지원해 <video>에서 바로 스트리밍된다.
 * 200MB 대용량이라 onProgress로 업로드 진행률(%)을 노출한다.
 */
export function useV1UploadVideo() {
  return useMutation({
    mutationFn: ({ file, onProgress }: { file: File; onProgress?: (percent: number) => void }) => {
      const formData = new FormData();
      formData.append('files', file);
      return v1MultipartUploadWithProgress<V1UploadImagesResult>('/uploads/videos', formData, onProgress);
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

export function useV1AdminNotices(filters?: AdminListFilters) {
  return useQuery({
    queryKey: v1Keys.adminNotices(filters as Record<string, unknown>),
    queryFn: () => v1Get<CursorPage<V1AdminNoticeRow>>('/admin/notices', filters),
  });
}

export function useV1AdminInquiries(filters?: AdminListFilters) {
  return useQuery({
    queryKey: v1Keys.adminInquiries(filters as Record<string, unknown>),
    queryFn: () => v1Get<CursorPage<V1AdminInquiryRow>>('/admin/inquiries', filters),
  });
}

export function useV1AdminInquiry(inquiryId: string) {
  return useQuery({
    queryKey: v1Keys.adminInquiry(inquiryId),
    queryFn: () => v1Get<V1AdminInquiryDetail>(`/admin/inquiries/${inquiryId}`),
    enabled: !!inquiryId,
  });
}

export function useV1ReplyAdminInquiry(inquiryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1AdminInquiryReplyPayload) =>
      v1Post<V1AdminInquiryDetail>(`/admin/inquiries/${inquiryId}/replies`, body),
    onSuccess: (data) => {
      queryClient.setQueryData(v1Keys.adminInquiry(inquiryId), data);
      queryClient.invalidateQueries({ queryKey: [...v1Keys.all, 'admin', 'inquiries'] });
      queryClient.invalidateQueries({ queryKey: v1Keys.inquiry(inquiryId) });
    },
  });
}

export function useV1ChangeAdminInquiryStatus(inquiryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1AdminInquiryStatusPayload) =>
      v1Post<V1AdminStatusChangeResult>(`/admin/inquiries/${inquiryId}/status`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminInquiry(inquiryId) });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.all, 'admin', 'inquiries'] });
      queryClient.invalidateQueries({ queryKey: v1Keys.inquiry(inquiryId) });
    },
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

export function useV1DeleteAdminUser(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1AdminDeleteUserPayload) =>
      v1Delete<V1AdminStatusChangeResult>(`/admin/users/${userId}`, { body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminUser(userId) });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.all, 'admin', 'users'] });
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

export function useV1CreateAdminNotice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1AdminNoticeCreatePayload) =>
      v1Post<V1AdminNoticeCreateResult>('/admin/notices', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminNotices() });
      queryClient.invalidateQueries({ queryKey: v1Keys.notices() });
      queryClient.invalidateQueries({ queryKey: v1Keys.home() });
    },
  });
}

export function useV1UpdateAdminNotice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ noticeId, body }: { noticeId: string; body: V1AdminNoticeUpdatePayload }) =>
      v1Patch<V1AdminNoticeUpdateResult>(`/admin/notices/${noticeId}`, body),
    onSuccess: (_data, { noticeId }) => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminNotices() });
      queryClient.invalidateQueries({ queryKey: v1Keys.notices() });
      queryClient.invalidateQueries({ queryKey: v1Keys.notice(noticeId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.home() });
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

// ---------------------------------------------------------------------------
// Tournament — consumer/team hooks
// ---------------------------------------------------------------------------

type TournamentListFilters = {
  status?: 'open' | 'closed' | 'in_progress' | 'completed';
  sportId?: string;
  cursor?: string;
  limit?: number;
};

export function useV1Tournaments(params?: TournamentListFilters) {
  return useQuery({
    queryKey: v1Keys.tournaments(params as Record<string, unknown>),
    queryFn: () => v1Get<V1TournamentListPage>('/tournaments', params),
  });
}

export function useV1Tournament(id: string) {
  return useQuery({
    queryKey: v1Keys.tournament(id),
    queryFn: () => v1Get<V1TournamentDetail>(`/tournaments/${id}`),
    enabled: !!id,
  });
}

/** 대회 리뷰 목록 (tournaments/:id에 이미 포함되지만 독립 조회용) */
export function useV1TournamentReviews(
  tournamentId: string,
  params?: { page?: number; pageSize?: number; search?: string },
) {
  const page = params?.page ?? 1;
  const pageSize = params?.pageSize ?? 10;
  const search = params?.search?.trim() || undefined;
  return useQuery({
    queryKey: ['tournament-reviews', tournamentId, page, pageSize, search ?? ''],
    queryFn: () =>
      v1Get<V1TournamentReviewsPage>(`/tournaments/${tournamentId}/reviews`, {
        page,
        pageSize,
        ...(search ? { search } : {}),
      }),
    enabled: !!tournamentId,
    placeholderData: keepPreviousData,
  });
}

/** 내 리뷰 조회 (이미 작성했는지 확인) */
export function useV1MyTournamentReview(tournamentId: string, enabled = true) {
  return useQuery({
    queryKey: ['tournament-reviews-me', tournamentId],
    queryFn: () => v1Get<V1TournamentReview | null>(`/tournaments/${tournamentId}/reviews/me`),
    enabled: !!tournamentId && enabled,
  });
}

/** 참가 확정했지만 아직 리뷰를 작성하지 않은 종료 대회 목록 (최근 종료순) */
export function useV1PendingTournamentReviews(enabled = true) {
  return useQuery({
    queryKey: ['tournament-reviews-pending'],
    queryFn: () => v1Get<V1PendingTournamentReview[]>('/tournaments/me/pending-reviews'),
    enabled,
  });
}

/** 참가팀 여부 확인 */
export function useV1TournamentParticipantCheck(tournamentId: string, enabled = true) {
  return useQuery({
    queryKey: ['tournament-participant-check', tournamentId],
    queryFn: () => v1Get<{ isParticipant: boolean }>(`/tournaments/${tournamentId}/participant-check`),
    enabled: !!tournamentId && enabled,
  });
}

/** 리뷰 제출 */
export function useV1SubmitTournamentReview(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { rating: number; comment?: string; photoUrls?: string[] }) =>
      v1Post<V1TournamentReview>(`/tournaments/${tournamentId}/reviews`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: v1Keys.tournament(tournamentId) });
      void queryClient.invalidateQueries({ queryKey: ['tournament-reviews', tournamentId] });
      void queryClient.invalidateQueries({ queryKey: ['tournament-reviews-me', tournamentId] });
    },
  });
}

/** 어드민: 어워드 조회 — 어드민 대회 상세 응답에는 awards가 포함되지 않아 별도 조회가 필요하다 */
export function useV1AdminTournamentAwards(tournamentId: string) {
  return useQuery({
    queryKey: ['admin-tournament-awards', tournamentId],
    queryFn: () => v1Get<V1TournamentAward[]>(`/admin/tournaments/${tournamentId}/awards`),
    enabled: !!tournamentId,
  });
}

/** 어드민: 어워드 설정 */
export function useV1SetTournamentAwards(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (awards: {
      awardType: string; awardLabel: string; recipientName: string;
      teamName?: string; note?: string; sortOrder?: number;
    }[]) => v1Put<V1TournamentAward[]>(`/admin/tournaments/${tournamentId}/awards`, { awards }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: v1Keys.tournament(tournamentId) });
      void queryClient.invalidateQueries({ queryKey: ['admin-tournament-awards', tournamentId] });
    },
  });
}

/** 어드민: 리뷰 모더레이션 목록 조회 */
export function useV1AdminTournamentReviews(
  tournamentId: string,
  params?: { page?: number; pageSize?: number; search?: string },
) {
  return useQuery({
    queryKey: ['admin-tournament-reviews', tournamentId, params ?? {}],
    queryFn: () =>
      v1Get<V1AdminTournamentReviewsPage>(`/admin/tournaments/${tournamentId}/reviews`, params),
    enabled: !!tournamentId,
  });
}

/** 어드민: 리뷰 숨기기 */
export function useV1HideReview(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reviewId, reason }: { reviewId: string; reason?: string }) =>
      v1Patch<{ alreadyHidden: boolean }>(
        `/admin/tournaments/${tournamentId}/reviews/${reviewId}/hide`,
        { reason },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-tournament-reviews', tournamentId] });
    },
  });
}

/** 어드민: 리뷰 다시 공개하기 */
export function useV1UnhideReview(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reviewId }: { reviewId: string }) =>
      v1Patch<{ alreadyVisible: boolean }>(
        `/admin/tournaments/${tournamentId}/reviews/${reviewId}/unhide`,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-tournament-reviews', tournamentId] });
    },
  });
}

export function useV1CreateRegistration(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1CreateRegistrationPayload) =>
      v1Post<V1TournamentRegistration>(`/tournaments/${tournamentId}/registrations`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.tournament(tournamentId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.myTournamentRegistration(tournamentId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.myTournamentRegistrations(tournamentId) });
    },
  });
}

export function useV1Registration(tournamentId: string, registrationId: string) {
  return useQuery({
    queryKey: v1Keys.tournamentRegistration(tournamentId, registrationId),
    queryFn: () =>
      v1Get<V1TournamentRegistration>(
        `/tournaments/${tournamentId}/registrations/${registrationId}`,
      ),
    enabled: !!tournamentId && !!registrationId,
  });
}

/** 로그인 유저 본인의 신청을 registrationId 없이 조회한다. 없으면 404 (data=undefined). */
export function useV1MyRegistration(tournamentId: string, options?: QueryOptions) {
  return useQuery({
    queryKey: v1Keys.myTournamentRegistration(tournamentId),
    queryFn: () =>
      v1Get<V1TournamentRegistration>(
        `/tournaments/${tournamentId}/registrations/my-registration`,
      ),
    enabled: (options?.enabled ?? true) && !!tournamentId,
    retry: (failureCount, error) => {
      // 404 (no registration yet) is expected — do not retry
      if (error instanceof V1ApiError && error.statusCode === 404) return false;
      return failureCount < 2;
    },
  });
}

/** 로그인 유저가 운영 권한을 가진 팀들의 대회 신청 목록을 조회한다. */
export function useV1MyRegistrations(tournamentId: string, options?: QueryOptions) {
  return useQuery({
    queryKey: [...v1Keys.myTournamentRegistrations(tournamentId), 'team-member-visible'] as const,
    queryFn: async () => {
      try {
        const registrations = await v1Get<V1TournamentRegistration[] | V1TournamentRegistration>(
          `/tournaments/${tournamentId}/registrations/my-registrations`,
        );
        return Array.isArray(registrations) ? registrations : [registrations];
      } catch (error) {
        if (error instanceof V1ApiError && error.statusCode === 404) return [];
        throw error;
      }
    },
    enabled: !!tournamentId && options?.enabled !== false,
    retry: (failureCount, error) => {
      if (error instanceof V1ApiError && error.statusCode === 404) return false;
      return failureCount < 2;
    },
  });
}

export function useV1SubmitRegistration(tournamentId: string, registrationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1SubmitRegistrationPayload & { registrationIdOverride?: string }) => {
      const { registrationIdOverride, ...payload } = body;
      const targetRegistrationId = registrationIdOverride ?? registrationId;
      return v1Post<V1TournamentRegistration>(
        `/tournaments/${tournamentId}/registrations/${targetRegistrationId}/submit`,
        payload,
      );
    },
    onSuccess: (_data, variables) => {
      const targetRegistrationId = variables.registrationIdOverride ?? registrationId;
      queryClient.invalidateQueries({
        queryKey: v1Keys.tournamentRegistration(tournamentId, targetRegistrationId),
      });
      queryClient.invalidateQueries({ queryKey: v1Keys.tournament(tournamentId) });
      // /my 페이지가 myTournamentRegistration 캐시를 사용하므로 함께 무효화
      queryClient.invalidateQueries({
        queryKey: v1Keys.myTournamentRegistration(tournamentId),
      });
      queryClient.invalidateQueries({
        queryKey: v1Keys.myTournamentRegistrations(tournamentId),
      });
    },
  });
}

export function useV1CancelRegistrationRequest(tournamentId: string, registrationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1CancelRegistrationRequestPayload) =>
      v1Post<V1TournamentRegistration>(
        `/tournaments/${tournamentId}/registrations/${registrationId}/cancel-request`,
        body,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: v1Keys.tournamentRegistration(tournamentId, registrationId),
      });
      queryClient.invalidateQueries({ queryKey: v1Keys.tournament(tournamentId) });
      // /my 페이지가 myTournamentRegistration 캐시를 사용하므로 함께 무효화
      queryClient.invalidateQueries({
        queryKey: v1Keys.myTournamentRegistration(tournamentId),
      });
      queryClient.invalidateQueries({
        queryKey: v1Keys.myTournamentRegistrations(tournamentId),
      });
    },
  });
}

export function useV1WithdrawCancelRegistrationRequest(tournamentId: string, registrationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      v1Post<V1TournamentRegistration>(
        `/tournaments/${tournamentId}/registrations/${registrationId}/cancel-request/withdraw`,
        {},
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: v1Keys.tournamentRegistration(tournamentId, registrationId),
      });
      queryClient.invalidateQueries({ queryKey: v1Keys.tournament(tournamentId) });
      queryClient.invalidateQueries({
        queryKey: v1Keys.myTournamentRegistration(tournamentId),
      });
      queryClient.invalidateQueries({
        queryKey: v1Keys.myTournamentRegistrations(tournamentId),
      });
    },
  });
}

export function useV1TournamentPlayers(tournamentId: string, registrationId: string) {
  return useQuery({
    queryKey: v1Keys.tournamentPlayers(tournamentId, registrationId),
    queryFn: () =>
      v1Get<V1TournamentRosterResponse>(
        `/tournaments/${tournamentId}/registrations/${registrationId}/players`,
      ),
    enabled: !!tournamentId && !!registrationId,
  });
}

export function useV1AddPlayer(tournamentId: string, registrationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1AddPlayerPayload) =>
      v1Post<V1TournamentPlayer>(
        `/tournaments/${tournamentId}/registrations/${registrationId}/players`,
        body,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: v1Keys.tournamentPlayers(tournamentId, registrationId),
      });
      queryClient.invalidateQueries({
        queryKey: v1Keys.tournamentRegistration(tournamentId, registrationId),
      });
      queryClient.invalidateQueries({
        queryKey: v1Keys.myTournamentRegistration(tournamentId),
      });
    },
  });
}

export function useV1UpdatePlayer(tournamentId: string, registrationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ playerId, body }: { playerId: string; body: V1UpdatePlayerEligibilityPayload }) =>
      v1Patch<V1TournamentPlayer>(
        `/tournaments/${tournamentId}/registrations/${registrationId}/players/${playerId}`,
        body,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: v1Keys.tournamentPlayers(tournamentId, registrationId),
      });
      queryClient.invalidateQueries({
        queryKey: v1Keys.tournamentRegistration(tournamentId, registrationId),
      });
      queryClient.invalidateQueries({
        queryKey: v1Keys.myTournamentRegistration(tournamentId),
      });
    },
  });
}

export function useV1RemovePlayer(tournamentId: string, registrationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (playerId: string) =>
      v1Api<V1TournamentPlayer>(
        `/tournaments/${tournamentId}/registrations/${registrationId}/players/${playerId}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: v1Keys.tournamentPlayers(tournamentId, registrationId),
      });
      queryClient.invalidateQueries({
        queryKey: v1Keys.tournamentRegistration(tournamentId, registrationId),
      });
      queryClient.invalidateQueries({
        queryKey: v1Keys.myTournamentRegistration(tournamentId),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Tournament — admin hooks
// ---------------------------------------------------------------------------

type AdminTournamentListFilters = {
  status?: V1Tournament['status'];
  sportId?: string;
  q?: string;
  cursor?: string;
  limit?: number;
};

export function useV1AdminTournaments(params?: AdminTournamentListFilters) {
  return useQuery({
    queryKey: v1Keys.adminTournaments(params as Record<string, unknown>),
    queryFn: () => v1Get<V1AdminTournamentListPage>('/admin/tournaments', params),
  });
}

export function useV1AdminTournament(id: string) {
  return useQuery({
    queryKey: v1Keys.adminTournament(id),
    queryFn: () => v1Get<V1Tournament>(`/admin/tournaments/${id}`),
    enabled: !!id,
  });
}

export function useV1CreateTournament() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1CreateTournamentPayload) =>
      v1Post<V1Tournament>('/admin/tournaments', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTournaments() });
    },
  });
}

export function useV1UpdateTournament(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1UpdateTournamentPayload) =>
      v1Patch<V1Tournament>(`/admin/tournaments/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTournament(id) });
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTournaments() });
    },
  });
}

export function useV1ChangeTournamentStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1ChangeTournamentStatusPayload) =>
      v1Post<V1AdminTournamentStatusChangeResult>(`/admin/tournaments/${id}/status`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTournament(id) });
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTournaments() });
      queryClient.invalidateQueries({ queryKey: v1Keys.tournament(id) });
    },
  });
}

type AdminRegistrationListFilters = {
  status?: string;
  cursor?: string;
  limit?: number;
};

export function useV1AdminTournamentRegistrations(
  tournamentId: string,
  params?: AdminRegistrationListFilters,
) {
  return useQuery({
    queryKey: v1Keys.adminTournamentRegistrations(tournamentId, params as Record<string, unknown>),
    queryFn: () =>
      v1Get<V1AdminRegistrationListPage>(
        `/admin/tournaments/${tournamentId}/registrations`,
        params,
      ),
    enabled: !!tournamentId,
  });
}

export function useV1ConfirmPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      registrationId,
      ...body
    }: { registrationId: string } & V1AdminConfirmPaymentPayload) =>
      v1Patch<V1AdminTournamentRegistration>(
        `/admin/registrations/${registrationId}/confirm-payment`,
        body,
      ),
    onSuccess: (_data) => {
      queryClient.invalidateQueries({
        queryKey: [...v1Keys.all, 'admin', 'tournaments'],
      });
      queryClient.invalidateQueries({ queryKey: v1Keys.tournament(_data.tournamentId) });
    },
  });
}

export function useV1ConfirmRegistration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      registrationId,
      ...body
    }: { registrationId: string } & V1AdminConfirmRegistrationPayload) =>
      v1Patch<V1AdminTournamentRegistrationWithIdempotent>(
        `/admin/registrations/${registrationId}/confirm`,
        body,
      ),
    onSuccess: (_data) => {
      queryClient.invalidateQueries({
        queryKey: [...v1Keys.all, 'admin', 'tournaments'],
      });
      queryClient.invalidateQueries({ queryKey: v1Keys.tournament(_data.tournamentId) });
    },
  });
}

export function useV1CancelRegistrationAdmin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      registrationId,
      ...body
    }: { registrationId: string } & V1AdminCancelRegistrationPayload) =>
      v1Patch<V1AdminTournamentRegistration>(
        `/admin/registrations/${registrationId}/cancel`,
        body,
      ),
    onSuccess: (_data) => {
      queryClient.invalidateQueries({
        queryKey: [...v1Keys.all, 'admin', 'tournaments'],
      });
      queryClient.invalidateQueries({ queryKey: v1Keys.tournament(_data.tournamentId) });
    },
  });
}

/** 취소 요청 거부(잔류) — cancel_requested 상태만 허용, cancelPreviousStatus(없으면 confirmed)로 복원 */
export function useV1RejectCancelRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ registrationId }: { registrationId: string }) =>
      v1Patch<V1AdminTournamentRegistration>(
        `/admin/registrations/${registrationId}/reject-cancel`,
      ),
    onSuccess: (_data) => {
      queryClient.invalidateQueries({
        queryKey: [...v1Keys.all, 'admin', 'tournaments'],
      });
      queryClient.invalidateQueries({ queryKey: v1Keys.tournament(_data.tournamentId) });
    },
  });
}

export function useV1RosterLock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      registrationId,
      ...body
    }: { registrationId: string } & V1AdminRosterLockPayload) =>
      v1Post<V1AdminTournamentRegistration>(
        `/admin/registrations/${registrationId}/roster-lock`,
        body,
      ),
    onSuccess: (_data) => {
      queryClient.invalidateQueries({
        queryKey: [...v1Keys.all, 'admin', 'tournaments'],
      });
      queryClient.invalidateQueries({ queryKey: v1Keys.tournament(_data.tournamentId) });
    },
  });
}

export function useV1RosterUnlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (registrationId: string) =>
      v1Api<V1AdminTournamentRegistration>(
        `/admin/registrations/${registrationId}/roster-lock`,
        { method: 'DELETE' },
      ),
    onSuccess: (_data) => {
      queryClient.invalidateQueries({
        queryKey: [...v1Keys.all, 'admin', 'tournaments'],
      });
      queryClient.invalidateQueries({ queryKey: v1Keys.tournament(_data.tournamentId) });
    },
  });
}

/** 명단 제출 마감 예외 부여 — 마감이 지나도 해당 신청 팀은 명단을 계속 수정할 수 있게 한다 */
export function useV1RosterDeadlineOverrideGrant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (registrationId: string) =>
      v1Post<V1AdminTournamentRegistration>(
        `/admin/registrations/${registrationId}/roster-deadline-override`,
      ),
    onSuccess: (_data) => {
      queryClient.invalidateQueries({
        queryKey: [...v1Keys.all, 'admin', 'tournaments'],
      });
      queryClient.invalidateQueries({ queryKey: v1Keys.tournament(_data.tournamentId) });
    },
  });
}

/** 명단 제출 마감 예외 해제 */
export function useV1RosterDeadlineOverrideRevoke() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (registrationId: string) =>
      v1Api<V1AdminTournamentRegistration>(
        `/admin/registrations/${registrationId}/roster-deadline-override`,
        { method: 'DELETE' },
      ),
    onSuccess: (_data) => {
      queryClient.invalidateQueries({
        queryKey: [...v1Keys.all, 'admin', 'tournaments'],
      });
      queryClient.invalidateQueries({ queryKey: v1Keys.tournament(_data.tournamentId) });
    },
  });
}

/**
 * Lazy CSV export — returns a callable function rather than auto-fetching.
 * The server returns { filename, csv } (wrapped in ApiEnvelope). Callers
 * convert `csv` to a Blob and trigger a file download.
 */
export function useV1ExportRosterCsv(registrationId: string) {
  return useMutation({
    mutationFn: () =>
      v1Get<V1ExportRosterCsvResult>(
        `/admin/registrations/${registrationId}/players/export`,
      ),
  });
}

export function useV1UpdatePlayerEligibility() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      playerId,
      ...body
    }: { playerId: string } & V1UpdatePlayerEligibilityPayload) =>
      v1Patch<V1TournamentPlayer>(`/admin/players/${playerId}/eligibility`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...v1Keys.all, 'admin', 'tournaments'],
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Tournament — admin bracket hooks
// ---------------------------------------------------------------------------

export function useV1CreateGroup(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1CreateGroupPayload) =>
      v1Post<V1AdminBracketGroup>(`/admin/tournaments/${tournamentId}/groups`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: v1Keys.adminTournamentBracket(tournamentId),
      });
    },
  });
}

export function useV1AssignGroupTeam(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1CreateGroupTeamPayload) =>
      v1Post<V1AdminBracketGroupTeam>(`/admin/tournaments/${tournamentId}/group-teams`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: v1Keys.adminTournamentBracket(tournamentId),
      });
    },
  });
}

export function useV1CreateFixture(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1CreateFixturePayload) =>
      v1Post<V1AdminBracketFixture>(`/admin/tournaments/${tournamentId}/fixtures`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: v1Keys.adminTournamentBracket(tournamentId),
      });
    },
  });
}

/** 경기 일정·장소·대진 수정 (`PATCH /admin/fixtures/:id`) — 결과 있는 경기의 팀 변경은 409 FIXTURE_HAS_RESULT */
export function useV1UpdateFixture(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fixtureId, ...body }: { fixtureId: string } & V1UpdateFixturePayload) =>
      v1Patch<V1AdminBracketFixture>(`/admin/fixtures/${fixtureId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTournamentBracket(tournamentId) });
    },
  });
}

/** 경기 삭제 (`DELETE /admin/fixtures/:id`) — 결과 있으면 409 */
export function useV1DeleteFixture(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fixtureId: string) => v1Delete<{ deleted: boolean }>(`/admin/fixtures/${fixtureId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTournamentBracket(tournamentId) });
    },
  });
}

/** 결과 삭제(오입력 복구, `DELETE /admin/fixtures/:id/result`) — 경기 상태 scheduled 복귀 */
export function useV1DeleteFixtureResult(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fixtureId: string) => v1Delete<{ deleted: boolean }>(`/admin/fixtures/${fixtureId}/result`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTournamentBracket(tournamentId) });
    },
  });
}

/** 조 이름·진출 팀 수 수정 (`PATCH /admin/groups/:id`) */
export function useV1UpdateGroup(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, ...body }: { groupId: string; name?: string; advanceCount?: number }) =>
      v1Patch<V1AdminBracketGroup>(`/admin/groups/${groupId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTournamentBracket(tournamentId) });
    },
  });
}

/** 조 삭제 (`DELETE /admin/groups/:id`) — 팀 배정·경기 있으면 409 */
export function useV1DeleteGroup(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => v1Delete<{ deleted: boolean }>(`/admin/groups/${groupId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTournamentBracket(tournamentId) });
    },
  });
}

/** 조 팀 배정 해제 (`DELETE /admin/group-teams/:id`) — 해당 순위 행도 정리 */
export function useV1RemoveGroupTeam(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupTeamId: string) => v1Delete<{ deleted: boolean }>(`/admin/group-teams/${groupTeamId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTournamentBracket(tournamentId) });
    },
  });
}

export function useV1RecordResult(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      fixtureId,
      ...body
    }: { fixtureId: string } & V1RecordResultPayload) =>
      v1Post<V1AdminBracketResult>(`/admin/fixtures/${fixtureId}/result`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: v1Keys.adminTournamentBracket(tournamentId),
      });
    },
  });
}

export function useV1RecalculateStandings(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      v1Post<V1StandingsRecalculateResult>(
        `/admin/tournaments/${tournamentId}/standings/recalculate`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: v1Keys.adminTournamentBracket(tournamentId),
      });
      queryClient.invalidateQueries({ queryKey: v1Keys.tournament(tournamentId) });
    },
  });
}

export function useV1AdminBracket(tournamentId: string) {
  return useQuery({
    queryKey: v1Keys.adminTournamentBracket(tournamentId),
    queryFn: () =>
      v1Get<V1AdminTournamentBracket>(`/admin/tournaments/${tournamentId}/bracket`),
    enabled: !!tournamentId,
  });
}

// ---------------------------------------------------------------------------
// Tournament — admin announcement hooks
// ---------------------------------------------------------------------------

export function useV1AdminAnnouncements(tournamentId: string) {
  return useQuery({
    queryKey: v1Keys.adminTournamentAnnouncements(tournamentId),
    queryFn: () =>
      v1Get<V1AdminAnnouncementListResult>(
        `/admin/tournaments/${tournamentId}/announcements`,
      ),
    enabled: !!tournamentId,
  });
}

export function useV1CreateAnnouncement(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1CreateAnnouncementPayload) =>
      v1Post<V1AdminTournamentAnnouncement>(
        `/admin/tournaments/${tournamentId}/announcements`,
        body,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTournamentAnnouncements(tournamentId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTournament(tournamentId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.tournament(tournamentId) });
    },
  });
}

export function useV1UpdateAnnouncement(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      announcementId,
      body,
    }: {
      announcementId: string;
      body: V1UpdateAnnouncementPayload;
    }) =>
      v1Patch<V1AdminTournamentAnnouncement>(
        `/admin/announcements/${announcementId}`,
        body,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTournamentAnnouncements(tournamentId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTournament(tournamentId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.tournament(tournamentId) });
    },
  });
}

export function useV1PublishAnnouncement(tournamentId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (announcementId: string) =>
      v1Patch<V1AdminTournamentAnnouncementWithIdempotent>(
        `/admin/announcements/${announcementId}/publish`,
      ),
    onSuccess: () => {
      if (tournamentId) {
        queryClient.invalidateQueries({ queryKey: v1Keys.adminTournamentAnnouncements(tournamentId) });
      }
      queryClient.invalidateQueries({ queryKey: [...v1Keys.all, 'admin', 'tournaments'] });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.all, 'tournaments'] });
    },
  });
}

export function useV1AdminTournamentSponsors(tournamentId: string) {
  return useQuery({
    queryKey: v1Keys.adminTournamentSponsors(tournamentId),
    queryFn: () =>
      v1Get<V1AdminTournamentSponsorListResult>(
        `/admin/tournaments/${tournamentId}/sponsors`,
      ),
    enabled: !!tournamentId,
  });
}

export function useV1CreateTournamentSponsor(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1CreateTournamentSponsorPayload) =>
      v1Post<V1AdminTournamentSponsor>(
        `/admin/tournaments/${tournamentId}/sponsors`,
        body,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTournamentSponsors(tournamentId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTournament(tournamentId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.tournament(tournamentId) });
    },
  });
}

export function useV1UpdateTournamentSponsor(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { sponsorId: string; body: V1UpdateTournamentSponsorPayload }) =>
      v1Patch<V1AdminTournamentSponsor>(
        `/admin/tournaments/${tournamentId}/sponsors/${input.sponsorId}`,
        input.body,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTournamentSponsors(tournamentId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTournament(tournamentId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.tournament(tournamentId) });
    },
  });
}

export function useV1DeactivateTournamentSponsor(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sponsorId: string) =>
      v1Post<V1AdminTournamentSponsor>(
        `/admin/tournaments/${tournamentId}/sponsors/${sponsorId}/deactivate`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTournamentSponsors(tournamentId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTournament(tournamentId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.tournament(tournamentId) });
    },
  });
}

// ── Team Invitations ──────────────────────────────────────────────────────────

/** POST /teams/:teamId/invitations — 이메일로 팀원 초대 발송 */
export function useV1DeleteAnnouncement(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (announcementId: string) =>
      v1Delete<V1DeleteAnnouncementResult>(
        `/admin/announcements/${announcementId}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTournamentAnnouncements(tournamentId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTournament(tournamentId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.tournament(tournamentId) });
    },
  });
}

export function useV1SendTeamInvitation(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { invitedEmail: string; message?: string }) =>
      v1Post<V1SendInvitationResult>(`/teams/${teamId}/invitations`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.teamInvitations(teamId) });
    },
  });
}

/** GET /teams/:teamId/invitations — 팀이 보낸 pending 초대 목록 */
export function useV1TeamInvitations(teamId: string, options?: QueryOptions) {
  return useQuery({
    queryKey: v1Keys.teamInvitations(teamId),
    queryFn: () => v1Get<V1TeamInvitationsPage>(`/teams/${teamId}/invitations`),
    enabled: Boolean(teamId) && (options?.enabled ?? true),
  });
}

/** POST /teams/:teamId/invitations/:invitationId/cancel — 보낸 초대 취소 */
export function useV1CancelTeamInvitation(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ invitationId }: { invitationId: string }) =>
      v1Post<V1InvitationActionResult>(`/teams/${teamId}/invitations/${invitationId}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.teamInvitations(teamId) });
    },
  });
}

/** GET /me/invitations — 내가 받은 pending 초대 목록 */
export function useV1ReceivedInvitations() {
  return useQuery({
    queryKey: v1Keys.receivedInvitations(),
    queryFn: () => v1Get<V1ReceivedInvitationsPage>('/me/invitations'),
  });
}

/** POST /team-invitations/:invitationId/accept — 받은 초대 수락 */
export function useV1AcceptTeamInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ invitationId }: { invitationId: string }) =>
      v1Post<V1InvitationActionResult>(`/team-invitations/${invitationId}/accept`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.receivedInvitations() });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.all, 'me', 'teams'] });
      queryClient.invalidateQueries({ queryKey: v1Keys.teams() });
    },
  });
}

/** POST /team-invitations/:invitationId/decline — 받은 초대 거절 */
export function useV1DeclineTeamInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ invitationId }: { invitationId: string }) =>
      v1Post<V1InvitationActionResult>(`/team-invitations/${invitationId}/decline`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.receivedInvitations() });
    },
  });
}
