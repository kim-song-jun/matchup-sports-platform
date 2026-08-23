import type { QueryClient } from '@tanstack/react-query';

export const v1Keys = {
  all: ['v1'] as const,
  authMe: () => [...v1Keys.all, 'auth', 'me'] as const,
  currentTerms: (context: 'signup' | 'tournament_application' | 'footer') =>
    [...v1Keys.all, 'terms', 'current', context] as const,
  currentSignupTerms: () => v1Keys.currentTerms('signup'),
  onboarding: () => [...v1Keys.all, 'onboarding'] as const,
  masterSports: () => [...v1Keys.all, 'master', 'sports'] as const,
  masterRegions: () => [...v1Keys.all, 'master', 'regions'] as const,
  home: (filters?: Record<string, unknown>) => [...v1Keys.all, 'home', filters ?? {}] as const,
  activePopup: (screen: string | null, path?: string | null) =>
    [...v1Keys.all, 'popups', 'active', screen, path ?? null] as const,
  recentSearches: () => [...v1Keys.all, 'search', 'recent'] as const,
  notices: (filters?: Record<string, unknown>) => [...v1Keys.all, 'notices', filters ?? {}] as const,
  notice: (noticeId: string) => [...v1Keys.all, 'notices', noticeId] as const,
  matches: (filters?: Record<string, unknown>) => [...v1Keys.all, 'matches', filters ?? {}] as const,
  match: (matchId: string) => [...v1Keys.all, 'matches', matchId] as const,
  myRecentVenues: () => [...v1Keys.all, 'matches', 'me', 'recent-venues'] as const,
  teams: (filters?: Record<string, unknown>) => [...v1Keys.all, 'teams', filters ?? {}] as const,
  team: (teamId: string) => [...v1Keys.all, 'teams', teamId] as const,
  teamRecentVenues: (teamId: string) => [...v1Keys.all, 'teams', teamId, 'recent-venues'] as const,
  teamMatches: (filters?: Record<string, unknown>) => [...v1Keys.all, 'team-matches', filters ?? {}] as const,
  teamMatch: (teamMatchId: string) => [...v1Keys.all, 'team-matches', teamMatchId] as const,
  teamContacts: (teamId: string, filters?: Record<string, unknown>) =>
    [...v1Keys.team(teamId), 'contacts', filters ?? {}] as const,
  /**
   * 필터 없는 컨택 목록 접두사 — **무효화 전용**.
   * `teamContacts()` 는 마지막 원소가 필터 객체라 prefix match 로 전체를 무효화할 수
   * 없다(위 `tournamentOperationsBoard` / `tournamentOperationsBoardAll` 과 같은 이유).
   */
  teamContactsAll: (teamId: string) => [...v1Keys.team(teamId), 'contacts'] as const,
  teamContact: (contactId: string) => [...v1Keys.all, 'team-contacts', contactId] as const,
  /**
   * 차단 목록 — 필터 인자가 없으므로 `teamContacts()` 와 달리 별도 `...All` 변형이
   * 필요 없다. 이 키 자체가 prefix match 로 무효화된다.
   */
  teamContactBlocks: (teamId: string) => [...v1Keys.team(teamId), 'contact-blocks'] as const,
  teamSchedules: (teamId: string, filters?: Record<string, unknown>) => [...v1Keys.team(teamId), 'schedules', filters ?? {}] as const,
  teamSchedule: (teamId: string, scheduleId: string) => [...v1Keys.team(teamId), 'schedules', scheduleId] as const,
  mySchedule: (filters?: Record<string, unknown>) => [...v1Keys.all, 'me', 'schedule', filters ?? {}] as const,
  teamMatchLineup: (teamMatchId: string) => [...v1Keys.teamMatch(teamMatchId), 'lineup'] as const,
  game: (gameId: string) => [...v1Keys.all, 'games', gameId] as const,
  gameResultRevisions: (gameId: string) => [...v1Keys.game(gameId), 'result-revisions'] as const,
  gameLineups: (gameId: string) => [...v1Keys.game(gameId), 'lineups'] as const,
  gameOperationsLineup: (gameId: string) => [...v1Keys.game(gameId), 'operations-lineup'] as const,
  fixtureLineupAccess: (tournamentId: string, fixtureId: string) =>
    [...v1Keys.all, 'tournaments', tournamentId, 'fixtures', fixtureId, 'lineup-access'] as const,
  fixtureLineupRoster: (tournamentId: string, fixtureId: string, sideId: string) =>
    [...v1Keys.all, 'tournaments', tournamentId, 'fixtures', fixtureId, 'lineup-roster', sideId] as const,
  myTournamentFixtures: (tournamentId: string) =>
    [...v1Keys.all, 'tournaments', tournamentId, 'my-fixtures'] as const,
  teamLineupHistory: (teamId: string) => [...v1Keys.team(teamId), 'lineup-history'] as const,
  teamLineupPresets: (teamId: string) => [...v1Keys.team(teamId), 'lineup-presets'] as const,
  lineupTodos: () => [...v1Keys.all, 'me', 'lineup-todos'] as const,
  reviews: (filters?: Record<string, unknown>) => [...v1Keys.all, 'reviews', filters ?? {}] as const,
  reviewSource: (sourceType: string, sourceId: string) => [...v1Keys.all, 'reviews', 'sources', sourceType, sourceId] as const,
  reviewsReceived: (filters?: Record<string, unknown>) => [...v1Keys.all, 'reviews', 'received', filters ?? {}] as const,
  reviewsReceivedSummary: (targetType: 'user' | 'team', period?: string) => [...v1Keys.all, 'reviews', 'received', 'summary', targetType, period ?? 'all'] as const,
  /** 공개 팀 후기 요약 — 로그인 사용자와 무관하게 팀 id 로만 캐시된다. */
  publicTeamReviews: (teamId: string) => [...v1Keys.all, 'teams', teamId, 'reviews'] as const,
  chatRooms: () => [...v1Keys.all, 'chat', 'rooms'] as const,
  chatRoom: (roomId: string) => [...v1Keys.chatRooms(), roomId] as const,
  chatMessages: (roomId: string) => [...v1Keys.chatRoom(roomId), 'messages'] as const,
  notificationsRoot: () => [...v1Keys.all, 'notifications'] as const,
  notifications: (filters?: Record<string, unknown>) => [...v1Keys.notificationsRoot(), filters ?? {}] as const,
  notificationUnreadSummary: () => [...v1Keys.notificationsRoot(), 'unread-summary'] as const,
  notificationPreferences: () => [...v1Keys.all, 'notification-preferences'] as const,
  recordConsent: () => [...v1Keys.all, 'me', 'record-consent'] as const,
  tournamentRealNameVisibility: () => [...v1Keys.all, 'me', 'tournament-real-name-visibility'] as const,
  inquiries: (filters?: Record<string, unknown>) => [...v1Keys.all, 'inquiries', filters ?? {}] as const,
  inquiry: (inquiryId: string) => [...v1Keys.all, 'inquiries', inquiryId] as const,
  profile: () => [...v1Keys.all, 'me', 'profile'] as const,
  publicProfile: (userId: string) => [...v1Keys.all, 'users', userId, 'public-profile'] as const,
  settings: () => [...v1Keys.all, 'me', 'settings'] as const,
  adminOverview: () => [...v1Keys.all, 'admin', 'overview'] as const,
  adminHubInbox: () => [...v1Keys.all, 'admin', 'hub', 'inbox'] as const,
  adminGlobalSearch: (q: string) => [...v1Keys.all, 'admin', 'search', q] as const,
  adminActionLogs: () => [...v1Keys.all, 'admin', 'action-logs'] as const,
  adminMe: () => [...v1Keys.all, 'admin', 'me'] as const,
  adminUsers: (filters?: Record<string, unknown>) => [...v1Keys.all, 'admin', 'users', filters ?? {}] as const,
  adminUser: (id: string) => [...v1Keys.all, 'admin', 'users', id] as const,
  adminMatches: (filters?: Record<string, unknown>) => [...v1Keys.all, 'admin', 'matches', filters ?? {}] as const,
  adminMatch: (id: string) => [...v1Keys.all, 'admin', 'matches', id] as const,
  adminTeamMatch: (teamMatchId: string) => [...v1Keys.all, 'admin', 'team-matches', teamMatchId] as const,
  adminTeams: (filters?: Record<string, unknown>) => [...v1Keys.all, 'admin', 'teams', filters ?? {}] as const,
  adminTeam: (id: string) => [...v1Keys.all, 'admin', 'teams', id] as const,
  adminPopups: (filters?: Record<string, unknown>) => [...v1Keys.all, 'admin', 'popups', filters ?? {}] as const,
  adminPopup: (id: string) => [...v1Keys.all, 'admin', 'popups', id] as const,
  adminNotices: (filters?: Record<string, unknown>) => [...v1Keys.all, 'admin', 'notices', filters ?? {}] as const,
  adminNotice: (id: string) => [...v1Keys.all, 'admin', 'notices', id] as const,
  adminTerms: (filters?: Record<string, unknown>) => [...v1Keys.all, 'admin', 'terms', filters ?? {}] as const,
  adminTermsPolicy: (id: string) => [...v1Keys.all, 'admin', 'terms', id] as const,
  adminInquiries: (filters?: Record<string, unknown>) => [...v1Keys.all, 'admin', 'inquiries', filters ?? {}] as const,
  adminInquiry: (id: string) => [...v1Keys.all, 'admin', 'inquiries', id] as const,
  adminInquiriesPendingCount: () => [...v1Keys.all, 'admin', 'inquiries', 'pending-count'] as const,
  adminReportedTeams: (limit?: number) => [...v1Keys.all, 'admin', 'reported-teams', limit ?? null] as const,
  adminTeamMatches: (filters?: Record<string, unknown>) => [...v1Keys.all, 'admin', 'team-matches', filters ?? {}] as const,
  adminStatusChangeLogs: (filters?: Record<string, unknown>) => [...v1Keys.all, 'admin', 'status-change-logs', filters ?? {}] as const,
  adminAdmins: (filters?: Record<string, unknown>) => [...v1Keys.all, 'admin', 'admins', filters ?? {}] as const,
  adminPushFailures: (filters?: { limit?: number }) => [...v1Keys.all, 'admin', 'push-failures', filters ?? {}] as const,
  adminSmsFailures: (filters?: { limit?: number }) => [...v1Keys.all, 'admin', 'sms-failures', filters ?? {}] as const,
  adminOpsSummary: () => [...v1Keys.all, 'admin', 'ops-summary'] as const,
  adminOperationFlag: (key: string) => [...v1Keys.all, 'admin', 'operation-flags', key] as const,
  adminOperationFlagsSimplifiedGateStatus: () =>
    [...v1Keys.all, 'admin', 'operation-flags', 'simplified-gate-status'] as const,
  tournaments: (filters?: Record<string, unknown>) => [...v1Keys.all, 'tournaments', filters ?? {}] as const,
  tournament: (id: string) => [...v1Keys.all, 'tournaments', id] as const,
  tournamentCampaigns: (filters?: Record<string, unknown>) => [...v1Keys.all, 'tournaments', 'campaigns', filters ?? {}] as const,
  tournamentCampaign: (slug: string) => [...v1Keys.all, 'tournaments', 'campaigns', slug] as const,
  tournamentRegistration: (tournamentId: string, registrationId: string) =>
    [...v1Keys.all, 'tournaments', tournamentId, 'registrations', registrationId] as const,
  myTournamentRegistration: (tournamentId: string) =>
    [...v1Keys.all, 'tournaments', tournamentId, 'my-registration'] as const,
  myTournamentRegistrations: (tournamentId: string) =>
    [...v1Keys.all, 'tournaments', tournamentId, 'my-registrations'] as const,
  tournamentPlayers: (tournamentId: string, registrationId: string) =>
    [...v1Keys.all, 'tournaments', tournamentId, 'registrations', registrationId, 'players'] as const,
  adminTournaments: (filters?: Record<string, unknown>) => [...v1Keys.all, 'admin', 'tournaments', filters ?? {}] as const,
  adminTournament: (id: string) => [...v1Keys.all, 'admin', 'tournaments', id] as const,
  adminLineupSizeOptions: (sportId: string) =>
    [...v1Keys.all, 'admin', 'competition-configs', 'lineup-size-options', sportId] as const,
  adminTournamentCampaign: (id: string) =>
    [...v1Keys.all, 'admin', 'tournaments', id, 'campaign'] as const,
  adminTournamentRegistrations: (tournamentId: string, filters?: Record<string, unknown>) =>
    [...v1Keys.all, 'admin', 'tournaments', tournamentId, 'registrations', filters ?? {}] as const,
  adminTournamentRoster: (registrationId: string) =>
    [...v1Keys.all, 'admin', 'registrations', registrationId, 'players'] as const,
  adminRosterEligibleMembers: (registrationId: string) =>
    [...v1Keys.all, 'admin', 'registrations', registrationId, 'eligible-players'] as const,
  adminTournamentBracket: (tournamentId: string) =>
    [...v1Keys.all, 'admin', 'tournaments', tournamentId, 'bracket'] as const,
  adminTournamentAnnouncements: (tournamentId: string) =>
    [...v1Keys.all, 'admin', 'tournaments', tournamentId, 'announcements'] as const,
  adminTournamentSponsors: (tournamentId: string) =>
    [...v1Keys.all, 'admin', 'tournaments', tournamentId, 'sponsors'] as const,
  adminLeagueMatchList: () => [...v1Keys.all, 'admin', 'league-matches'] as const,
  adminLeagueSeriesList: () => [...v1Keys.all, 'admin', 'league-series'] as const,
  adminLeagueSeries: (seriesId: string) => [...v1Keys.all, 'admin', 'league-series', seriesId] as const,
  adminLeagueSeriesPromotionPreview: (seriesId: string, seasonNo: number) =>
    [...v1Keys.all, 'admin', 'league-series', seriesId, 'seasons', seasonNo, 'promotions'] as const,
  adminLeagueMatch: (leagueId: string) => [...v1Keys.all, 'admin', 'league-matches', leagueId] as const,
  adminLeagueTeams: (leagueId: string) => [...v1Keys.all, 'admin', 'league-matches', leagueId, 'teams'] as const,
  // R5: 공개 리그 목록. leagueMatch(leagueId)와 같은 'league-matches' 네임스페이스를
  // 쓰지만 두 번째 세그먼트가 문자열(leagueId)이 아니라 filters 객체라 값이 절대 겹치지
  // 않는다 -- teamMatches(filters)/teamMatch(teamMatchId) 자매 쌍과 동일한 관례.
  leagueMatches: (filters?: Record<string, unknown>) => [...v1Keys.all, 'league-matches', filters ?? {}] as const,
  leagueMatch: (leagueId: string) => [...v1Keys.all, 'league-matches', leagueId] as const,
  // R4: 내 리그. leagueMatch(leagueId) 와 같은 네임스페이스지만 'me' 는 UUID 가 아니라
  // 실제 리그 id 와 절대 충돌하지 않는다.
  myLeagues: () => [...v1Keys.all, 'league-matches', 'me'] as const,
  leagueMatchStandings: (leagueId: string) => [...v1Keys.leagueMatch(leagueId), 'standings'] as const,
  leagueMatchPlayerRecords: (leagueId: string) => [...v1Keys.leagueMatch(leagueId), 'player-records'] as const,
  teamInvitations: (teamId: string) => [...v1Keys.all, 'teams', teamId, 'invitations'] as const,
  receivedInvitations: () => [...v1Keys.all, 'me', 'invitations'] as const,
  myJoinApplications: () => [...v1Keys.all, 'me', 'join-applications'] as const,
  adminIntegrationSettings: () => [...v1Keys.all, 'admin', 'integration-settings'] as const,
  adminReviewPolicySettings: () => [...v1Keys.all, 'admin', 'review-policy-settings'] as const,
  publicKakaoMapsKey: () => [...v1Keys.all, 'public', 'kakao-maps-key'] as const,
  // Task 21: live tournament operations console (fixture lineup + event backfill).
  // `game`은 위쪽에 이미 선언돼 있어 여기서 다시 정의하지 않는다 — 양쪽 브랜치가
  // 동일한 정의를 각각 추가해 머지 시 중복 키가 될 뻔했다.
  gameEvents: (gameId: string) => [...v1Keys.game(gameId), 'events'] as const,
  fixtureLineup: (tournamentId: string, fixtureId: string) =>
    [...v1Keys.all, 'tournament-ops', tournamentId, 'fixtures', fixtureId, 'lineup'] as const,
  tournamentOperationsBoard: (tournamentId: string, filters?: Record<string, unknown>) =>
    [...v1Keys.all, 'tournament-ops', tournamentId, 'operations', filters ?? {}] as const,
  /**
   * 필터를 뺀 보드 접두사 — **무효화 전용**.
   *
   * 보드 쿼리 키는 마지막 원소가 항상 필터 객체이고(`limit` 이 늘 들어가 비는 일이 없다),
   * `invalidateQueries` 는 접두사 일치라 `tournamentOperationsBoard(id)`(= 필터 `{}`)로는
   * 실제로 떠 있는 어떤 쿼리와도 안 맞아 **조용히 아무것도 무효화하지 않는다.**
   * 필터와 무관하게 보드를 다시 읽어야 하는 변경(경기장 배정 등)은 이 키를 쓴다.
   */
  tournamentOperationsBoardAll: (tournamentId: string) =>
    [...v1Keys.all, 'tournament-ops', tournamentId, 'operations'] as const,
  tournamentOperationsStaff: (tournamentId: string) =>
    [...v1Keys.all, 'tournament-ops', tournamentId, 'staff'] as const,
  /**
   * 스태프 배정 후보 검색. 검색어를 키에 포함해 타이핑마다 캐시가 갈리게 한다 —
   * 스태프 목록(tournamentOperationsStaff)의 하위 키로 두면 배정·해제 후의 목록
   * 무효화가 검색 결과까지 통째로 날려 버리므로 형제 키로 분리한다.
   */
  tournamentOperationsStaffCandidates: (tournamentId: string, query: string) =>
    [...v1Keys.all, 'tournament-ops', tournamentId, 'staff-candidates', query] as const,
  myTournamentStaffAssignments: () => [...v1Keys.all, 'me', 'tournament-staff'] as const,
  tournamentOperationsFields: (tournamentId: string) =>
    [...v1Keys.all, 'tournament-ops', tournamentId, 'fields'] as const,
  /** 내 스태프 배정(GET /tournament-ops/me/assignments) — identity 스코프라 `all` 접두사를 유지한다. */
  myTournamentOpsAssignments: () => [...v1Keys.all, 'tournament-ops', 'me', 'assignments'] as const,
};

// 로그인/회원가입 등 identity 전환 시 반드시 호출 — 캐시가 identity로 스코프되지 않아
// 이전 사용자 데이터(채팅방/알림 등)가 새 사용자에게 그대로 노출되는 것을 막는다.
export function clearV1IdentityCache(queryClient: QueryClient) {
  queryClient.removeQueries({ queryKey: v1Keys.all });
}
