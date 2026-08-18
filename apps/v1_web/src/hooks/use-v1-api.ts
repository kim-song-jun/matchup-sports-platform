'use client';

import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { v1Api, v1Delete, v1Get, v1MultipartPost, v1Patch, v1Post, v1Put, V1ApiError } from '@/lib/api-client';
import { trackEvent } from '@/lib/analytics';
import { compressImagesForUpload } from '@/lib/image-compress';
import { PUBLIC_LIVE_POLL_INTERVAL_MS } from '@/lib/public-live-polling';
import { v1Keys } from '@/lib/query-keys';
import { randomUuid } from '@/lib/uuid';
import type { GameLineup, GameLineupState } from '@/types/game-operations';
import type {
  V1AdminRosterEligibleMembersResponse,
  AdminListFilters,
  AdminCursorPage,
  CursorPage,
  V1AdminGrantResult,
  V1AdminInquiryDetail,
  V1AdminInquiryPendingCount,
  V1AdminInquiryReplyPayload,
  V1AdminInquiryRow,
  V1AdminInquiryStatusPayload,
  V1AdminLog,
  V1AdminContentAsset,
  V1AdminPopupCreatePayload,
  V1AdminPopupCreateResult,
  V1AdminPopupDeleteResult,
  V1AdminPopupDetailResult,
  V1AdminPopupRow,
  V1AdminPopupUpdatePayload,
  V1AdminPopupUpdateResult,
  V1ActivePopupResponse,
  V1AdminNoticeCreatePayload,
  V1AdminNoticeCreateResult,
  V1AdminNoticeDeleteResult,
  V1AdminNoticeDetailResult,
  V1AdminNoticeRow,
  V1AdminNoticeUpdatePayload,
  V1AdminNoticeUpdateResult,
  V1AdminTermsListResult,
  V1AdminTermsPolicy,
  V1AdminTermsPolicyCreatePayload,
  V1AdminTermsPolicyUpdatePayload,
  V1AdminTermsStatusPayload,
  V1AdminTermsVersionPayload,
  V1AdminRow,
  V1PushFailureSummary,
  V1FoundAccount,
  V1SmsFailureSummary,
  V1AdminOpsSummary,
  V1AdminErrorLogsPage,
  V1AdminErrorLogDetail,
  V1AdminErrorLogFilters,
  V1AdminPushSendPayload,
  V1AdminPushSendResult,
  V1GameOperationFlag,
  V1GameOperationFlagKey,
  V1SimplifiedOperationFlagGateStatus,
  V1SimplifiedOperationFlagTogglePayload,
  V1SetSimplifiedOperationFlagGatePayload,
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
  V1CurrentSignupTerms,
  V1CurrentTerms,
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
  V1MyJoinApplicationsPage,
  V1RecentVenue,
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
  V1PopupTargetScreen,
  V1PublicProfile,
  V1Region,
  V1ResolveLocationResponse,
  V1RecentSearch,
  V1RecentSearchesResponse,
  V1ReviewListResponse,
  V1ReviewReceivedResponse,
  V1ReviewReceivedSummaryResponse,
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
  V1TeamMatchLineup,
  V1TeamMatchLineupChangeRequestResult,
  V1TeamMatchLineupSavePayload,
  V1TeamMatchLineupSaveResult,
  V1TeamMatchLineupSubmitResult,
  V1TeamMatchMutationPayload,
  V1TeamMatchMutationResult,
  V1TeamMatchUpdatePayload,
  V1Game,
  V1GameResultRevision,
  V1CreateGameResultRevisionPayload,
  V1SubmitGameResultRevisionPayload,
  V1DecideGameResultRevisionPayload,
  V1GameRevisionMutationResult,
  V1TeamMutationPayload,
  V1TeamMutationResult,
  V1TeamUpdatePayload,
  V1TeamSchedulesPage,
  V1TeamScheduleDetail,
  V1TeamScheduleMutationResult,
  V1CreateScheduleDto,
  V1UpdateScheduleDto,
  V1CancelScheduleDto,
  V1CancelScheduleResult,
  V1CompleteScheduleResult,
  V1TriggerScheduleReminderDto,
  V1TriggerScheduleReminderResult,
  V1SetScheduleAttendanceDto,
  V1SetScheduleAttendanceResult,
  V1CreateGuestRecruitmentDto,
  V1UpdateGuestRecruitmentDto,
  V1GuestRecruitmentMutationResult,
  V1CreateGuestApplicationDto,
  V1GuestApplicationResult,
  V1MySchedulePage,
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
  V1AdminTournamentRosterResponse,
  V1TournamentPlayer,
  V1AdminTournamentListPage,
  V1AdminRegistrationListPage,
  V1AdminTournamentRegistration,
  V1AdminTournamentRegistrationWithIdempotent,
  V1AdminTournamentBracket,
  V1AdminBracketGroup,
  V1AdminBracketGroupTeam,
  V1AdminBracketFixture,
  V1AdminTournamentAnnouncement,
  V1AdminTournamentAnnouncementWithIdempotent,
  V1AdminTournamentSponsor,
  V1AdminTournamentSponsorListResult,
  V1AdminTournamentPopup,
  V1AdminTournamentPopupListResult,
  V1CreateTournamentPopupPayload,
  V1UpdateTournamentPopupPayload,
  V1DeleteTournamentPopupResult,
  V1AdminTournamentStatusChangeResult,
  V1PublishBracketResult,
  V1UnpublishBracketResult,
  V1StandingsRecalculateResult,
  V1ExportRosterCsvResult,
  V1Tournament,
  V1CreateTournamentPayload,
  V1UpdateTournamentPayload,
  V1LineupSizeOptions,
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
  V1IntegrationSettings,
  V1UpdateIntegrationSettingsPayload,
  V1ReviewPolicySettings,
  V1UpdateReviewPolicySettingsPayload,
  V1PublicKakaoMapsKeyResponse,
  V1TournamentOperationsBoardFilters,
  V1TournamentOperationsBoardPage,
  V1TournamentStaffListResponse,
  V1TournamentStaffCandidateSearchResponse,
  V1TournamentStaffAssignment,
  V1GrantTournamentStaffPayload,
  V1RevokeTournamentStaffPayload,
  V1MyTournamentStaffResponse,
  V1TournamentField,
  V1TournamentFieldListResponse,
  V1TournamentFixtureFieldResult,
  V1CreateTournamentFieldPayload,
} from '@/types/api';

type ListFilters = Record<string, string | number | boolean | null | undefined>;
type QueryOptions = { enabled?: boolean };

export function useV1AuthMe(options?: {
  enabled?: boolean;
  // 함수형 retry를 허용한다 — 세션 확인은 4xx면 즉시 포기하고 5xx는 재시도해야 해서
  // boolean 하나로는 두 정책을 같이 표현할 수 없다(retryTransientFailure 참고).
  retry?: boolean | number | ((failureCount: number, error: Error) => boolean);
}) {
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
    // Mutation callbacks run before the component callback that stores the
    // local session hint. Refetching here can send /auth/me without headers
    // and cache a 401 that immediately ejects the newly-created session.
    onSuccess: (result) => queryClient.setQueryData<V1AuthMe>(v1Keys.authMe(), result),
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
      realName?: string;
      displayName?: string;
      phone: string;
      birthDate: string;
      profileImageUrl?: string;
      requiredTermsAccepted: boolean;
      acceptedTermsDocumentIds: string[];
      phoneProofToken?: string;
    }) =>
      v1Post<V1AuthSessionResponse>('/auth/register', body),
    onSuccess: (result) => queryClient.setQueryData<V1AuthMe>(v1Keys.authMe(), result),
  });
}

export function useV1CompleteSocialProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      nickname: string;
      gender: 'male' | 'female';
      realName?: string;
      displayName?: string;
      phone: string;
      birthDate: string;
      profileImageUrl?: string;
    }) =>
      v1Post<V1AuthSessionResponse & { next: { route: string } }>('/auth/social-profile', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: v1Keys.authMe() }),
  });
}

export function useV1CompleteSocialTerms() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { requiredTermsAccepted: boolean; acceptedTermsDocumentIds: string[] }) =>
      v1Post<V1AuthSessionResponse & { next: { route: string } }>('/auth/social-terms', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: v1Keys.authMe() }),
  });
}

export function useV1PhoneIssue() {
  return useMutation({
    mutationFn: (body: { phone: string }) =>
      v1Post<{ expiresAt: string; devCode?: string }>('/auth/phone/issue', body),
  });
}

export function useV1PhoneVerify() {
  return useMutation({
    // purpose 를 생략하면 가입용 토큰이 발급된다. 계정 찾기·비밀번호 재설정은
    // 'password_reset' 을 넘겨 가입용 증명과 섞이지 않게 한다.
    mutationFn: (body: { phone: string; code: string; purpose?: 'signup' | 'password_reset' }) =>
      v1Post<{ verified: boolean; proofToken?: string }>('/auth/phone/verify', body),
  });
}

export function useV1FindAccountByPhone() {
  return useMutation({
    mutationFn: (body: { phone: string; proofToken: string }) =>
      v1Post<V1FoundAccount>('/auth/recovery/find-account', body),
  });
}

export function useV1ResetPasswordByPhone() {
  return useMutation({
    mutationFn: (body: { phone: string; proofToken: string; newPassword: string }) =>
      v1Post<{ ok: true }>('/auth/recovery/reset-password', body),
  });
}

/**
 * 비로그인 이메일 OTP — 비밀번호 재설정 전용. 로그인 후 이메일 인증(/verification/email/*)은
 * 인증 가드 뒤라 여기 쓸 수 없어 공개 엔드포인트가 따로 있다.
 *
 * 응답은 가입 여부를 드러내지 않는다(계정 열거 방어) — 화면도 "가입된 주소면 보냈다"는 식으로만
 * 안내하고, 없는 계정을 드러내는 문구를 쓰지 않는다. devCode 는 실발송 수단이 하나도 없는
 * 개발/CI 환경(dev-echo)에서만, 그것도 메일을 실제로 보낸 경우에만 붙는다.
 */
export function useV1RecoveryEmailIssue() {
  return useMutation({
    mutationFn: (body: { email: string }) =>
      v1Post<{ sent: true; expiresAt: string; devCode?: string }>('/auth/recovery/email/request', body),
  });
}

export function useV1RecoveryEmailVerify() {
  return useMutation({
    // 용도(purpose)를 보내지 않는다 — 이 경로가 발급하는 증명은 서버가 재설정용으로 고정한다.
    mutationFn: (body: { email: string; code: string }) =>
      v1Post<{ verified: boolean; proofToken?: string }>('/auth/recovery/email/confirm', body),
  });
}

export function useV1ResetPasswordByEmail() {
  return useMutation({
    mutationFn: (body: { email: string; proofToken: string; newPassword: string }) =>
      v1Post<{ ok: true }>('/auth/recovery/email/reset-password', body),
  });
}

export function useV1AuthedPhoneRequest() {
  return useMutation({
    mutationFn: (body: { phone: string }) =>
      v1Post<{ sent: boolean; channel: 'phone'; target?: string; alreadyVerified?: boolean; expiresAt?: string; devCode?: string }>(
        '/verification/phone/request',
        body,
      ),
  });
}

export function useV1AuthedPhoneConfirm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { code: string }) =>
      v1Post<{ verified: boolean; verification: { emailVerified: boolean; phoneVerified: boolean } }>(
        '/verification/phone/confirm',
        body,
      ),
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
    mutationFn: (body: {
      latitude: number;
      longitude: number;
      locationConsentAccepted: true;
    }) =>
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

export function useV1ActivePopup(screen: V1PopupTargetScreen | null) {
  return useQuery({
    queryKey: v1Keys.activePopup(screen),
    queryFn: () => v1Get<V1ActivePopupResponse>('/popups/active', { screen: screen ?? undefined }),
    enabled: Boolean(screen),
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

/**
 * #3 1단계: 개인 매치 위저드의 장소 입력창 포커스 시 보여줄 최근 사용 장소 칩.
 * 로그인 사용자만 호출 가능(서버가 hostUserId=현재 사용자로 조회) — 위저드는 항상
 * 로그인 상태에서만 진입하므로 별도 enabled 게이트가 필요 없다.
 */
export function useV1MyRecentVenues() {
  return useQuery({
    queryKey: v1Keys.myRecentVenues(),
    queryFn: () => v1Get<{ items: V1RecentVenue[] }>('/matches/me/recent-venues'),
    staleTime: 60_000,
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

/**
 * queryFn 응답 shape을 검증한다. 서버가 malformed/undefined 페이지를 반환하면(네트워크 파싱
 * 실패 등) "신청자 0명"으로 조용히 뭉개지 않고 에러를 던져 react-query의 isError 경로로
 * 넘긴다 — 목록 화면(client.tsx)이 이미 `applicationsQuery.isError`에서 "신청 목록을
 * 불러오지 못했어요" 에러 상태를 렌더링하므로, 실패를 빈 상태로 위장하지 않고 그대로 노출한다.
 */
function assertValidMatchApplicationsPage(
  page: V1MatchApplicationsPage | undefined | null,
): V1MatchApplicationsPage {
  if (!page || !Array.isArray(page.items) || !page.pageInfo) {
    throw new Error('Malformed match applications page response');
  }
  return page;
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
      }).then(assertValidMatchApplicationsPage),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage?.pageInfo?.hasNext ? lastPage.pageInfo.nextCursor : undefined,
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

/**
 * #3 1단계: 팀매치 위저드의 장소 입력창 포커스 시 보여줄, 이 팀이 호스트로 과거에
 * 실제로 입력했던 장소 칩. team 스텝에서 팀을 고르기 전에는 teamId가 비어 있어
 * enabled=false로 대기한다.
 */
export function useV1TeamRecentVenues(teamId: string) {
  return useQuery({
    queryKey: v1Keys.teamRecentVenues(teamId),
    queryFn: () => v1Get<{ items: V1RecentVenue[] }>(`/teams/${teamId}/recent-venues`),
    enabled: Boolean(teamId),
    staleTime: 60_000,
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

/**
 * 가입 신청/철회 후 다시 읽어야 하는 쿼리들.
 *
 * `invalidateQueries`의 프라미스를 **await**하는 것이 핵심이다. React Query는
 * onSuccess가 resolve될 때까지 `isPending`을 유지하므로, 버튼이 "처리 중"에서
 * 풀리는 시점엔 이미 새 상태가 캐시에 들어와 있다. await하지 않으면 버튼만 먼저
 * 활성화되고 라벨·배지는 한 박자 뒤에 바뀌어 "상태가 안 바뀐다"로 보인다.
 */
async function refetchTeamJoinState(queryClient: QueryClient, teamId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: v1Keys.team(teamId) }),
    queryClient.invalidateQueries({ queryKey: v1Keys.teams() }),
    queryClient.invalidateQueries({ queryKey: v1Keys.myJoinApplications() }),
  ]);
}

export function useV1CreateTeamJoinApplication(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body?: { message?: string | null }) =>
      v1Post<V1TeamJoinApplicationResult>(`/teams/${teamId}/join-applications`, body ?? {}),
    onSuccess: () => refetchTeamJoinState(queryClient, teamId),
  });
}

/** GET /me/join-applications — 내가 보낸 가입 신청 목록(승인 대기 + 최근 처리 결과) */
export function useV1MyJoinApplications() {
  return useQuery({
    queryKey: v1Keys.myJoinApplications(),
    queryFn: () => v1Get<V1MyJoinApplicationsPage>('/me/join-applications'),
  });
}

/**
 * 신청 현황 목록에서의 신청 취소.
 *
 * 팀 상세용 `useV1WithdrawTeamJoinApplication`은 teamId·applicationId를 훅 인자로 받아
 * 한 팀에 고정된다. 목록은 여러 팀의 신청을 한 화면에서 다루므로 대상 식별자를
 * mutate 인자로 받는 훅이 따로 필요하다.
 */
export function useV1WithdrawMyJoinApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ applicationId, reason }: { applicationId: string; teamId: string; reason?: string | null }) =>
      v1Post<V1TeamJoinApplicationResult>(`/team-join-applications/${applicationId}/withdraw`, {
        reason: reason ?? null,
      }),
    onSuccess: (_result, variables) => refetchTeamJoinState(queryClient, variables.teamId),
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
    onSuccess: () => refetchTeamJoinState(queryClient, teamId),
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

// 본인이 스스로 팀을 나가는 self-service 경로. removeMembership(관리자가 타인을 강제 추방)과
// 별도 엔드포인트 — /teams/:teamId/leave (V1AuthGuard만, membershipId 불필요).
export function useV1LeaveTeam(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body?: { reason?: string | null }) =>
      v1Post<V1TeamMembershipMutationResult>(`/teams/${teamId}/leave`, body ?? {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.team(teamId) });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.team(teamId), 'members'] });
      queryClient.invalidateQueries({ queryKey: v1Keys.teams() });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.all, 'me', 'teams'] });
    },
  });
}

// ── Team schedules (Task 12 backend / Task 13 frontend) ──────────────────────
// 프론트엔드에서 Idempotency-Key 를 보내는 첫 도메인 — 모든 스케줄 mutation은 얼어붙은
// REST 계약(글로벌 계약 문서)에 따라 매 호출마다 새 키가 필요하다. 자동 재시도(react-query
// mutation retry)를 켜지 않는 한 "한 번의 mutate() 호출 = 한 번의 사용자 의도 = 새 키"가
// 안전한 기본값이다.
function idempotencyInit(): RequestInit {
  return { headers: { 'Idempotency-Key': randomUuid() } };
}

export function useV1TeamSchedules(teamId: string, filters?: ListFilters, options?: QueryOptions) {
  return useQuery({
    queryKey: v1Keys.teamSchedules(teamId, filters),
    queryFn: () => v1Get<V1TeamSchedulesPage>(`/teams/${teamId}/schedules`, filters),
    enabled: Boolean(teamId) && (options?.enabled ?? true),
    // 빠른 필터 전환(종류/상태 칩)에서 화면이 매번 깜빡이지 않도록 이전 페이지 데이터를
    // 유지한 채 새 쿼리를 백그라운드에서 가져온다.
    placeholderData: keepPreviousData,
  });
}

export function useV1TeamSchedule(teamId: string, scheduleId: string, options?: QueryOptions) {
  return useQuery({
    queryKey: v1Keys.teamSchedule(teamId, scheduleId),
    queryFn: () => v1Get<V1TeamScheduleDetail>(`/teams/${teamId}/schedules/${scheduleId}`),
    enabled: Boolean(teamId) && Boolean(scheduleId) && (options?.enabled ?? true),
  });
}

export function useV1CreateTeamSchedule(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1CreateScheduleDto) =>
      v1Post<V1TeamScheduleMutationResult>(`/teams/${teamId}/schedules`, body, idempotencyInit()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...v1Keys.team(teamId), 'schedules'] });
    },
  });
}

export function useV1UpdateTeamSchedule(teamId: string, scheduleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1UpdateScheduleDto) =>
      v1Patch<V1TeamScheduleMutationResult>(`/teams/${teamId}/schedules/${scheduleId}`, body, idempotencyInit()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.teamSchedule(teamId, scheduleId) });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.team(teamId), 'schedules'] });
    },
  });
}

export function useV1CancelTeamSchedule(teamId: string, scheduleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1CancelScheduleDto) =>
      v1Post<V1CancelScheduleResult>(`/teams/${teamId}/schedules/${scheduleId}/cancel`, body, idempotencyInit()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.teamSchedule(teamId, scheduleId) });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.team(teamId), 'schedules'] });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.all, 'me', 'schedule'] });
    },
  });
}

export function useV1CompleteTeamSchedule(teamId: string, scheduleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { expectedVersion: number }) =>
      v1Post<V1CompleteScheduleResult>(`/teams/${teamId}/schedules/${scheduleId}/complete`, body, idempotencyInit()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.teamSchedule(teamId, scheduleId) });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.team(teamId), 'schedules'] });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.all, 'me', 'schedule'] });
    },
  });
}

export function useV1TriggerScheduleReminder(teamId: string, scheduleId: string) {
  return useMutation({
    mutationFn: (body: V1TriggerScheduleReminderDto) =>
      v1Post<V1TriggerScheduleReminderResult>(
        `/teams/${teamId}/schedules/${scheduleId}/reminders`,
        body,
        idempotencyInit(),
      ),
  });
}

export function useV1SetMyScheduleAttendance(teamId: string, scheduleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1SetScheduleAttendanceDto) =>
      v1Put<V1SetScheduleAttendanceResult>(
        `/teams/${teamId}/schedules/${scheduleId}/attendance/me`,
        body,
        idempotencyInit(),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.teamSchedule(teamId, scheduleId) });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.team(teamId), 'schedules'] });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.all, 'me', 'schedule'] });
    },
  });
}

export function useV1CreateGuestRecruitment(teamId: string, scheduleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1CreateGuestRecruitmentDto) =>
      v1Post<V1GuestRecruitmentMutationResult>(
        `/teams/${teamId}/schedules/${scheduleId}/guest-recruitment`,
        body,
        idempotencyInit(),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: v1Keys.teamSchedule(teamId, scheduleId) }),
  });
}

export function useV1UpdateGuestRecruitment(teamId: string, scheduleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1UpdateGuestRecruitmentDto) =>
      v1Patch<V1GuestRecruitmentMutationResult>(
        `/teams/${teamId}/schedules/${scheduleId}/guest-recruitment`,
        body,
        idempotencyInit(),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: v1Keys.teamSchedule(teamId, scheduleId) }),
  });
}

export function useV1ApplyGuestRecruitment(teamId: string, scheduleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1CreateGuestApplicationDto) =>
      v1Post<V1GuestApplicationResult>(
        `/teams/${teamId}/schedules/${scheduleId}/guest-recruitment/applications`,
        body,
        idempotencyInit(),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: v1Keys.teamSchedule(teamId, scheduleId) }),
  });
}

export function useV1MySchedule(filters?: ListFilters) {
  return useQuery({
    queryKey: v1Keys.mySchedule(filters),
    queryFn: () => v1Get<V1MySchedulePage>('/me/schedule', filters),
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

// ─── Task 17: Game/result-revision + team-match lineup (result entry/approval) ───

// 새 Idempotency-Key(v4 UUID)를 만들고, games.md의 고정 계약대로 헤더와 바디의
// clientCommandId를 항상 같은 값으로 묶는다 — 둘 중 하나만 다르면 서버가
// 422 COMMAND_IDEMPOTENCY_KEY_MISMATCH로 거부한다.
function withGameCommandId<T extends object>(body: T) {
  const clientCommandId = randomUuid();
  return { clientCommandId, body: { ...body, clientCommandId }, headers: { 'idempotency-key': clientCommandId } };
}

export function useV1Game(gameId: string | null | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: v1Keys.game(gameId ?? ''),
    queryFn: () => v1Get<V1Game>(`/games/${gameId}`),
    enabled: Boolean(gameId) && (options?.enabled ?? true),
  });
}

export function useV1GameResultRevisions(gameId: string | null | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: v1Keys.gameResultRevisions(gameId ?? ''),
    queryFn: () => v1Get<V1GameResultRevision[]>(`/games/${gameId}/result-revisions`),
    enabled: Boolean(gameId) && (options?.enabled ?? true),
  });
}

// ── 팀 매치 라인업 (Task 15) ──
// GET은 호출자 소속 팀(내 팀) 쪽 사이드만 돌려준다 — 403/404는 재시도해도 같은 답이므로
// retry: false (V1CheckEmail 등 다른 read 계열과 동일 컨벤션). 호출자 본인 팀(호스트 또는
// 승인된 상대팀) 라인업만 반환된다 — Task 14 계약상 own-side 전용 라우트다.
export function useV1TeamMatchLineup(teamMatchId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...v1Keys.teamMatch(teamMatchId), 'lineup'] as const,
    queryFn: () => v1Get<V1TeamMatchLineup>(`/team-matches/${teamMatchId}/lineup`),
    enabled: Boolean(teamMatchId) && (options?.enabled ?? true),
    retry: false,
  });
}

export function useV1CreateGameResultRevision(gameId: string, teamMatchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: V1CreateGameResultRevisionPayload) => {
      const { body, headers } = withGameCommandId(input);
      return v1Post<V1GameRevisionMutationResult>(`/games/${gameId}/result-revisions`, body, { headers });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.gameResultRevisions(gameId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.game(gameId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.teamMatch(teamMatchId) });
    },
  });
}

export function useV1SaveTeamMatchLineup(teamMatchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { idempotencyKey: string; payload: V1TeamMatchLineupSavePayload }) =>
      v1Put<V1TeamMatchLineupSaveResult>(`/team-matches/${teamMatchId}/lineup`, vars.payload, {
        headers: { 'Idempotency-Key': vars.idempotencyKey },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...v1Keys.teamMatch(teamMatchId), 'lineup'] });
    },
  });
}

// ── 대회 경기(tournament fixture) 라인업 — 참가팀 자기 서비스 ──
// team-match와 달리 범용 games 라우트(/games/:gameId/lineups/*)를 그대로 쓴다 —
// resolveActor의 TOURNAMENT_FIXTURE 팀 액터 분기(games.service.ts)가 참가팀
// owner/manager만 자기 사이드에 read/write 하도록 이미 인가를 강제한다.

export type V1FixtureLineupAccess = {
  gameId: string;
  mySideId: string | null;
  isStaff: boolean;
  scheduledAt: string | null;
  homeSideId: string | null;
  homeTeamName: string | null;
  homeRegistrationId: string | null;
  /** 팀 스코프 자산(이전 라인업 히스토리·프리셋)을 부를 때 쓴다. */
  homeTeamId: string | null;
  awaySideId: string | null;
  awayTeamName: string | null;
  awayRegistrationId: string | null;
  awayTeamId: string | null;
};

export function useV1FixtureLineupAccess(tournamentId: string, fixtureId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: v1Keys.fixtureLineupAccess(tournamentId, fixtureId),
    queryFn: () => v1Get<V1FixtureLineupAccess>(`/tournaments/${tournamentId}/fixtures/${fixtureId}/lineup-access`),
    enabled: Boolean(tournamentId) && Boolean(fixtureId) && (options?.enabled ?? true),
    retry: false,
  });
}

/** 라인업 편집기가 쓰는 참가 등록 명단 — 대회 경기 라인업 선수의 유일한 출처. */
export type V1FixtureLineupRoster = {
  sideId: string;
  registrationId: string;
  players: Array<{ tournamentPlayerId: string; userId: string; name: string }>;
};

export function useV1FixtureLineupRoster(
  tournamentId: string,
  fixtureId: string,
  sideId: string | null,
) {
  return useQuery({
    queryKey: v1Keys.fixtureLineupRoster(tournamentId, fixtureId, sideId ?? ''),
    queryFn: () =>
      v1Get<V1FixtureLineupRoster>(
        `/tournaments/${tournamentId}/fixtures/${fixtureId}/lineup-roster?sideId=${encodeURIComponent(sideId ?? '')}`,
      ),
    enabled: Boolean(tournamentId) && Boolean(fixtureId) && Boolean(sideId),
    retry: false,
    // 편집 세션 동안 명단을 고정한다. 전역 기본값은 refetchOnWindowFocus: true(providers.tsx)인데,
    // 라인업 화면은 이 명단으로 **한 번만** 상태를 수화하고 이후 그 상태를 편집한다 — 창을 잠깐
    // 벗어난 사이 명단이 갱신되면 화면(로스터 기준으로 그린다)과 저장 대상(수화된 상태) 이 갈라져,
    // 목록에서 사라진 선수가 저장 페이로드에는 그대로 실린다(등록 명단이 SSOT라는 이 화면의 전제가
    // 조용히 깨진다). 명단을 고쳤다면 화면을 다시 여는 것이 맞다(Copilot 리뷰 지적).
    refetchOnWindowFocus: false,
  });
}

/** 불러오기 시트가 쓰는 한 명분 엔트리 — 히스토리와 프리셋이 같은 모양을 쓴다. */
export type V1LineupSourceEntry = {
  userId: string | null;
  displayName: string;
  jerseyNumber: number | null;
  position: string | null;
  positionX: number | null;
  positionY: number | null;
  started: boolean;
  goalkeeper: boolean;
};

/** 우리 팀이 과거에 낸 라인업 한 건(대회·팀 매치 교차). */
export type V1TeamLineupHistoryItem = {
  lineupId: string;
  gameId: string;
  source: 'TOURNAMENT_FIXTURE' | 'TEAM_MATCH';
  sourceLabel: string;
  opponentName: string | null;
  playedAt: string | null;
  sportName: string | null;
  formation: string | null;
  starterCount: number;
  benchCount: number;
  participants: V1LineupSourceEntry[];
};

export function useV1TeamLineupHistory(teamId: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: v1Keys.teamLineupHistory(teamId ?? ''),
    queryFn: () => v1Get<{ items: V1TeamLineupHistoryItem[] }>(`/teams/${teamId}/lineup-history`),
    enabled: Boolean(teamId) && (options?.enabled ?? true),
    retry: false,
  });
}

export type V1TeamLineupPreset = {
  presetId: string;
  name: string;
  formation: string | null;
  sportName: string | null;
  updatedAt: string;
  starterCount: number;
  benchCount: number;
  entries: V1LineupSourceEntry[];
};

export type V1SaveLineupPresetPayload = {
  name: string;
  formation?: string;
  sportName?: string;
  entries: Array<{
    userId?: string;
    displayName: string;
    jerseyNumber?: number;
    position?: string;
    positionX?: number;
    positionY?: number;
    started: boolean;
    goalkeeper?: boolean;
  }>;
};

export function useV1TeamLineupPresets(teamId: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: v1Keys.teamLineupPresets(teamId ?? ''),
    queryFn: () => v1Get<{ items: V1TeamLineupPreset[] }>(`/teams/${teamId}/lineup-presets`),
    enabled: Boolean(teamId) && (options?.enabled ?? true),
    retry: false,
  });
}

export function useV1CreateLineupPreset(teamId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1SaveLineupPresetPayload) =>
      v1Post<V1TeamLineupPreset>(`/teams/${teamId}/lineup-presets`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: v1Keys.teamLineupPresets(teamId ?? '') });
    },
  });
}

export function useV1UpdateLineupPreset(teamId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ presetId, body }: { presetId: string; body: Partial<V1SaveLineupPresetPayload> }) =>
      v1Patch<V1TeamLineupPreset>(`/teams/${teamId}/lineup-presets/${presetId}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: v1Keys.teamLineupPresets(teamId ?? '') });
    },
  });
}

export function useV1DeleteLineupPreset(teamId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (presetId: string) =>
      v1Delete<{ deleted: boolean }>(`/teams/${teamId}/lineup-presets/${presetId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: v1Keys.teamLineupPresets(teamId ?? '') });
    },
  });
}

/** 아직 라인업을 넣지 않은 다가오는 경기 — 홈·마이 페이지의 "할 일" 카드가 쓴다. */
export type V1LineupTodo = {
  source: 'TOURNAMENT_FIXTURE' | 'TEAM_MATCH';
  teamId: string;
  teamName: string;
  gameId: string;
  tournamentId: string | null;
  tournamentTitle: string | null;
  title: string;
  opponentName: string | null;
  scheduledAt: string | null;
  state: 'MISSING' | 'DRAFT';
  deepLink: string;
};

export function useV1LineupTodos(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: v1Keys.lineupTodos(),
    queryFn: () => v1Get<{ items: V1LineupTodo[] }>('/me/lineup-todos'),
    enabled: options?.enabled ?? true,
    retry: false,
  });
}

export function useV1ChangeMembershipJersey(teamId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ membershipId, jerseyNumber }: { membershipId: string; jerseyNumber: number | null }) =>
      v1Patch<{ membershipId: string; teamId: string; jerseyNumber: number | null }>(
        `/team-memberships/${membershipId}/jersey`,
        { jerseyNumber },
      ),
    onSuccess: () => {
      // useV1TeamMembers는 filters까지 키에 포함하므로 정확히 같은 배열을 만들 수 없다 —
      // 팀 하위 전체를 무효화해 어떤 필터 조합으로 캐시된 목록이든 새 등번호를 받게 한다.
      void queryClient.invalidateQueries({ queryKey: v1Keys.team(teamId ?? '') });
    },
  });
}

/** 대회 일정 화면이 "내 팀 경기"를 짚어주기 위한 인증 전용 조회. */
export type V1MyTournamentFixture = {
  fixtureId: string;
  gameId: string | null;
  sideId: string | null;
  round: string;
  legNumber: number;
  groupName: string | null;
  scheduledAt: string | null;
  status: string;
  isHome: boolean;
  opponentTeamName: string | null;
  lineupState: GameLineupState | null;
};

export type V1MyTournamentFixtures = {
  teams: Array<{
    registrationId: string;
    teamId: string;
    teamName: string;
    fixtures: V1MyTournamentFixture[];
  }>;
};

export function useV1MyTournamentFixtures(tournamentId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: v1Keys.myTournamentFixtures(tournamentId),
    queryFn: () => v1Get<V1MyTournamentFixtures>(`/tournaments/${tournamentId}/my-fixtures`),
    enabled: Boolean(tournamentId) && (options?.enabled ?? true),
    // 비로그인 방문자에게는 401이 정상이다 — 재시도하지 않고 조용히 없는 것으로 둔다.
    retry: false,
  });
}

export function useV1GameLineups(gameId: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: v1Keys.gameLineups(gameId ?? ''),
    queryFn: () => v1Get<GameLineup[]>(`/games/${gameId}/lineups`),
    enabled: Boolean(gameId) && (options?.enabled ?? true),
    retry: false,
  });
}

export type V1SaveGameLineupPayload = {
  expectedVersion: number;
  formation?: string;
  participants: Array<{
    /**
     * 등록 명단의 사용자 — 다시 열 때 이름이 아니라 이 값으로 명단과 대조한다.
     * 이 값이 실리면 백엔드가 같은 트랜잭션에서 ROSTER_ASSERTED 신원 연결을 만들어
     * 이 사용자의 개인 기록(활동 기록)에 반영한다(games.service.ts saveLineup).
     */
    userId?: string;
    displayNameSnapshot: string;
    jerseyNumber?: number;
    position?: string;
    positionX?: number;
    positionY?: number;
    started: boolean;
  }>;
};

export type V1GameLineupMutationResult = {
  gameId: string;
  lineupId: string;
  lineupRevision: number;
  state: string;
  version: number;
};

export function useV1SaveGameLineup(gameId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { sideId: string; payload: V1SaveGameLineupPayload }) => {
      const { body, headers } = withGameCommandId(vars.payload);
      return v1Put<V1GameLineupMutationResult>(`/games/${gameId}/lineups/${vars.sideId}`, body, { headers });
    },
    onSuccess: () => {
      if (gameId) queryClient.invalidateQueries({ queryKey: v1Keys.gameLineups(gameId) });
    },
  });
}

export function useV1SubmitGameLineup(gameId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { lineupId: string; expectedVersion: number }) => {
      const { body, headers } = withGameCommandId({ expectedVersion: vars.expectedVersion });
      return v1Post<V1GameLineupMutationResult & { lineupState: string }>(
        `/games/${gameId}/lineups/${vars.lineupId}/submit`,
        body,
        { headers },
      );
    },
    onSuccess: () => {
      if (gameId) queryClient.invalidateQueries({ queryKey: v1Keys.gameLineups(gameId) });
    },
  });
}

export function useV1SubmitGameResultRevision(gameId: string, teamMatchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ revisionId, ...input }: V1SubmitGameResultRevisionPayload & { revisionId: string }) => {
      const { body, headers } = withGameCommandId(input);
      return v1Post<V1GameRevisionMutationResult>(
        `/games/${gameId}/result-revisions/${revisionId}/submit`,
        body,
        { headers },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.gameResultRevisions(gameId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.game(gameId) });
      // 제출은 같은 트랜잭션에서 TeamMatch를 completed로 전이시키므로 상세도 함께 갱신한다.
      queryClient.invalidateQueries({ queryKey: v1Keys.teamMatch(teamMatchId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.teamMatches() });
    },
  });
}

export function useV1SubmitTeamMatchLineup(teamMatchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { idempotencyKey: string; expectedVersion: number }) =>
      v1Post<V1TeamMatchLineupSubmitResult>(
        `/team-matches/${teamMatchId}/lineup/submit`,
        { expectedVersion: vars.expectedVersion },
        { headers: { 'Idempotency-Key': vars.idempotencyKey } },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...v1Keys.teamMatch(teamMatchId), 'lineup'] });
    },
  });
}

export function useV1DecideGameResultRevision(gameId: string, teamMatchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ revisionId, ...input }: V1DecideGameResultRevisionPayload & { revisionId: string }) => {
      const { body, headers } = withGameCommandId(input);
      return v1Post<V1GameRevisionMutationResult>(
        `/games/${gameId}/result-revisions/${revisionId}/decision`,
        body,
        { headers },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.gameResultRevisions(gameId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.game(gameId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.teamMatch(teamMatchId) });
    },
  });
}

// 상대팀 라인업을 재작성(초안화)하라고 요청한다 — 대상은 항상 "내가 아닌 쪽" 사이드이며,
// 그 사이드를 조회하는 API가 없어 내용은 볼 수 없고 사유만 남길 수 있는 blind 액션이다
// (lineup-client.tsx의 안내 문구 참고). 성공해도 내 사이드 쿼리는 바뀌지 않으므로 invalidate하지 않는다.
export function useV1RequestTeamMatchLineupChange(teamMatchId: string) {
  return useMutation({
    mutationFn: (vars: { idempotencyKey: string; expectedVersion: number; reason: string }) =>
      v1Post<V1TeamMatchLineupChangeRequestResult>(
        `/team-matches/${teamMatchId}/lineup/change-request`,
        { expectedVersion: vars.expectedVersion, reason: vars.reason },
        { headers: { 'Idempotency-Key': vars.idempotencyKey } },
      ),
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

export function useV1ReceivedReviewSummary(targetType: 'user' | 'team', period?: string, options?: QueryOptions) {
  return useQuery({
    queryKey: v1Keys.reviewsReceivedSummary(targetType, period),
    queryFn: () => v1Get<V1ReviewReceivedSummaryResponse>('/reviews/received/summary', { targetType, period }),
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
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: v1Keys.reviews() });
      queryClient.invalidateQueries({ queryKey: v1Keys.reviewsReceived() });
      queryClient.invalidateQueries({ queryKey: v1Keys.reviewSource(variables.sourceType, variables.sourceId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.profile() });
      queryClient.invalidateQueries({ queryKey: v1Keys.teams() });
      if (variables.targetTeamId) queryClient.invalidateQueries({ queryKey: v1Keys.team(variables.targetTeamId) });
      // 멱등 재제출(alreadySubmitted)은 실제 신규 제출이 아니므로 이벤트에서 제외
      if (!data.alreadySubmitted) {
        trackEvent('review_submit', { targetType: variables.targetType });
      }
    },
  });
}

export function useV1ChatRooms(options?: QueryOptions) {
  return useQuery({
    queryKey: v1Keys.chatRooms(),
    queryFn: () => v1Get<CursorPage<V1ChatRoom>>('/chat/rooms'),
    enabled: options?.enabled ?? true,
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: v1Keys.chatRooms() });
      // 신규 채팅방이 실제로 시작될 때만 기록 (기존 방을 다시 여는 경우는 "시작"이 아님)
      if (data.created) {
        trackEvent('chat_room_start', { type: data.roomType });
      }
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

/**
 * 사용자 단위 공개 기록 동의(F2) — 라인업에서 팀원 연결로 신원이 이어진 경기가
 * `/users/:id/records` 공개 프로필에 보일지 여부를 사용자 본인이 한 번에 켜고 끈다.
 * 동의하면 과거 경기까지 전부 소급 공개된다(시점 비교 없음, 사용자 명시 결정) — 그래서
 * 토글 문구가 이 소급 효과를 먼저 알려야 한다.
 */
export type V1RecordConsent = { granted: boolean; effectiveAt: string | null };

export function useV1RecordConsent() {
  return useQuery({
    queryKey: v1Keys.recordConsent(),
    queryFn: () => v1Get<V1RecordConsent>('/me/record-consent'),
  });
}

export function useV1UpdateRecordConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { granted: boolean; policyHash: string }) =>
      v1Put<V1RecordConsent>('/me/record-consent', body),
    onSuccess: (result) => {
      queryClient.setQueryData<V1RecordConsent>(v1Keys.recordConsent(), result);
    },
  });
}

/**
 * 대회 경기 기록 실명 표시 토글 (2026-08-18 사용자 결정) -- 대회 라인업/이벤트 득점자/
 * MVP에 닉네임 대신 실명을 보여줄지. `V1RecordConsent`(위)와 달리 "동의"가 아니라
 * 표시 선호도라 `policyHash`가 없고, 대회 신청 때마다 다시 묻지 않는다 -- 한 번 켜면
 * 그 뒤로 계속 적용되고 여기서 언제든 끌 수 있다. 기본값 false(닉네임).
 */
export type V1TournamentRealNameVisibility = { visible: boolean };

export function useV1TournamentRealNameVisibility() {
  return useQuery({
    queryKey: v1Keys.tournamentRealNameVisibility(),
    queryFn: () => v1Get<V1TournamentRealNameVisibility>('/me/tournament-real-name-visibility'),
  });
}

export function useV1UpdateTournamentRealNameVisibility() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { visible: boolean }) =>
      v1Patch<V1TournamentRealNameVisibility>('/me/tournament-real-name-visibility', body),
    onSuccess: (result) => {
      queryClient.setQueryData<V1TournamentRealNameVisibility>(v1Keys.tournamentRealNameVisibility(), result);
    },
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
      realName?: string | null;
      nickname: string;
      email?: string | null;
      profileImageUrl?: string | null;
      phone?: string | null;
      /** 번호를 바꿀 때만 필요 — 서버가 register 와 동일하게 본인인증 증명을 요구한다. */
      phoneProofToken?: string | null;
      birthDate?: string | null;
      gender: 'male' | 'female';
    }) =>
      v1Patch<{ profile: V1Profile['profile']; updatedAt: string }>('/me/profile', body),
    // 응답에 이미 최신 profile이 있는데도 invalidate만 하면, 리페치가 끝나기 전에
    // 호출부가 다음 화면으로 이동해 버려 마이페이지 등에서 방금 저장한 값 대신
    // 이전 캐시 값이 잠깐(또는 리페치 실패 시 계속) 보였다. setQueryData로 즉시 반영.
    onSuccess: (result) => {
      queryClient.setQueryData<V1Profile>(v1Keys.profile(), (current) =>
        current ? { ...current, profile: result.profile } : current,
      );
      queryClient.invalidateQueries({ queryKey: v1Keys.authMe() });
      queryClient.invalidateQueries({ queryKey: v1Keys.settings() });
      queryClient.invalidateQueries({ queryKey: v1Keys.home() });
      queryClient.invalidateQueries({ queryKey: v1Keys.teams() });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.all, 'teams'] });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.all, 'me', 'teams'] });
    },
  });
}

export function useV1Settings(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: v1Keys.settings(),
    queryFn: () => v1Get<V1Settings>('/me/settings'),
    enabled: options?.enabled,
  });
}

export function useV1UpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      theme?: V1Settings['theme'];
      notifications?: Partial<V1Settings['notifications']>;
    }) =>
      v1Patch<{ profile: V1Settings['profile']; theme: V1Settings['theme']; notifications: V1Settings['notifications']; updatedAt: string }>(
        '/me/settings',
        body,
      ),
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
 *
 * 전송 전에 compressImagesForUpload 로 한 장씩 축소·재인코딩한다 — 대회 포스터처럼 큰 원본을
 * 그대로 보내면 서버 한도(5MB, 그 위 multer 하드캡 10MB)에 걸려 413 으로 실패하기 때문이다.
 */
export function useV1UploadImages() {
  return useMutation({
    mutationFn: async (files: File | File[] | FileList) => {
      const formData = new FormData();
      const fileArray = files instanceof FileList
        ? Array.from(files)
        : Array.isArray(files)
          ? files
          : [files];
      const prepared = await compressImagesForUpload(fileArray);
      prepared.forEach((file) => formData.append('files', file));
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
    // 페이지를 넘기는 동안 직전 페이지를 그대로 보여준다 — 표가 빈 화면으로 깜빡이면
    // 운영자가 위치를 잃는다. isFetching 이 하단 페이지 버튼의 잠금 상태를 담당한다.
    placeholderData: keepPreviousData,
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
    queryFn: () => v1Get<AdminCursorPage<V1AdminUserRow>>('/admin/users', filters),
    // 페이지를 넘기는 동안 직전 페이지를 그대로 보여준다 — 표가 빈 화면으로 깜빡이면
    // 운영자가 위치를 잃는다. isFetching 이 하단 페이지 버튼의 잠금 상태를 담당한다.
    placeholderData: keepPreviousData,
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
    queryFn: () => v1Get<AdminCursorPage<V1AdminMatchRow>>('/admin/matches', filters),
    // 페이지를 넘기는 동안 직전 페이지를 그대로 보여준다 — 표가 빈 화면으로 깜빡이면
    // 운영자가 위치를 잃는다. isFetching 이 하단 페이지 버튼의 잠금 상태를 담당한다.
    placeholderData: keepPreviousData,
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
    queryFn: () => v1Get<AdminCursorPage<V1AdminTeamRow>>('/admin/teams', filters),
    // 페이지를 넘기는 동안 직전 페이지를 그대로 보여준다 — 표가 빈 화면으로 깜빡이면
    // 운영자가 위치를 잃는다. isFetching 이 하단 페이지 버튼의 잠금 상태를 담당한다.
    placeholderData: keepPreviousData,
  });
}

export function useV1AdminTeam(teamId: string) {
  return useQuery({
    queryKey: v1Keys.adminTeam(teamId),
    queryFn: () => v1Get<V1AdminTeamDetail>(`/admin/teams/${teamId}`),
    enabled: !!teamId,
  });
}

export function useV1AdminPopups(filters?: AdminListFilters) {
  return useQuery({
    queryKey: v1Keys.adminPopups(filters as Record<string, unknown>),
    queryFn: () => v1Get<AdminCursorPage<V1AdminPopupRow>>('/admin/popups', filters),
  });
}

export function useV1AdminPopupDetail(popupId: string) {
  return useQuery({
    queryKey: v1Keys.adminPopup(popupId),
    queryFn: () => v1Get<V1AdminPopupDetailResult>(`/admin/popups/${popupId}`),
    enabled: !!popupId,
  });
}
export function useV1AdminNotices(filters?: AdminListFilters) {
  return useQuery({
    queryKey: v1Keys.adminNotices(filters as Record<string, unknown>),
    queryFn: () => v1Get<AdminCursorPage<V1AdminNoticeRow>>('/admin/notices', filters),
    // 페이지를 넘기는 동안 직전 페이지를 그대로 보여준다 — 표가 빈 화면으로 깜빡이면
    // 운영자가 위치를 잃는다. isFetching 이 하단 페이지 버튼의 잠금 상태를 담당한다.
    placeholderData: keepPreviousData,
  });
}

export function useV1AdminNoticeDetail(noticeId: string) {
  return useQuery({
    queryKey: v1Keys.adminNotice(noticeId),
    queryFn: () => v1Get<V1AdminNoticeDetailResult>(`/admin/notices/${noticeId}`),
    enabled: !!noticeId,
  });
}

export function useV1CurrentSignupTerms(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: v1Keys.currentSignupTerms(),
    queryFn: () => v1Get<V1CurrentSignupTerms>('/terms/current', { context: 'signup' }),
    enabled: options?.enabled,
  });
}

export function useV1CurrentTerms(
  context: 'signup' | 'tournament_application' | 'footer',
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: v1Keys.currentTerms(context),
    queryFn: () => v1Get<V1CurrentTerms>('/terms/current', { context }),
    enabled: options?.enabled,
  });
}

export function useV1AcceptSignupTerms() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { documentIds: string[] }) =>
      v1Post<V1CurrentSignupTerms>('/terms/consents', body),
    onSuccess: (result) => {
      queryClient.setQueryData(v1Keys.currentSignupTerms(), result);
      // PendingSocialSignupGate 는 authMe 캐시의 termsCompliance 로 모든 라우트 진입을
      // 막는다. invalidateQueries 는 refetch 를 비동기로만 예약하므로, 호출 직후 이어지는
      // router.replace('/home') 이 refetch 완료보다 먼저 렌더되면 게이트가 갱신 전
      // compliant:false 스냅샷을 읽고 사용자를 다시 /terms 로 되돌려보낸다 — 재동의
      // 첫 클릭이 반응 없어 보이는 원인. 방금 응답으로 받은 compliance(서버가 재동의 반영
      // 직후 다시 계산한 것과 동일한 값)를 authMe 캐시에 동기적으로 반영해 이 레이스를
      // 없앤다. invalidateQueries 는 다른 authMe 필드까지 최신화하기 위해 그대로 유지한다.
      if (result.compliance) {
        const compliance = result.compliance;
        queryClient.setQueryData<V1AuthMe>(v1Keys.authMe(), (current) =>
          current ? { ...current, termsCompliance: compliance } : current,
        );
      }
      queryClient.invalidateQueries({ queryKey: v1Keys.authMe() });
    },
  });
}

export function useV1AdminTerms(filters?: AdminListFilters) {
  return useQuery({
    queryKey: v1Keys.adminTerms(filters),
    queryFn: () => v1Get<V1AdminTermsListResult>('/admin/terms', filters),
  });
}

export function useV1AdminTermsPolicy(policyId: string) {
  return useQuery({
    queryKey: v1Keys.adminTermsPolicy(policyId),
    queryFn: () => v1Get<V1AdminTermsPolicy>(`/admin/terms/${policyId}`),
    enabled: !!policyId,
  });
}

export function useV1AdminInquiries(filters?: AdminListFilters) {
  return useQuery({
    queryKey: v1Keys.adminInquiries(filters as Record<string, unknown>),
    queryFn: () => v1Get<AdminCursorPage<V1AdminInquiryRow>>('/admin/inquiries', filters),
    // 페이지를 넘기는 동안 직전 페이지를 그대로 보여준다 — 표가 빈 화면으로 깜빡이면
    // 운영자가 위치를 잃는다. isFetching 이 하단 페이지 버튼의 잠금 상태를 담당한다.
    placeholderData: keepPreviousData,
  });
}

export function useV1AdminInquiry(inquiryId: string) {
  return useQuery({
    queryKey: v1Keys.adminInquiry(inquiryId),
    queryFn: () => v1Get<V1AdminInquiryDetail>(`/admin/inquiries/${inquiryId}`),
    enabled: !!inquiryId,
  });
}

/** 어드민 사이드바 "문의" 배지용 — received/reviewing(미답변) 건수만 가볍게 조회 */
export function useV1AdminInquiriesPendingCount() {
  return useQuery({
    queryKey: v1Keys.adminInquiriesPendingCount(),
    queryFn: () => v1Get<V1AdminInquiryPendingCount>('/admin/inquiries/pending-count'),
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: false, // refetchInterval과 겹쳐 일시 실패 시 중복 요청 방지 (Copilot 리뷰 지적, PR #63)
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

export function useV1UpdateAdminInquiryReply(inquiryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ replyId, body }: { replyId: string } & V1AdminInquiryReplyPayload) =>
      v1Patch<V1AdminInquiryDetail>(`/admin/inquiries/${inquiryId}/replies/${replyId}`, { body }),
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
    queryFn: () => v1Get<AdminCursorPage<V1AdminTeamMatchRow>>('/admin/team-matches', filters),
    // 페이지를 넘기는 동안 직전 페이지를 그대로 보여준다 — 표가 빈 화면으로 깜빡이면
    // 운영자가 위치를 잃는다. isFetching 이 하단 페이지 버튼의 잠금 상태를 담당한다.
    placeholderData: keepPreviousData,
  });
}

export function useV1AdminStatusChangeLogs(filters?: AdminListFilters) {
  return useQuery({
    queryKey: v1Keys.adminStatusChangeLogs(filters as Record<string, unknown>),
    queryFn: () => v1Get<CursorPage<V1AdminStatusChangeLog>>('/admin/status-change-logs', filters),
    // 페이지를 넘기는 동안 직전 페이지를 그대로 보여준다 — 표가 빈 화면으로 깜빡이면
    // 운영자가 위치를 잃는다. isFetching 이 하단 페이지 버튼의 잠금 상태를 담당한다.
    placeholderData: keepPreviousData,
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
      // v1Delete 의 2번째 인자는 fetch 의 init 이 아니라 **body 그 자체**다. 여기서
      // { body: JSON.stringify(body) } 를 넘기면 한 번 더 감싸져
      // {"body":"{\"reason\":...}"} 가 전송되고, reason 이 없으니 서버가 400 을 낸다 —
      // 프로덕션에서 어드민 사용자 삭제가 두 번 다 400 으로 실패한 원인이다(2026-08-03).
      v1Delete<V1AdminStatusChangeResult>(`/admin/users/${userId}`, body),
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

export function useV1CreateAdminPopup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1AdminPopupCreatePayload) =>
      v1Post<V1AdminPopupCreateResult>('/admin/popups', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...v1Keys.all, 'admin', 'popups'] });
      queryClient.invalidateQueries({ queryKey: v1Keys.home() });
    },
  });
}

export function useV1UpdateAdminPopup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ popupId, body }: { popupId: string; body: V1AdminPopupUpdatePayload }) =>
      v1Patch<V1AdminPopupUpdateResult>(`/admin/popups/${popupId}`, body),
    onSuccess: (data, { popupId }) => {
      queryClient.setQueryData(v1Keys.adminPopup(popupId), data);
      queryClient.invalidateQueries({ queryKey: [...v1Keys.all, 'admin', 'popups'] });
      queryClient.invalidateQueries({ queryKey: v1Keys.home() });
    },
  });
}

export function useV1DeleteAdminPopup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (popupId: string) => v1Delete<V1AdminPopupDeleteResult>(`/admin/popups/${popupId}`),
    onSuccess: (_data, popupId) => {
      queryClient.removeQueries({ queryKey: v1Keys.adminPopup(popupId) });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.all, 'admin', 'popups'] });
      queryClient.invalidateQueries({ queryKey: v1Keys.home() });
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

export function useV1DeleteAdminNotice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (noticeId: string) => v1Delete<V1AdminNoticeDeleteResult>(`/admin/notices/${noticeId}`),
    onSuccess: (_data, noticeId) => {
      queryClient.removeQueries({ queryKey: v1Keys.adminNotice(noticeId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.adminNotices() });
      queryClient.invalidateQueries({ queryKey: v1Keys.notices() });
      queryClient.invalidateQueries({ queryKey: v1Keys.notice(noticeId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.home() });
    },
  });
}

function invalidateAdminTerms(queryClient: QueryClient, policyId?: string) {
  queryClient.invalidateQueries({ queryKey: [...v1Keys.all, 'admin', 'terms'] });
  if (policyId) queryClient.invalidateQueries({ queryKey: v1Keys.adminTermsPolicy(policyId) });
}

export function useV1CreateAdminTermsPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1AdminTermsPolicyCreatePayload) =>
      v1Post<V1AdminTermsPolicy>('/admin/terms', body),
    onSuccess: () => invalidateAdminTerms(queryClient),
  });
}

export function useV1UpdateAdminTermsPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ policyId, body }: { policyId: string; body: V1AdminTermsPolicyUpdatePayload }) =>
      v1Patch<V1AdminTermsPolicy>(`/admin/terms/${policyId}`, body),
    onSuccess: (_data, { policyId }) => invalidateAdminTerms(queryClient, policyId),
  });
}

export function useV1CreateAdminTermsVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ policyId, body }: { policyId: string; body: V1AdminTermsVersionPayload }) =>
      v1Post<V1AdminTermsPolicy>(`/admin/terms/${policyId}/documents`, body),
    onSuccess: (_data, { policyId }) => invalidateAdminTerms(queryClient, policyId),
  });
}

export function useV1UpdateAdminTermsDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      policyId,
      documentId,
      body,
    }: {
      policyId: string;
      documentId: string;
      body: V1AdminTermsVersionPayload;
    }) => v1Patch<V1AdminTermsPolicy>(`/admin/terms/${policyId}/documents/${documentId}`, body),
    onSuccess: (_data, { policyId }) => invalidateAdminTerms(queryClient, policyId),
  });
}

export function useV1ChangeAdminTermsStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      policyId,
      documentId,
      body,
    }: {
      policyId: string;
      documentId: string;
      body: V1AdminTermsStatusPayload;
    }) =>
      v1Post<V1AdminTermsPolicy>(
        `/admin/terms/${policyId}/documents/${documentId}/status`,
        body,
      ),
    onSuccess: (_data, { policyId }) => invalidateAdminTerms(queryClient, policyId),
  });
}

// ---------------------------------------------------------------------------
// Admin — admin-management (owner-only)
// ---------------------------------------------------------------------------

export function useV1AdminAdmins(filters?: AdminListFilters) {
  return useQuery({
    queryKey: v1Keys.adminAdmins(filters as Record<string, unknown>),
    queryFn: () => v1Get<AdminCursorPage<V1AdminRow>>('/admin/admins', filters),
    // 페이지를 넘기는 동안 직전 페이지를 그대로 보여준다 — 표가 빈 화면으로 깜빡이면
    // 운영자가 위치를 잃는다. isFetching 이 하단 페이지 버튼의 잠금 상태를 담당한다.
    placeholderData: keepPreviousData,
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
// Admin — ops (web push failure log)
// ---------------------------------------------------------------------------

export function useV1RecentPushFailures(limit = 20) {
  return useQuery({
    queryKey: v1Keys.adminPushFailures({ limit }),
    queryFn: () => v1Get<V1PushFailureSummary[]>('/admin/ops/recent-push-failures', { limit }),
  });
}

export function useV1AckPushFailures() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => v1Post('/admin/ops/push-failures/ack', { ids }),
    onSuccess: () => {
      // 빈 filters는 partial match로 모든 limit 변형을 함께 무효화한다.
      queryClient.invalidateQueries({ queryKey: v1Keys.adminPushFailures() });
    },
  });
}

/**
 * 어드민 수동 웹 푸시 발송 — 특정 유저 또는 전체 구독자 브로드캐스트.
 * 성공 시 push-failures 목록(새 실패가 즉시 생겼을 수 있음)을 무효화한다.
 */
export function useV1AdminSendPush() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: V1AdminPushSendPayload) =>
      v1Post<V1AdminPushSendResult>('/admin/ops/push-send', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminPushFailures() });
    },
  });
}

// ---------------------------------------------------------------------------
// Admin — game operation flags (PUBLIC_LIVE / DIRECTOR_OFFICIALIZE 운영 토글 2종)
// ---------------------------------------------------------------------------

/** 게이트 번들 없이 켜고 끄는 간소 경로가 지금 열려 있는지 — DB 설정값
 * (`v1_game_operation_gate_settings`, apps/v1_api 의 GameOperationFlagsService.readGateSetting
 * 참고)이라 프로덕션 포함 모든 환경에서 동일하게 조회/변경된다. */
export function useV1SimplifiedOperationFlagGateStatus() {
  return useQuery({
    queryKey: v1Keys.adminOperationFlagsSimplifiedGateStatus(),
    queryFn: () =>
      v1Get<V1SimplifiedOperationFlagGateStatus>('/tournament-ops/operation-flags/simplified-gate/status'),
  });
}

/** 간소 전환 모드 스위치 자체를 켜고 끈다 — 이 스위치가 꺼져 있으면 아래 두 플래그의
 * simplified-toggle 경로는 전부 SIMPLIFIED_GATE_DISABLED로 막힌다. 성공 시 status 쿼리를
 * 낙관적으로 갱신해 두 토글 카드가 최신 상태로 다시 그려지게 한다. */
export function useV1SetSimplifiedOperationFlagGate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: V1SetSimplifiedOperationFlagGatePayload) =>
      v1Patch<V1SimplifiedOperationFlagGateStatus>(
        '/tournament-ops/operation-flags/simplified-gate',
        payload,
        { headers: { 'idempotency-key': randomUuid() } },
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(v1Keys.adminOperationFlagsSimplifiedGateStatus(), data);
    },
  });
}

export function useV1OperationFlag(key: V1GameOperationFlagKey) {
  return useQuery({
    queryKey: v1Keys.adminOperationFlag(key),
    queryFn: () => v1Get<V1GameOperationFlag>(`/tournament-ops/operation-flags/${key}`),
  });
}

/** PUBLIC_LIVE/DIRECTOR_OFFICIALIZE 둘 다 허용 — 서버가 게이트 번들 증적만 생략할 뿐, CAS·권한·
 * 감사 로그 같은 나머지 안전장치는 그대로 검증한다. */
export function useV1SimplifiedToggleOperationFlag(key: V1GameOperationFlagKey) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: V1SimplifiedOperationFlagTogglePayload) =>
      v1Patch<V1GameOperationFlag>(
        `/tournament-ops/operation-flags/${key}/simplified-toggle`,
        payload,
        { headers: { 'idempotency-key': randomUuid() } },
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(v1Keys.adminOperationFlag(key), data);
    },
  });
}

// ---------------------------------------------------------------------------
// Admin — ops (SMS / 인증 실패 로그 + 운영 KPI 요약)
// ---------------------------------------------------------------------------

export function useV1RecentSmsFailures(limit = 20) {
  return useQuery({
    queryKey: v1Keys.adminSmsFailures({ limit }),
    queryFn: () => v1Get<V1SmsFailureSummary[]>('/admin/ops/recent-sms-failures', { limit }),
  });
}

export function useV1AckSmsFailures() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => v1Post('/admin/ops/sms-failures/ack', { ids }),
    onSuccess: () => {
      // 빈 filters는 partial match로 모든 limit 변형을 함께 무효화한다.
      queryClient.invalidateQueries({ queryKey: v1Keys.adminSmsFailures() });
    },
  });
}

/**
 * 운영 대시보드 KPI(최근 5분 웹 푸시 / SMS·인증 실패 건수).
 * ack 는 "최근 5분 발생 건수"를 바꾸지 않으므로(집계 기준이 createdAt) 무효화 대상이 아니다.
 */
export function useV1AdminOpsSummary() {
  return useQuery({
    queryKey: v1Keys.adminOpsSummary(),
    queryFn: () => v1Get<V1AdminOpsSummary>('/admin/ops/summary'),
  });
}

// ---------------------------------------------------------------------------
// Admin — 에러 로그 뷰어
// ---------------------------------------------------------------------------

/** 에러 로그 목록 (cursor 페이지네이션, source/statusCode/level/기간/검색어 필터) */
export function useAdminErrorLogs(filters?: V1AdminErrorLogFilters) {
  return useQuery({
    queryKey: [...v1Keys.all, 'admin', 'error-logs', filters ?? {}] as const,
    queryFn: () => v1Get<V1AdminErrorLogsPage>('/admin/ops/errors', filters),
    // 페이지를 넘기는 동안 직전 페이지를 그대로 보여준다 — 표가 빈 화면으로 깜빡이면
    // 운영자가 위치를 잃는다. isFetching 이 하단 페이지 버튼의 잠금 상태를 담당한다.
    placeholderData: keepPreviousData,
  });
}

/** 에러 로그 상세 — traceback/request/response/context 포함 */
export function useAdminErrorLog(id: string) {
  return useQuery({
    queryKey: [...v1Keys.all, 'admin', 'error-log', id] as const,
    queryFn: () => v1Get<V1AdminErrorLogDetail>(`/admin/ops/errors/${id}`),
    enabled: !!id,
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

type AllTournamentListFilters = Pick<TournamentListFilters, 'status' | 'sportId'>;

/** 홈/목록 프로모 캐러셀은 전체 대회를 훑어 promoHome/promoListEnabled 필터링이 필요 —
 * cursor 페이지를 전부 순회해 누적한다. 무한 루프 방지로 cursor 재등장을 감지한다. */
export async function fetchAllV1Tournaments(
  params?: AllTournamentListFilters,
): Promise<V1TournamentListPage['items']> {
  const items: V1TournamentListPage['items'] = [];
  const seenItemIds = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  while (true) {
    const page = await v1Get<V1TournamentListPage>('/tournaments', {
      ...params,
      cursor,
      limit: 50,
    });
    for (const item of page.items) {
      if (seenItemIds.has(item.id)) continue;
      seenItemIds.add(item.id);
      items.push(item);
    }
    if (!page.pageInfo.hasNext) return items;
    const nextCursor = page.pageInfo.nextCursor;
    if (!nextCursor || seenCursors.has(nextCursor)) {
      throw new Error('대회 목록 cursor가 유효하게 진행되지 않아 전체 대회를 불러오지 못했어요.');
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }
}

export function useV1AllTournaments(params?: AllTournamentListFilters) {
  return useQuery({
    queryKey: [...v1Keys.tournaments(params as Record<string, unknown>), 'all'],
    queryFn: () => fetchAllV1Tournaments(params),
  });
}

/**
 * LIVE 픽스처가 있을 때만 폴링 — 주기 값과 근거(뷰어당 10초 하한, idle 페이지는 폴링 0,
 * 관전자 수에 비례하는 부하 모델)는 `@/lib/public-live-polling`이 단일 소스로 보유한다.
 * `/tournaments/:id/bracket`이 이 훅과 공개 일정 훅(`usePublicTournamentSchedule`)을
 * 같은 화면에서 동시에 쓰므로, 두 곳이 각자 숫자를 정의하면 한쪽만 수정될 때 어긋난 두
 * 주기로 이중 폴링이 된다 — 그래서 주석 규율 대신 공유 상수로 구조적으로 묶었다.
 */
const V1_TOURNAMENT_LIVE_POLL_INTERVAL_MS = PUBLIC_LIVE_POLL_INTERVAL_MS;

/**
 * `options.livePolling`은 opt-in — 기본값(false)에서는 기존 동작(폴링 없음)을 그대로
 * 유지한다. 이 훅은 apply/roster/awards/results/admin ops 등 폴링이 불필요한 여러
 * 화면이 함께 쓰므로, 전역으로 폴링을 켜면 그 화면들까지 불필요한 재조회가 생긴다.
 * `/tournaments/:id/bracket`(진행 중 대회의 순위·대진표 실시간 갱신이 실제로 필요한
 * 유일한 소비처)만 명시적으로 켠다.
 */
export function useV1Tournament(id: string, options?: { livePolling?: boolean }) {
  const livePolling = options?.livePolling ?? false;
  return useQuery({
    queryKey: v1Keys.tournament(id),
    queryFn: () => v1Get<V1TournamentDetail>(`/tournaments/${id}`),
    enabled: !!id,
    refetchInterval: livePolling
      ? (query: { state: { data?: V1TournamentDetail } }) => {
          const hasLiveFixture = query.state.data?.fixtures.some((f) => f.status === 'in_progress') ?? false;
          return hasLiveFixture ? V1_TOURNAMENT_LIVE_POLL_INTERVAL_MS : false;
        }
      : undefined,
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
    // teamId는 여러 팀의 팀장·운영진을 겸하고 그 팀들이 모두 이 대회에 참가 확정된
    // 사용자에게만 필요하다(단일 자격 팀이면 서버가 자동 선택). 서버가 400
    // TEAM_SELECTION_REQUIRED + details.teams 로 후보 목록을 돌려주면 호출자가 사용자에게
    // 팀을 고르게 한 뒤 이 필드를 채워 재요청한다.
    mutationFn: (body: { rating: number; comment?: string; photoUrls?: string[]; teamId?: string }) =>
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
      iconKey?: string; teamName?: string; note?: string; sortOrder?: number;
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

/** 어드민 전용 로스터 조회 — 팀 비멤버 어드민도 403 없이 조회 가능 (Task 110) */
export function useV1AdminTournamentPlayers(registrationId: string) {
  return useQuery({
    queryKey: v1Keys.adminTournamentRoster(registrationId),
    queryFn: () =>
      v1Get<V1AdminTournamentRosterResponse>(`/admin/registrations/${registrationId}/players`),
    enabled: !!registrationId,
    retry: false,
  });
}

/**
 * 어드민이 팀 대신 명단에 선수를 추가·제거한다.
 *
 * 이 두 훅이 없던 동안 어드민 콘솔은 명단을 **볼 수만** 있었다. 팀장이 자리를 비웠거나
 * 마감이 지난 뒤 운영 조정이 필요해도 손댈 방법이 없었고, 화면에서 시도해도 서버로
 * 요청이 가지 않아 로그에 실패조차 남지 않았다(2026-08-03 실사고).
 */
/** 명단에 올릴 수 있는 팀원 목록. 어드민이 UUID 를 직접 입력하지 않아도 되게 한다. */
export function useV1AdminRosterEligibleMembers(registrationId: string, enabled: boolean) {
  return useQuery({
    queryKey: v1Keys.adminRosterEligibleMembers(registrationId),
    queryFn: () =>
      v1Get<V1AdminRosterEligibleMembersResponse>(
        `/admin/registrations/${registrationId}/eligible-players`,
      ),
    enabled: enabled && !!registrationId,
    retry: false,
  });
}

export function useV1AdminAddPlayer(registrationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { userId: string; realName: string }) =>
      v1Post(`/admin/registrations/${registrationId}/players`, body),
    // onSuccess 가 반환하는 프라미스는 React Query 가 내부에서 await 한다(mutation.ts
    // `await this.options.onSuccess?.(...)`) — 그래서 버튼이 "추가 중" 에서 풀리는 시점엔
    // 이미 아래 무효화가 끝나 있다. 안 그러면 버튼만 먼저 살아나 방금 넣은 선수를 한 번 더
    // 넣으려는 클릭이 가능하다.
    // 자격 판정(alreadyOnRoster/eligible)이 명단에서 파생되므로 선택 목록도 함께 턴다.
    // roster 키('…/players')는 eligible 키('…/eligible-players')의 접두사가 아니라서
    // 자동으로 딸려오지 않는다 — 빠뜨리면 방금 추가한 팀원이 계속 선택 가능해 보인다.
    onSuccess: () => invalidateRosterViews(queryClient, null, registrationId),
  });
}

export function useV1AdminRemovePlayer(registrationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (playerId: string) => v1Delete(`/admin/players/${playerId}`),
    // 제외한 팀원은 다시 고를 수 있어야 한다 — 접두사가 달라 roster 무효화로는 안 따라온다.
    onSuccess: () => invalidateRosterViews(queryClient, null, registrationId),
  });
}

/**
 * 같은 명단을 보는 모든 캐시를 한 번에 턴다.
 *
 * 소비자와 어드민이 같은 로스터를 **다른 키**로 캐싱한다(`v1/tournaments/…/players` vs
 * `v1/admin/registrations/…/players`). 한쪽만 무효화하면 어드민이면서 팀 매니저인 사용자나
 * 두 화면을 오가는 세션에서 방금 바꾼 명단이 옛 값으로 보인다.
 *
 * 어드민 훅은 tournamentId 를 모르는 자리라 소비자 키를 predicate 로 찾는다.
 */
function invalidateRosterViews(
  queryClient: QueryClient,
  tournamentId: string | null,
  registrationId: string,
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: v1Keys.adminTournamentRoster(registrationId) }),
    queryClient.invalidateQueries({
      queryKey: v1Keys.adminRosterEligibleMembers(registrationId),
    }),
    queryClient.invalidateQueries({ queryKey: v1Keys.adminTournaments().slice(0, 3) }),
    tournamentId
      ? queryClient.invalidateQueries({
          queryKey: v1Keys.tournamentPlayers(tournamentId, registrationId),
        })
      : queryClient.invalidateQueries({
          // ['v1','tournaments',<tid>,'registrations',<rid>,'players']
          predicate: (query) => {
            const key = query.queryKey;
            return (
              key[0] === 'v1' &&
              key[1] === 'tournaments' &&
              key[3] === 'registrations' &&
              key[4] === registrationId &&
              key[5] === 'players'
            );
          },
        }),
    ...(tournamentId
      ? [
          queryClient.invalidateQueries({
            queryKey: v1Keys.tournamentRegistration(tournamentId, registrationId),
          }),
          queryClient.invalidateQueries({
            queryKey: v1Keys.myTournamentRegistration(tournamentId),
          }),
        ]
      : []),
  ]);
}

export function useV1AddPlayer(tournamentId: string, registrationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1AddPlayerPayload) =>
      v1Post<V1TournamentPlayer>(
        `/tournaments/${tournamentId}/registrations/${registrationId}/players`,
        body,
      ),
    onSuccess: () => invalidateRosterViews(queryClient, tournamentId, registrationId),
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
    onSuccess: () => invalidateRosterViews(queryClient, tournamentId, registrationId),
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
    onSuccess: () => invalidateRosterViews(queryClient, tournamentId, registrationId),
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
    // 페이지를 넘기는 동안 직전 페이지를 그대로 보여준다 — 표가 빈 화면으로 깜빡이면
    // 운영자가 위치를 잃는다. isFetching 이 하단 페이지 버튼의 잠금 상태를 담당한다.
    placeholderData: keepPreviousData,
  });
}

export function useV1AdminTournament(id: string) {
  return useQuery({
    queryKey: v1Keys.adminTournament(id),
    queryFn: () => v1Get<V1Tournament>(`/admin/tournaments/${id}`),
    enabled: !!id,
  });
}

/**
 * "출전 인원"(라인업 상한) 선택지 — 대회 생성/수정 화면이 선택된 sportId로 조회한다.
 * D-17과 같은 원칙(카탈로그 단일 출처는 서버): FUTSAL_FORMATIONS/축구 포메이션이 실제로
 * 지원하는 인원수는 서버(competition-config.presets.ts)만 알고 있으므로 프론트는 절대
 * 후보 목록을 하드코딩하지 않는다.
 */
export function useV1LineupSizeOptions(sportId: string | null) {
  return useQuery({
    queryKey: v1Keys.adminLineupSizeOptions(sportId ?? ''),
    queryFn: () => v1Get<V1LineupSizeOptions>('/admin/competition-configs/lineup-size-options', { sportId }),
    enabled: !!sportId,
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
      queryClient.invalidateQueries({ queryKey: v1Keys.tournament(id) });
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

/**
 * Task 109 Track 6 — 대진표(조/픽스처) 일괄 공개. 성공 시 어드민 상세 + 공개 상세를 모두 invalidate.
 * `scheduledAt`(ISO)을 넘기면 즉시 공개하지 않고 그 시각에 공개되도록 예약한다.
 * 과거 시각은 서버가 400 `TOURNAMENT_BRACKET_PUBLISH_SCHEDULE_PAST` 로 거부한다.
 */
export function useV1PublishTournamentBracket(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars?: { scheduledAt?: string }) =>
      v1Post<V1PublishBracketResult>(
        `/admin/tournaments/${id}/publish-bracket`,
        vars?.scheduledAt ? { scheduledAt: vars.scheduledAt } : {},
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTournament(id) });
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTournaments() });
      queryClient.invalidateQueries({ queryKey: v1Keys.tournament(id) });
    },
  });
}

/** 대진표 공개 취소 — 즉시 공개분과 예약분을 모두 되돌린다(비공개 전환). */
export function useV1UnpublishTournamentBracket(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => v1Post<V1UnpublishBracketResult>(`/admin/tournaments/${id}/unpublish-bracket`, {}),
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

/**
 * @param registrationId 자격을 바꾼 선수가 속한 신청. 명단 캐시 키가 registrationId 기준이라
 *   이걸 모르면 방금 바꾼 자격이 화면에 반영되지 않는다 — 서버는 바뀌고 토스트도 뜨는데
 *   행의 배지는 옛 값 그대로였다.
 */
export function useV1UpdatePlayerEligibility(registrationId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      playerId,
      ...body
    }: { playerId: string } & V1UpdatePlayerEligibilityPayload) =>
      v1Patch<V1TournamentPlayer>(`/admin/players/${playerId}/eligibility`, body),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [...v1Keys.all, 'admin', 'tournaments'],
        }),
        // 자격 상태도 명단·선택목록에 그대로 반영되는 값이라 add/remove 와 같은 헬퍼를 쓴다 —
        // 여기만 admin roster 키만 털면 eligible-players 와 소비자 명단 캐시가 낡는다.
        ...(registrationId ? [invalidateRosterViews(queryClient, null, registrationId)] : []),
      ]);
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
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTournament(tournamentId) });
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

// ── Tournament popups (Task 109 Track 8) ────────────────────────────────────

export function useV1AdminTournamentPopups(tournamentId: string) {
  return useQuery({
    queryKey: v1Keys.adminTournamentPopups(tournamentId),
    queryFn: () =>
      v1Get<V1AdminTournamentPopupListResult>(`/admin/tournaments/${tournamentId}/popups`),
    enabled: !!tournamentId,
  });
}

export function useV1CreateTournamentPopup(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1CreateTournamentPopupPayload) =>
      v1Post<V1AdminTournamentPopup>(`/admin/tournaments/${tournamentId}/popups`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTournamentPopups(tournamentId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.tournament(tournamentId) });
    },
  });
}

export function useV1UpdateTournamentPopup(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { popupId: string; body: V1UpdateTournamentPopupPayload }) =>
      v1Patch<V1AdminTournamentPopup>(
        `/admin/tournaments/${tournamentId}/popups/${input.popupId}`,
        input.body,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTournamentPopups(tournamentId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.tournament(tournamentId) });
    },
  });
}

export function useV1DeleteTournamentPopup(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (popupId: string) =>
      v1Delete<V1DeleteTournamentPopupResult>(
        `/admin/tournaments/${tournamentId}/popups/${popupId}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTournamentPopups(tournamentId) });
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

// ─── 어드민: 외부 연동 키 설정(카카오맵 REST/JS 키) ────────────────────────────

/** GET /admin/settings/integrations — 마스킹된 현재 값 + 출처(admin/env/none) 조회 */
export function useV1AdminIntegrationSettings() {
  return useQuery({
    queryKey: v1Keys.adminIntegrationSettings(),
    queryFn: () => v1Get<V1IntegrationSettings>('/admin/settings/integrations'),
  });
}

/** PATCH /admin/settings/integrations — 값 저장(빈 문자열 전달 시 해당 키 삭제 → env 폴백 복귀) */
export function useV1UpdateIntegrationSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: V1UpdateIntegrationSettingsPayload) =>
      v1Patch<V1IntegrationSettings>('/admin/settings/integrations', payload),
    onSuccess: (data) => {
      queryClient.setQueryData(v1Keys.adminIntegrationSettings(), data);
    },
  });
}

/** GET /admin/settings/reviews — 리뷰 작성 가능 기간 조회 */
export function useV1AdminReviewPolicySettings() {
  return useQuery({
    queryKey: v1Keys.adminReviewPolicySettings(),
    queryFn: () => v1Get<V1ReviewPolicySettings>('/admin/settings/reviews'),
  });
}

/**
 * PATCH /admin/settings/reviews — 작성 가능 기간 저장.
 * 마감은 저장돼 있지 않고 매 요청 시점에 계산되므로, 기간을 늘리면 직전 정책으로 마감됐던
 * 경기도 다시 열리고 줄이면 즉시 닫힌다. 후기 목록 캐시도 함께 무효화한다.
 */
export function useV1UpdateReviewPolicySettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: V1UpdateReviewPolicySettingsPayload) =>
      v1Patch<V1ReviewPolicySettings>('/admin/settings/reviews', payload),
    onSuccess: (data) => {
      queryClient.setQueryData(v1Keys.adminReviewPolicySettings(), data);
      void queryClient.invalidateQueries({ queryKey: [...v1Keys.all, 'reviews'] });
    },
  });
}

/**
 * GET /public/integrations/kakao-maps-key — 인증 불필요. 카카오맵 JS SDK는 도메인 제한으로
 * 보호되므로 공개돼도 안전 — 지도 임베드 컴포넌트가 SDK 스크립트 로드 직전에 호출한다.
 */
export function useV1PublicKakaoMapsKey(options?: QueryOptions) {
  return useQuery({
    queryKey: v1Keys.publicKakaoMapsKey(),
    queryFn: () => v1Get<V1PublicKakaoMapsKeyResponse>('/public/integrations/kakao-maps-key'),
    staleTime: 5 * 60 * 1000,
    enabled: options?.enabled,
  });
}

// ─── 어드민: 콘텐츠(공지/팝업) 본문 이미지 업로드 ────────────────────────────

export function useV1UploadAdminContentAsset() {
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('files', file);
      return v1MultipartPost<V1AdminContentAsset>('/admin/content-assets', formData);
    },
  });
}

export function useV1DeleteAdminContentAsset() {
  return useMutation({
    mutationFn: (assetId: string) =>
      v1Delete<{ assetId: string; deleted: true }>(`/admin/content-assets/${assetId}`),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// 대회 운영(tournament-ops) 셸/보드/스태프 (Task 19 — 백엔드는 Task 18)
// ─────────────────────────────────────────────────────────────────────────

/**
 * GET /tournament-ops/tournaments/:tournamentId/operations — 운영 보드 한 페이지.
 * `refetchInterval`로 상단(현재 커서) 페이지를 주기적으로 재조회해 점진 업데이트를
 * 지원한다 — `placeholderData: keepPreviousData`가 재조회 중 목록이 빈 화면으로
 * 깜빡이는 것을 막아, 필터 입력 등 화면의 로컬 상태가 유지된다.
 */
export function useV1TournamentOperationsBoard(
  tournamentId: string,
  filters?: V1TournamentOperationsBoardFilters,
  options?: QueryOptions,
) {
  return useQuery({
    queryKey: v1Keys.tournamentOperationsBoard(tournamentId, filters as Record<string, unknown>),
    queryFn: () =>
      v1Get<V1TournamentOperationsBoardPage>(
        `/tournament-ops/tournaments/${tournamentId}/operations`,
        filters,
      ),
    enabled: Boolean(tournamentId) && (options?.enabled ?? true),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });
}

/** "더 보기" 등 일회성 다음 페이지 조회용 — 폴링 대상이 아닌 과거 페이지는 훅 없이 직접 fetchQuery로 가져온다. */
export function fetchV1TournamentOperationsBoardPage(
  queryClient: QueryClient,
  tournamentId: string,
  filters: V1TournamentOperationsBoardFilters,
) {
  return queryClient.fetchQuery({
    queryKey: v1Keys.tournamentOperationsBoard(tournamentId, filters as Record<string, unknown>),
    queryFn: () =>
      v1Get<V1TournamentOperationsBoardPage>(
        `/tournament-ops/tournaments/${tournamentId}/operations`,
        filters,
      ),
  });
}

/**
 * GET /tournament-ops/tournaments/:tournamentId/staff — 대회 전체 스태프 배정 목록.
 * `read` 액션은 platform_ops/tournament_director/support_readonly에게만 허용된다
 * (field_operator는 항상 field/fixture 스코프가 있어 대회 전역 리소스로는 403) — 이 응답이
 * 성공하면 셸 게이트가 여기서 내 역할을 함께 도출한다.
 */
export function useV1TournamentStaffAssignments(tournamentId: string, options?: QueryOptions) {
  return useQuery({
    queryKey: v1Keys.tournamentOperationsStaff(tournamentId),
    queryFn: () => v1Get<V1TournamentStaffListResponse>(`/tournament-ops/tournaments/${tournamentId}/staff`),
    enabled: Boolean(tournamentId) && (options?.enabled ?? true),
  });
}

/**
 * GET /tournament-ops/tournaments/:tournamentId/staff/user-search — 배정할 사람을 닉네임으로
 * 찾는다. 서버가 최소 2글자를 요구하므로(400) 그보다 짧으면 아예 호출하지 않는다. 호출
 * 빈도는 서버에서 60초 30회로 묶여 있어 호출자가 입력을 디바운스하는 것을 전제로 한다
 * (GrantStaffModal 이 250ms 디바운스). 검색 결과는 사용자 명부 일부라 캐시에 오래 남기지
 * 않는다.
 */
export function useV1TournamentStaffCandidateSearch(
  tournamentId: string,
  query: string,
  options?: QueryOptions,
) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: v1Keys.tournamentOperationsStaffCandidates(tournamentId, trimmed),
    queryFn: () =>
      v1Get<V1TournamentStaffCandidateSearchResponse>(
        `/tournament-ops/tournaments/${tournamentId}/staff/user-search?q=${encodeURIComponent(trimmed)}`,
      ),
    enabled: Boolean(tournamentId) && trimmed.length >= 2 && (options?.enabled ?? true),
    staleTime: 30_000,
    gcTime: 60_000,
  });
}

/**
 * GET /me/tournament-staff — "내 담당 대회" (마이페이지 진입점). 서버가 이미 만료·해제된
 * 배정을 제외하고 대회 단위로 묶어서 돌려준다 — 여기서는 그대로 노출만 한다. 대부분의
 * 사용자는 스태프가 아니므로 마이홈 등 항상 렌더되는 화면에서는 `enabled`로 프로필 로딩
 * 이후에만 호출해 불필요한 401 재시도를 피한다(useV1MyTeams와 동일한 관례).
 */
export function useV1MyTournamentStaffAssignments(options?: QueryOptions) {
  return useQuery({
    queryKey: v1Keys.myTournamentStaffAssignments(),
    queryFn: () => v1Get<V1MyTournamentStaffResponse>('/me/tournament-staff'),
    enabled: options?.enabled ?? true,
  });
}

/** GET /tournament-ops/tournaments/:tournamentId/fields — 필터 드롭다운용 필드/코트 목록. */
export function useV1TournamentFields(tournamentId: string, options?: QueryOptions) {
  return useQuery({
    queryKey: v1Keys.tournamentOperationsFields(tournamentId),
    queryFn: () => v1Get<V1TournamentFieldListResponse>(`/tournament-ops/tournaments/${tournamentId}/fields`),
    enabled: Boolean(tournamentId) && (options?.enabled ?? true),
  });
}

/**
 * POST /tournament-ops/tournaments/:tournamentId/fields — 경기장(필드) 등록.
 *
 * 백엔드는 Task 18 때부터 있었지만 호출부가 없어 필드가 영원히 0건이었고, 그래서
 * 필드 담당자 배정을 끝낼 수 없었다(#373). 성공 시 목록 쿼리를 무효화해 같은 화면의
 * 선택지가 바로 채워지고 새로고침해도 서버 값이 그대로 남는다.
 *
 * 권한: 플랫폼 운영자만 통과한다(서버 authorizeFieldManagement → FIELD_MANAGEMENT_DENIED).
 * 호출하는 화면에서 역할을 먼저 가려 폼을 열 것.
 */
export function useV1CreateTournamentField(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: V1CreateTournamentFieldPayload) =>
      v1Post<V1TournamentField>(`/tournament-ops/tournaments/${tournamentId}/fields`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.tournamentOperationsFields(tournamentId) });
    },
  });
}

/**
 * 경기 ↔ 경기장(필드) 연결.
 *
 * `V1TournamentFixture.fieldId` 의 **유일한 쓰기 경로**다(백엔드 DTO 주석이 그렇게 못박고
 * 있다). 백엔드는 Task 18 때부터 있었는데 호출부가 없어서, 필드를 만들어 스태프에게
 * 배정해도 그 필드에 걸린 경기가 영원히 0건이었다 — 필드 담당자는 담당 경기를 가질 수
 * 없었고, `NO_FIELD_ASSIGNED`·`NO_STAFF_ASSIGNED` 경고는 끌 방법이 없어 운영 보드에서
 * 통째로 숨겨져 있었다(2026-08-13 alpha 실측: 픽스처 20건 전부 `fieldId=null`).
 * 필드 *생성* 호출부가 없어 같은 증상이 한 단계 위에서 났던 #373 과 같은 결함이다.
 *
 * 배정/해제는 별도 메서드다 — nullable 필드를 PATCH 하나로 다루면 "비우기"와 "안 건드림"이
 * 구분되지 않아서, 백엔드가 의도적으로 갈라 놓았다.
 *
 * 권한: 필드 *관리*(생성·수정)와 달리 플랫폼 운영자 전용이 아니다. 서버는
 * `event_reverse` 권한으로 판정하므로 **플랫폼 운영자와 대회 디렉터**가 통과하고,
 * 필드 담당자·조회 전용은 거부된다. 호출 화면에서 역할을 먼저 가릴 것.
 *
 * 보드가 `fieldName` 을 직접 렌더하므로 성공 시 보드 쿼리도 함께 무효화한다.
 */
export function useV1AssignFixtureField(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fixtureId, fieldId }: { fixtureId: string; fieldId: string }) =>
      v1Patch<V1TournamentFixtureFieldResult>(
        `/tournament-ops/tournaments/${tournamentId}/fixtures/${fixtureId}/field`,
        { fieldId },
        idempotencyInit(),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.tournamentOperationsBoardAll(tournamentId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.tournamentOperationsFields(tournamentId) });
    },
  });
}

/** DELETE /tournament-ops/tournaments/:tournamentId/fixtures/:fixtureId/field — 배정 해제. */
export function useV1ClearFixtureField(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fixtureId }: { fixtureId: string }) =>
      v1Delete<V1TournamentFixtureFieldResult>(
        `/tournament-ops/tournaments/${tournamentId}/fixtures/${fixtureId}/field`,
        undefined,
        idempotencyInit(),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.tournamentOperationsBoardAll(tournamentId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.tournamentOperationsFields(tournamentId) });
    },
  });
}

/** POST /tournament-ops/tournaments/:tournamentId/staff — 스태프 배정(관리자/대회 디렉터). */
export function useV1GrantTournamentStaff(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: V1GrantTournamentStaffPayload) =>
      v1Post<V1TournamentStaffAssignment>(`/tournament-ops/tournaments/${tournamentId}/staff`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.tournamentOperationsStaff(tournamentId) });
    },
  });
}

/** POST /tournament-ops/tournaments/:tournamentId/staff/:assignmentId/revoke — 스태프 배정 해제. */
export function useV1RevokeTournamentStaff(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      assignmentId,
      payload,
    }: {
      assignmentId: string;
      payload: V1RevokeTournamentStaffPayload;
    }) =>
      v1Post<V1TournamentStaffAssignment>(
        `/tournament-ops/tournaments/${tournamentId}/staff/${assignmentId}/revoke`,
        payload,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.tournamentOperationsStaff(tournamentId) });
    },
  });
}

import type {
  V1AdminSeriesDetail,
  V1AdminSeriesListItem,
  V1CreateSeriesPayload,
  V1CreateSeriesResult,
  V1GenerateSeriesFixturesPayload,
  V1GenerateSeriesFixturesResult,
  V1PublicSeriesDetail,
  V1SeriesPlayerRecordsResponse,
  V1SeriesStandingsResponse,
  V1UpdateSeriesFixturePayload,
  V1UpdateSeriesFixtureResult,
} from '@/types/team-match-series';

export function useV1AdminTeamMatchSeriesList() {
  return useQuery({
    queryKey: v1Keys.adminTeamMatchSeriesList(),
    queryFn: () => v1Get<{ items: V1AdminSeriesListItem[] }>('/admin/team-match-series'),
  });
}

export function useV1AdminTeamMatchSeries(seriesId: string) {
  return useQuery({
    queryKey: v1Keys.adminTeamMatchSeries(seriesId),
    queryFn: () => v1Get<V1AdminSeriesDetail>(`/admin/team-match-series/${seriesId}`),
    enabled: Boolean(seriesId),
  });
}

export function useV1CreateTeamMatchSeries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1CreateSeriesPayload) => v1Post<V1CreateSeriesResult>('/admin/team-match-series', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTeamMatchSeriesList() });
    },
  });
}

export function useV1GenerateSeriesFixtures(seriesId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1GenerateSeriesFixturesPayload) =>
      v1Post<V1GenerateSeriesFixturesResult>(`/admin/team-match-series/${seriesId}/fixtures`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTeamMatchSeries(seriesId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTeamMatchSeriesList() });
    },
  });
}

export function useV1UpdateSeriesFixture(seriesId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ teamMatchId, body }: { teamMatchId: string; body: V1UpdateSeriesFixturePayload }) =>
      v1Patch<V1UpdateSeriesFixtureResult>(`/admin/team-match-series/${seriesId}/fixtures/${teamMatchId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTeamMatchSeries(seriesId) });
    },
  });
}

export function useV1TeamMatchSeries(seriesId: string) {
  return useQuery({
    queryKey: v1Keys.teamMatchSeries(seriesId),
    queryFn: () => v1Get<V1PublicSeriesDetail>(`/team-match-series/${seriesId}`),
    enabled: Boolean(seriesId),
  });
}

export function useV1TeamMatchSeriesStandings(seriesId: string) {
  return useQuery({
    queryKey: v1Keys.teamMatchSeriesStandings(seriesId),
    queryFn: () => v1Get<V1SeriesStandingsResponse>(`/team-match-series/${seriesId}/standings`),
    enabled: Boolean(seriesId),
  });
}

export function useV1TeamMatchSeriesPlayerRecords(seriesId: string) {
  return useQuery({
    queryKey: v1Keys.teamMatchSeriesPlayerRecords(seriesId),
    queryFn: () => v1Get<V1SeriesPlayerRecordsResponse>(`/team-match-series/${seriesId}/player-records`),
    enabled: Boolean(seriesId),
  });
}
