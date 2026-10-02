'use client';

import { TeamMatchRecordEntry } from './team-match-shared-record';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useV1ApplyTeamMatch,
  useV1ApproveTeamMatchApplication,
  useV1CancelTeamMatch,
  useV1DeleteTeamMatch,
  useV1CloseTeamMatch,
  useV1MasterSports,
  useV1MyTeams,
  useV1RecentSearches,
  useV1RecordSearch,
  useV1RejectTeamMatchApplication,
  useV1ReopenTeamMatch,
  useV1ResolveChatRoom,
  useV1TeamMatch,
  useV1TeamMatchApplications,
  useV1TeamMatchEligibility,
  useV1TeamMatchLineup,
  useV1TeamMatches,
  useV1WithdrawTeamMatchApplication,
} from '@/hooks/use-v1-api';
import { trackEvent } from '@/lib/analytics';
import { chatRoomHref } from '@/lib/chat-route';
import { V1_LEVELS, levelRangeMatches, toLevelCodes, toggleLevelCode } from '@/lib/v1-levels';
import type { V1TeamMatch, V1TeamMatchApiStatus, V1TeamMatchViewerState } from '@/types/api';
import type { CursorListSeed } from '@/lib/public-list-seed';
import { extractErrorMessage } from '@/lib/error-message';
import { josa } from '@/lib/korean';
import { TEAM_MATCH_CANCELLED_LABEL, teamMatchApplicationStatusLabel } from '@/lib/v1-status-labels';
import { gameRosterScreenPath } from '@/lib/game-roster-routes';
import { getCurrentRedirectPath, getLoginPathForRedirect, sanitizeRedirectPath, withFromPath } from '@/lib/session-storage';
// 호스트팀뿐 아니라 승인된 상대팀 매니저도 자기 사이드 라인업을 관리할 수 있다 — 이 판단은
// team-match-lineup.service.ts의 loadContext()와 완전히 동일한 규칙이라 그 규칙을 그대로
// 재현해둔 순수 함수를 라인업 모듈에서 재사용한다(새로 만들지 않음).
import { resolveOwnTeamId } from '@/app/team-matches/[id]/lineup/lineup.view-model';
import { TEAM_MATCH_CANCEL_CONFIRM } from './team-match-cancel-confirm';
import { MatchLifecyclePanel } from '../matches/match-lifecycle-panel';
import { buildAttendanceSummary } from './team-match-attendance-summary';
import {
  buildNextAction,
  formatApplicationTime,
  pickDefaultApplyTeamId,
  readLastApplyTeamId,
  rememberApplyTeamId,
  teamMatchEditLockReason,
  teamRoleLabel,
  toApplicationHistory,
} from './team-match-next-step';
import { TeamMatchDetailPageSkeleton, TeamMatchDetailPageView, TeamMatchListPageView, TeamMatchStatePageView } from './team-matches-page';
import type { TeamMatchDetailViewModel, TeamMatchListViewModel, TeamMatchModel } from './team-matches.types';
import {
  getTeamMatchDetailViewModel,
  getTeamMatchListViewModel,
  getTeamMatchStateViewModel,
} from './team-matches.view-model';
import {
  buildSportChips,
  buildTeamMatchHref,
  getFriendlyTeamMatchSchedulePhase,
  getStatus,
  getViewerState,
  statusToCardStatus,
  sortTeamMatchesByAvailability,
  summarizeTeamMatches,
  toTeamMatch,
} from './team-matches.card-model';

export function TeamMatchListPageClient({ seed }: { readonly seed?: CursorListSeed<V1TeamMatch> } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedSportId = searchParams.get('sportId') ?? undefined;
  const selectedSort = toTeamMatchSort(searchParams.get('sort'));
  const selectedView = toTeamMatchView(searchParams.get('view'));
  const selectedGenderRule = toGenderRuleFilter(searchParams.get('genderRule'));
  const selectedLevels = toLevelCodes(searchParams.get('levelCodes') ?? searchParams.get('levels'));
  const selectedKind = toTeamMatchKind(searchParams.get('kind'));
  const filterOpen = searchParams.get('filter') === '1';
  const activeFilterCount = countTeamMatchFilters(selectedSort, selectedGenderRule, selectedLevels, selectedKind);
  const initialQuery = searchParams.get('q') ?? '';
  const [searchValue, setSearchValue] = useState(initialQuery);
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery);
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    setSearchValue(initialQuery);
    setSubmittedQuery(initialQuery);
  }, [initialQuery]);
  const sportsQuery = useV1MasterSports({ seed: seed?.sports });
  const teamMatchFilters = useMemo(() => {
    const filters: { sportId?: string; query?: string; sort?: 'recommended' | 'deadline' | 'latest'; view?: 'card' | 'compact'; genderRule?: string; levelCodes?: string; kind?: 'friendly' | 'competition' } = {};
    if (selectedSportId) filters.sportId = selectedSportId;
    if (selectedGenderRule) filters.genderRule = selectedGenderRule;
    if (selectedLevels.length) filters.levelCodes = selectedLevels.join(',');
    if (selectedKind) filters.kind = selectedKind;
    if (submittedQuery.trim()) filters.query = submittedQuery.trim();
    if (selectedSort) filters.sort = selectedSort;
    if (selectedView !== 'card') filters.view = selectedView;
    return Object.keys(filters).length ? filters : undefined;
  }, [selectedGenderRule, selectedLevels, selectedKind, selectedSportId, selectedSort, selectedView, submittedQuery]);
  // 서버는 20건씩 커서 페이지네이션인데(team-matches.service.ts) 예전엔 이 화면이 단발
  // useQuery로 첫 페이지만 받아 21번째부터는 볼 방법이 없었다(감사 결함 — matches-client.tsx의
  // 같은 수정과 동일 패턴, tournaments/tournaments-list-client.tsx 의 "더 보기" 누적 방식을 따른다).
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulated, setAccumulated] = useState<V1TeamMatch[]>([]);
  // matches-client.tsx와 동일한 이유로 useEffect가 아니라 렌더 중에 되감는다 — 안 그러면
  // "새 필터 + 이전 cursor"가 합쳐진 무효 요청이 한 번 나가는 중간 렌더가 생긴다.
  const teamMatchFiltersKey = teamMatchFilters ? JSON.stringify(teamMatchFilters) : '';
  const [pagedFiltersKey, setPagedFiltersKey] = useState(teamMatchFiltersKey);
  if (pagedFiltersKey !== teamMatchFiltersKey) {
    setPagedFiltersKey(teamMatchFiltersKey);
    setCursor(undefined);
    setAccumulated([]);
  }
  const allQueryFilters = useMemo(() => (!teamMatchFilters && cursor ? { cursor } : undefined), [teamMatchFilters, cursor]);
  const filteredQueryFilters = useMemo(
    () => (teamMatchFilters ? (cursor ? { ...teamMatchFilters, cursor } : teamMatchFilters) : undefined),
    [teamMatchFilters, cursor],
  );
  // matches-client.tsx 와 같다 — seed 는 cursor 없는 무필터 키에만 맞는다.
  const allQuery = useV1TeamMatches(allQueryFilters, { seed: allQueryFilters ? undefined : seed?.page });
  const countFilters = useMemo(() => {
    const filters: { query?: string; genderRule?: string; levelCodes?: string; kind?: 'friendly' | 'competition' } = {};
    if (selectedGenderRule) filters.genderRule = selectedGenderRule;
    if (selectedLevels.length) filters.levelCodes = selectedLevels.join(',');
    if (selectedKind) filters.kind = selectedKind;
    if (submittedQuery.trim()) filters.query = submittedQuery.trim();
    return Object.keys(filters).length ? filters : undefined;
  }, [selectedGenderRule, selectedLevels, selectedKind, submittedQuery]);
  const filteredQuery = useV1TeamMatches(
    filteredQueryFilters,
    { enabled: Boolean(teamMatchFilters) },
  );
  const countQuery = useV1TeamMatches(
    countFilters,
    { enabled: Boolean(countFilters) },
  );
  const recentSearches = useV1RecentSearches();
  const recordSearch = useV1RecordSearch();
  const query = teamMatchFilters ? filteredQuery : allQuery;

  if (query.isError) return <TeamMatchStatePageView model={{ ...getTeamMatchStateViewModel('error'), retry: () => void query.refetch() }} />;

  const base = getTeamMatchListViewModel();
  const pageItems = query.data?.items;
  const items: V1TeamMatch[] | undefined = pageItems === undefined
    ? undefined
    : cursor
      ? [...accumulated, ...pageItems.filter((item) => !accumulated.some((prev) => (prev.teamMatchId ?? prev.id) === (item.teamMatchId ?? item.id)))]
      : pageItems;
  const orderedItems = items ? sortTeamMatchesByAvailability(items) : undefined;
  const visibleItems = filterTeamMatchesByLevels(orderedItems, selectedLevels);
  const countPageItems = (countFilters ? countQuery.data?.items ?? allQuery.data?.items : allQuery.data?.items) ?? [];
  const countPageIds = new Set(countPageItems.map((item) => item.teamMatchId ?? item.id));
  const loadedMoreItems = selectedSportId ? [] : (items ?? []).filter((item) => !countPageIds.has(item.teamMatchId ?? item.id));
  const countItems = filterTeamMatchesByLevels(
    [...countPageItems, ...loadedMoreItems],
    selectedLevels,
  );
  const hasNext = query.data?.pageInfo?.hasNext ?? false;
  const handleLoadMore = () => {
    if (!query.data?.pageInfo?.nextCursor || query.isFetching) return;
    setAccumulated(orderedItems ?? []);
    setCursor(query.data.pageInfo.nextCursor);
  };
  const searchModel: NonNullable<TeamMatchListViewModel['search']> = {
    value: searchValue,
    placeholder: '지역, 팀 이름, 경기조건 검색',
    recentItems: (recentSearches.data?.items ?? []).slice(0, 5).map((item) => ({ id: item.id, query: item.query })),
    isOpen: searchOpen,
    isLoading: recentSearches.isLoading,
    onFocus: () => setSearchOpen(true),
    onBlur: () => setSearchOpen(false),
    onChange: setSearchValue,
    onSubmit: () => submitSearch(searchValue),
    onClear: clearSearch,
    onSelectRecent: (value) => {
      setSearchValue(value);
      submitSearch(value, { source: 'recent' });
    },
  };
  // 로딩 중(items === undefined)에는 mock matches를 렌더하지 않는다.
  // base.matches는 존재하지 않는 ID(team-match-1~4)를 가리켜, 로딩 중에 클릭하면 404로 이어진다.
  // #5: isLoading=true를 넘겨 TeamMatchListPageView가 EmptyState 대신 PageSkeleton을 렌더하게 한다.
  const model: TeamMatchListViewModel = items
    ? {
        ...base,
        query: submittedQuery,
        filterCount: activeFilterCount,
        search: searchModel,
        filterHref: buildTeamMatchHref(searchParams, { filter: '1' }),
        filterSheet: buildTeamMatchFilterSheet(searchParams, selectedSort, selectedView, selectedGenderRule, selectedLevels, selectedKind, filterOpen),
        sports: buildSportChips({
          base,
          params: searchParams,
          sports: sportsQuery.data,
          matches: countItems,
          selectedSportId,
        }),
        matches: visibleItems.map((item, index) => toTeamMatch(item, base.matches[index] ?? base.matches[0])),
        summary: summarizeTeamMatches(visibleItems),
        hasNext,
        onLoadMore: handleLoadMore,
        loadMorePending: query.isFetching,
      }
    : {
        ...base,
        query: submittedQuery,
        filterCount: activeFilterCount,
        search: searchModel,
        filterHref: buildTeamMatchHref(searchParams, { filter: '1' }),
        filterSheet: buildTeamMatchFilterSheet(searchParams, selectedSort, selectedView, selectedGenderRule, selectedLevels, selectedKind, filterOpen),
        sports: buildSportChips({
          base,
          params: searchParams,
          sports: sportsQuery.data,
          matches: countItems,
          selectedSportId,
        }),
        matches: [],
        // #5: 로딩 중임을 명시 — 빈/로딩 구분. isPending 인 이유는 matches-client.tsx 같은 자리.
        isLoading: query.isPending,
      };

  return <TeamMatchListPageView model={model} />;

  function submitSearch(value: string, options?: { source?: string }) {
    const nextQuery = value.trim();
    setSearchValue(nextQuery);
    setSubmittedQuery(nextQuery);
    setSearchOpen(false);
    updateTeamMatchUrl(nextQuery);
    if (nextQuery) {
      recordSearch.mutate({ query: nextQuery, filters: { domain: 'team-matches', source: options?.source ?? 'team-matches' } });
    }
  }

  function clearSearch() {
    setSearchValue('');
    setSubmittedQuery('');
    setSearchOpen(false);
    updateTeamMatchUrl('');
  }

  function updateTeamMatchUrl(nextQuery: string) {
    router.replace(buildTeamMatchHref(searchParams, { q: nextQuery || null, filter: null }), { scroll: false });
  }
}

/** matches-client.tsx 의 `seed` 와 같은 목적·같은 안전장치 — 자세한 근거는 그쪽 주석. */
export function TeamMatchDetailPageClient({ teamMatchId, seed }: { teamMatchId: string; seed?: V1TeamMatch | null }) {
  const router = useRouter();
  const query = useV1TeamMatch(teamMatchId, { seed });
  const recordParams = useSearchParams();
  // topBar:false라 셸 뒤로가기가 없다 — 페이지가 직접 그리는 모바일·데스크톱 링크
  // (team-matches-page.tsx)가 이 값을 쓴다. public-profile-client.tsx와 같은 `?from=` 패턴.
  const fromPath = sanitizeRedirectPath(recordParams.get('from'));
  // 하위 화면(수정·참석명단·결과)에서 돌아와도 처음 출처가 남도록, 받은 출처가 있을 때만 자기 URL 을 싣는다.
  const chainFrom = fromPath ? withFromPath(`/team-matches/${teamMatchId}`, fromPath) : null;
  const rawViewerState = query.data ? getViewerState(query.data) : 'none';
  const canManageHostTeam = query.data?.viewer?.manageableHostTeam === true;
  // 플랫폼이 생성한 모집은 HOME/AWAY 배정 뒤에도 운영 주체가 플랫폼이다.
  // HOME 팀 관리자는 참석명단·채팅·경기 기록에는 참여하지만 모집 수정/마감/취소와
  // 지원팀 승인 권한을 얻지 않는다.
  const canManageMatchListing = canManageHostTeam && query.data?.platformManaged !== true;
  // 결과 승인 진입 게이트. `viewerState === 'approved'` 를 쓰면 안 된다 — 그건 신청서를
  // 낸 사람 한 명만 통과하는 값이라, 운영자가 대진을 만드는 리그전에서는 상대팀의 누구도
  // 승인 버튼을 보지 못했다. 서버는 이미 팀 멤버십으로 판정하므로 화면도 그것을 쓴다.
  const canManageOpponentTeam = query.data?.viewer?.manageableOpponentTeam === true;
  // 채팅 게이트의 한 축 — 이 값이 있으면 상대가 확정된 것이다(types/api.ts 참조).
  const opponentAssigned = Boolean(query.data?.approvedOpponentTeam);
  // 서버는 취소된 매치의 채팅방을 열지도, 기존 방에 들어오지도 못하게 막는다(chat.service.ts
  // assertCanUseTeamMatchChat) — 버튼을 남기면 눌러서 409 를 봐야만 알게 된다.
  const isCancelled = query.data ? getStatus(query.data) === 'cancelled' : false;
  const chatAvailable = !isCancelled && canOpenTeamMatchChat(canManageHostTeam, canManageOpponentTeam, opponentAssigned);
  // platformManaged의 hostTeam은 경기 HOME 사이드일 뿐 모집 운영자가 아니다. 서버가
  // host_team을 내리지 않는 것이 정본이지만, API/Web 롤링 배포 중 구 응답이 남아도
  // "내가 만든 팀매치"/"매치 관리"가 다시 노출되지 않도록 화면에서도 방어한다.
  const viewerState =
    rawViewerState === 'host_team' && (!canManageHostTeam || query.data?.platformManaged === true)
      ? 'none'
      : rawViewerState;
  // 후기 진입점 전용 — 위 `viewerState` 는 관리 권한 기준으로 좁혀진 값이라 쓸 수 없다.
  const isParticipantMember = query.data?.viewer?.participantMember === true;
  // guest = 비인증 사용자: viewerState가 'guest'이거나 query.data에 viewer.state='guest'로 내려오는 경우
  const isGuest = viewerState === 'guest';
  const eligibility = useV1TeamMatchEligibility(teamMatchId, undefined, { enabled: Boolean(query.data?.viewer) && !query.isPlaceholderData && viewerState !== 'host_team' && !isGuest });
  // Request the server max (50) so applicant teams aren't hidden behind the default
  // page size of 20. One match seeks a single opponent, so applicant teams stay well
  // within a single page — no cursor pagination needed here.
  const applications = useV1TeamMatchApplications(teamMatchId, { limit: 50 }, { enabled: Boolean(query.data) && canManageMatchListing });
  const applyTeamMatch = useV1ApplyTeamMatch(teamMatchId);
  const approveApplication = useV1ApproveTeamMatchApplication(teamMatchId);
  const rejectApplication = useV1RejectTeamMatchApplication(teamMatchId);
  const closeTeamMatch = useV1CloseTeamMatch(teamMatchId);
  const reopenTeamMatch = useV1ReopenTeamMatch(teamMatchId);
  const cancelTeamMatch = useV1CancelTeamMatch(teamMatchId);
  const deleteTeamMatch = useV1DeleteTeamMatch(teamMatchId, () => router.replace('/team-matches'));
  const [actionError, setActionError] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const resolveChatRoom = useV1ResolveChatRoom();
  const autoResolvedChatRef = useRef<string | null>(null);
  // 히어로 CTA의 라벨·철회 대상·액션이 함께 나오는 **단일 근거**. 우선순위 자체가 규칙이다.
  // ① 내 신청서가 살아 있는 팀 — 이 팀은 ALREADY_REQUESTED라 항상 eligible=false다.
  //    종전엔 `find(t => t.eligible)`만 봐서 이 팀이 절대 선택될 수 없었고, 그래서 팀을 2개 이상
  //    관리하는 사용자에게는 라벨(viewerState='requested' → '신청 취소')과 액션(다른 팀)이 서로
  //    다른 팀을 가리켰다 — '신청 취소'를 누르면 고른 적 없는 팀으로 **새 신청**이 나갔다.
  // ② 신청 가능한 팀 — 신청 CTA의 대상.
  // ③ 둘 다 없으면 첫 팀 — 신청할 수 없는 사유(reasonLabel)를 보여주기 위한 자리다.
  const selectedEligibility =
    eligibility.data?.teams.find((team) => team.applicationId && team.reasonCode === 'ALREADY_REQUESTED')
    ?? eligibility.data?.teams.find((team) => team.eligible)
    ?? eligibility.data?.teams[0]
    ?? null;
  // 팀이 없는 경우: eligibility 로드 완료 후 teams 배열이 비어 있으면 소속 팀 없음 (#13)
  const hasNoTeam = !isGuest && eligibility.isSuccess && eligibility.data.teams.length === 0;
  const withdrawTeamMatch = useV1WithdrawTeamMatchApplication(teamMatchId, selectedEligibility?.applicationId);
  const fallback = getTeamMatchDetailViewModel();

  // 라인업 CTA(Task 15 blocker-3): 호스트팀 매니저뿐 아니라 승인된 상대팀 매니저도 자기
  // 사이드 라인업을 관리하므로, canManageHostTeam 하나만으로는 판단할 수 없다.
  // resolveOwnTeamId가 라인업 페이지 자체의 권한 판정과 동일한 규칙으로 "내 팀"을 고른다.
  const myTeamsQuery = useV1MyTeams(undefined, { enabled: canManageHostTeam || canManageOpponentTeam });
  const ownTeamId = useMemo(() => resolveOwnTeamId(query.data, myTeamsQuery.data), [query.data, myTeamsQuery.data]);
  // 진행 체크리스트의 "참석명단 제출" 칸 — 상대가 정해진 친선 팀매치에서 내 팀 명단 입구가 있을 때만 읽는다.
  const attendanceLineup = useV1TeamMatchLineup(teamMatchId, {
    enabled: Boolean(query.data) && !query.isPlaceholderData && !isCancelled && opponentAssigned && ownTeamId !== null && !query.data?.league,
  });

  useEffect(() => {
    if (!query.data || !chatAvailable || autoResolvedChatRef.current === teamMatchId) return;
    autoResolvedChatRef.current = teamMatchId;
    resolveChatRoom.mutate(
      { targetType: 'team_match', targetId: teamMatchId },
      // 이 자동 resolve는 조용히 실패해도 된다(다시 열면 재시도되고, 배너까지 띄우면
      // 페이지 진입만으로 매번 에러가 뜬다) — 그래도 삼키지 않고 로그는 남긴다.
      { onError: (e) => console.warn('team match chat auto-resolve failed', e) },
    );
  }, [query.data, resolveChatRoom, teamMatchId, chatAvailable]);

  if (query.isError) return <TeamMatchStatePageView model={{ ...getTeamMatchStateViewModel('error'), retry: () => void query.refetch(), backHref: fromPath ?? undefined }} />;

  // 데이터가 오기 전에는 하드코딩 목업(`fallback`)을 화면 전체로 렌더하지 않는다 —
  // 목업 제목·주소·참가자가 실제 값처럼 보여 사용자가 잘못 읽던 결함이었다.
  // `fallback` 은 아래에서 필드 단위 기본값으로만 쓴다.
  if (!query.data) {
    return <TeamMatchDetailPageSkeleton />;
  }

  // matches-client.tsx 와 같은 처리 — 목록 캐시에서 승계한 표시용 데이터로 그리는 동안은
  // 뷰어 상태·신청 팀 목록이 없으므로 상태 라벨과 행동 버튼을 잠근다.
  const seeding = query.isPlaceholderData;
  const isLeagueFixture = Boolean(query.data.league);
  const displayStatus = getStatus(query.data);
  // 수정·마감·재개는 서버 api status 로 판정한다 — displayState 는 신청 마감 시각이 지나면
  // 'closed' 로 보이지만 서버는 여전히 recruiting 으로 보고 재개를 409 로 거부한다.
  // V1TeamMatch 는 V1Match 의 status 타입을 물려받아 좁다 — getStatus() 와 같은 캐스트다.
  const apiStatus = query.data.status as V1TeamMatchApiStatus;
  const requestedCount = applications.data?.items.filter((item) => item.status === 'requested').length ?? 0;
  const approvedOpponent = query.data.approvedOpponentTeam ?? null;
  const lineupAction = isCancelled ? undefined : buildLineupAction(teamMatchId, ownTeamId, query.data.gameId ?? null, isLeagueFixture, chainFrom);
  const resultAction = seeding ? undefined : buildResultAction(teamMatchId, displayStatus, canManageHostTeam, canManageOpponentTeam, isLeagueFixture, chainFrom);
  const reviewAction = buildReviewAction(teamMatchId, displayStatus, isParticipantMember);
  const scheduleLabel = seeding ? null : modelScheduleLabel(query.data);
  const manageHref = canManageMatchListing ? withFromPath(`/team-matches/${teamMatchId}/edit`, chainFrom) : undefined;
  const lineupState = attendanceLineup.data?.state;
  const lineupSubmitted = lineupAction?.kind === 'attendance' && attendanceLineup.isSuccess ? lineupState === 'SUBMITTED' || lineupState === 'LOCKED' : null;
  // 진행 체크리스트는 자기 편을 아는 참가팀 팀장·매니저에게만 — 일반 팀원은 하단 바의 후기 입구로 충분하다.
  const progress: TeamMatchDetailViewModel['progress'] = !seeding && !isCancelled && approvedOpponent && (canManageHostTeam || canManageOpponentTeam)
    ? {
        opponentName: canManageHostTeam ? approvedOpponent.name : query.data.hostTeam?.name ?? query.data.hostTeamName ?? '홈팀',
        confirmedAtLabel: formatApplicationTime(applications.data?.items.find((item) => item.status === 'approved')?.reviewedAt),
        lineupSubmitted,
        lockNote: canManageMatchListing && apiStatus === 'matched' ? MATCHED_LOCK_NOTE : null,
        attendance: lineupAction?.kind === 'attendance' && attendanceLineup.data
          ? buildAttendanceSummary(teamMatchId, attendanceLineup.data, query.data.startsAt, Date.now())
          : null,
      }
    : undefined;
  const submitApplication = (teamId: string, message: string | null) =>
    applyTeamMatch.mutateAsync({ applicantTeamId: teamId, message }).then((result) => {
      trackEvent('team_match_apply_complete', { teamMatchId });
      rememberApplyTeamId(teamId);
      return result;
    });
  // N-1: 신청 가능한 팀이 2개 이상일 때만 팀을 고른다. 살아 있는 신청이 있으면 CTA 는 철회라 시트가 없다.
  const eligibleTeamCount = eligibility.data?.teams.filter((team) => team.eligible).length ?? 0;
  const defaultApplyTeamId = eligibility.data ? pickDefaultApplyTeamId(eligibility.data.teams, readLastApplyTeamId()) : null;
  const applyTeamPicker: TeamMatchDetailViewModel['applyTeamPicker'] = !seeding
    && eligibility.data
    && defaultApplyTeamId
    && eligibleTeamCount >= 2
    && displayStatus === 'recruiting'
    && viewerState !== 'requested'
    && selectedEligibility?.reasonCode !== 'ALREADY_REQUESTED'
    && !isParticipantMember
    ? {
        teams: eligibility.data.teams.map((team) => ({
          teamId: team.teamId,
          name: team.name,
          roleLabel: teamRoleLabel(team.role),
          eligible: team.eligible,
          reason: team.eligible ? null : reasonLabel(team.reasonCode),
        })),
        defaultTeamId: defaultApplyTeamId,
        submit: submitApplication,
      }
    : undefined;
  const editLockReason = teamMatchEditLockReason(apiStatus);

  const model: TeamMatchDetailViewModel = {
    ...fallback,
    match: {
      // `...fallback.match` 스프레드를 걷어냈다 — 확장 필드까지 전부 아래에서 채우므로
      // 목업이 남을 자리가 없다(남아 있으면 새 필드를 추가할 때 조용히 다시 샌다).
      ...toTeamMatch(query.data, fallback.match),
      // fallback.match.description/address는 로딩 스켈레톤(fallback 전체를 그대로 보여주는
      // 케이스)에서만 써야 하는 하드코딩 목업이다 — 실제 매치가 로드된 뒤 API가 값을 안 주면
      // ''로 둔다. 렌더 쪽(team-matches-page.tsx)이 falsy면 이미 섹션 자체를 숨긴다
      // (설명 카드: `{match.description ? ... : null}`, 주소: InfoRow의 `sub` optional 처리).
      description: query.data.description ?? query.data.descriptionPreview ?? '',
      address: query.data.place?.addressText ?? query.data.placeName ?? '',
      hostTeamHref: query.data.hostTeam?.teamId ? `/teams/${query.data.hostTeam.teamId}` : undefined,
      hostTeamId: query.data.hostTeam?.teamId ?? null,
      hostTeamLogoUrl: query.data.hostTeam?.logoUrl ?? null,
      hostTeamSportName: query.data.hostTeam?.sportName ?? null,
      hostTeamLevelLabel: query.data.hostTeam?.levelLabel ?? null,
      hostTeamRatingScore: query.data.hostTeam?.ratingScore ?? null,
      hostTeamWins: query.data.hostTeam?.wins ?? null,
      hostTeamTrustState: query.data.hostTeam?.trustState ?? null,
      league: query.data.league ?? null,
      applicantActionError: actionError,
      manageHref,
      applicantTeams: toApplicantTeamsWithActions(
        query.data,
        applications.data,
        (applicationId) => {
          setActionError(null);
          approveApplication.mutate(
            { applicationId },
            { onError: (e) => setActionError(extractErrorMessage(e, '승인 처리에 실패했어요. 다시 시도해 주세요.')) },
          );
        },
        (applicationId) => {
          setActionError(null);
          rejectApplication.mutate(
            { applicationId },
            { onError: (e) => setActionError(extractErrorMessage(e, '거절 처리에 실패했어요. 다시 시도해 주세요.')) },
          );
        },
        approveApplication.isPending || rejectApplication.isPending,
      ),
    },
    mode: toDetailMode(viewerState, displayStatus),
    detailBackHref: fromPath ?? '/team-matches',
    applyLabel: seeding
      ? '불러오는 중'
      : applyTeamPicker
        ? '신청하기'
        : applyLabel(viewerState, displayStatus, selectedEligibility, isGuest, hasNoTeam, eligibility.isSuccess, isParticipantMember),
    // matches-client.tsx 와 같은 이유 — '처리 중' 이 '불러오는 중' 을 덮어쓴다.
    applyPending: applyTeamMatch.isPending || withdrawTeamMatch.isPending,
    hostActions: !seeding && canManageMatchListing
      ? buildHostActions({
          status: apiStatus,
          requestedCount,
          opponentName: approvedOpponent?.name ?? null,
          // 리그 대진은 서버가 팀 단독 취소를 409 LEAGUE_FIXTURE_HOST_CANCEL_FORBIDDEN 으로
          // 거부한다(team-matches.service.ts cancel()) — 눌러서 실패를 봐야만 알 수 있게
          // 두지 않고 애초에 버튼을 노출하지 않는다.
          isLeagueFixture,
          closeTeamMatch: () => closeTeamMatch.mutateAsync({ reason: 'host_closed_from_v1_web' }),
          reopenTeamMatch: () => reopenTeamMatch.mutateAsync({ reason: 'host_reopened_from_v1_web' }),
          cancelTeamMatch: () => cancelTeamMatch.mutateAsync({ reason: 'host_cancelled_from_v1_web' }),
          // 보류 매치의 취소·삭제는 상세의 보류 결정 패널이 맡는다 — 메뉴에 같은 동작을 두 번 두지 않는다.
          deleteTeamMatch: query.data.lifecycle?.canDelete && apiStatus !== 'on_hold'
            ? () => deleteTeamMatch.mutateAsync()
            : undefined,
          pending: closeTeamMatch.isPending || reopenTeamMatch.isPending || cancelTeamMatch.isPending || deleteTeamMatch.isPending,
        })
      : undefined,
    // manageHref 는 모집을 운영하는 호스트에게만 있다(canManageMatchListing).
    manageMenu: !seeding && manageHref
      ? {
          edit: editLockReason ? { lockedReason: editLockReason } : { href: manageHref },
          history: toApplicationHistory(applications.data?.items ?? []),
        }
      : undefined,
    nextAction: seeding
      ? undefined
      : buildNextAction({
          cancelled: isCancelled,
          listingHost: canManageMatchListing,
          apiStatus,
          opponentAssigned,
          matchPhase: scheduleLabel !== null,
          completed: displayStatus === 'completed',
          manageHref,
          reopen: () => reopenTeamMatch.mutateAsync({ reason: 'host_reopened_from_v1_web' }),
          lineupAction,
          resultAction,
          reviewAction,
        }),
    progress,
    applicationsPending: canManageMatchListing && applications.isPending,
    applicationsError: canManageMatchListing && applications.isError
      ? { retry: () => { void applications.refetch(); } }
      : undefined,
    myApplicationTeam: viewerState === 'requested' && selectedEligibility?.applicationId
      ? { teamId: selectedEligibility.teamId, name: selectedEligibility.name }
      : null,
    // 진행 체크리스트와 같은 편 판정 — 호스트 팀도 관리하면 호스트 편이다.
    viewerOnApplicantSide: !canManageHostTeam && (canManageOpponentTeam || viewerState === 'approved'),
    applyTeamPicker,
    resultAction,
    reviewAction,
    ...(seeding ? { statusLabel: undefined, statusLabelKind: 'application' as const } : statusMeta({
      scheduleLabel,
      fallback: statusLabel(viewerState, displayStatus),
      listingHost: canManageMatchListing,
      displayStatus,
      opponentAssigned,
      requestedCount,
      progress,
      attendance: lineupAction?.kind === 'attendance',
    })),
    chatLabel: chatLabel(chatAvailable),
    chatPending: resolveChatRoom.isPending,
    chatError,
    onChat: !seeding && chatAvailable
      ? () => {
          setChatError(null);
          resolveChatRoom.mutate(
            { targetType: 'team_match', targetId: teamMatchId },
            {
              onSuccess: (room) => router.push(chatRoomHref(room.roomId, room.route)),
              onError: (e) => setChatError(extractErrorMessage(e, '채팅방을 열지 못했어요. 다시 시도해 주세요.')),
            },
          );
        }
      : undefined,
    onShare: () => shareTeamMatch(query.data),
    lineupAction,
    onApply: seeding ? undefined : getApplyAction({
      viewerState,
      status: displayStatus,
      selectedTeamId: selectedEligibility?.teamId,
      applicationId: selectedEligibility?.applicationId,
      eligible: selectedEligibility?.eligible,
      isGuest,
      hasNoTeam,
      isParticipantMember,
      apply: (teamId) => submitApplication(teamId, null),
      withdraw: () => withdrawTeamMatch.mutateAsync({ reason: 'applicant_team_withdrawn_from_v1_web' }),
      reasonCode: selectedEligibility?.reasonCode,
      sportId: query.data.sport?.sportId,
      redirectTo: (href) => router.push(href),
    }),
  };

  return <TeamMatchDetailPageView model={model} lifecyclePanel={!seeding && query.data.lifecycle && !query.data.league && apiStatus === 'on_hold' ? <MatchLifecyclePanel id={teamMatchId} domain="team-matches" status={getStatus(query.data)} lifecycle={query.data.lifecycle} canManage={Boolean(query.data.viewer?.manageableHostTeam && query.data.viewer?.manageRoute)} /> : undefined} recordEntry={query.data.gameId ? <TeamMatchRecordEntry teamMatchId={teamMatchId} detailOnly={recordParams.get('view') === 'detail'} fromHref={fromPath} /> : undefined} />;
}


function buildTeamMatchFilterSheet(
  params: URLSearchParams,
  sort: NonNullable<TeamMatchListViewModel['filterSheet']>['sort'],
  view: NonNullable<TeamMatchListViewModel['filterSheet']>['view'],
  genderRule: NonNullable<TeamMatchListViewModel['filterSheet']>['genderRule'],
  levels: NonNullable<TeamMatchListViewModel['filterSheet']>['levels'],
  kind: NonNullable<TeamMatchListViewModel['filterSheet']>['kind'],
  open: boolean,
): NonNullable<TeamMatchListViewModel['filterSheet']> {
  const sortOptions: NonNullable<TeamMatchListViewModel['filterSheet']>['sortOptions'] = [
    { label: '추천순', value: 'recommended', href: buildTeamMatchHref(params, { sort: sort === 'recommended' ? null : 'recommended', filter: '1' }), active: sort === 'recommended' },
    { label: '마감임박', value: 'deadline', href: buildTeamMatchHref(params, { sort: sort === 'deadline' ? null : 'deadline', filter: '1' }), active: sort === 'deadline' },
    { label: '최신순', value: 'latest', href: buildTeamMatchHref(params, { sort: sort === 'latest' ? null : 'latest', filter: '1' }), active: sort === 'latest' },
  ];
  const genderOptions: NonNullable<TeamMatchListViewModel['filterSheet']>['genderOptions'] = [
    { label: '성별 무관', value: '성별 무관', href: buildTeamMatchHref(params, { genderRule: genderRule === '성별 무관' ? null : '성별 무관', filter: '1' }), active: genderRule === '성별 무관' },
    { label: '남', value: '남', href: buildTeamMatchHref(params, { genderRule: genderRule === '남' ? null : '남', filter: '1' }), active: genderRule === '남' },
    { label: '여', value: '여', href: buildTeamMatchHref(params, { genderRule: genderRule === '여' ? null : '여', filter: '1' }), active: genderRule === '여' },
  ];
  const levelOptions: NonNullable<TeamMatchListViewModel['filterSheet']>['levelOptions'] = V1_LEVELS.map(({ code, label }) => ({
    label,
    value: code,
    href: buildTeamMatchHref(params, { levelCodes: toggleLevelCode(levels, code), levels: null, filter: '1' }),
    active: levels.includes(code),
  }));
  const kindOptions: NonNullable<TeamMatchListViewModel['filterSheet']>['kindOptions'] = [
    { label: '전체', value: '', href: buildTeamMatchHref(params, { kind: null, filter: '1' }), active: kind === '' },
    { label: '일반 팀매치', value: 'friendly', href: buildTeamMatchHref(params, { kind: kind === 'friendly' ? null : 'friendly', filter: '1' }), active: kind === 'friendly' },
    // API의 competition 필터는 leagueId가 있는 경기만 조회한다.
    { label: '정규 리그 경기', value: 'competition', href: buildTeamMatchHref(params, { kind: kind === 'competition' ? null : 'competition', filter: '1' }), active: kind === 'competition' },
  ];

  return {
    open,
    closeHref: buildTeamMatchHref(params, { filter: null }),
    resetHref: buildTeamMatchHref(params, { sort: null, view: null, genderRule: null, levelCodes: null, levels: null, kind: null, filter: '1' }),
    applyHref: buildTeamMatchHref(params, { filter: null }),
    sort,
    view,
    genderRule,
    levels,
    kind,
    sortOptions,
    genderOptions,
    levelOptions,
    kindOptions,
  };
}


function toTeamMatchSort(value: string | null): NonNullable<TeamMatchListViewModel['filterSheet']>['sort'] {
  if (value === 'recommended' || value === 'deadline' || value === 'latest') return value;
  return '';
}

function toTeamMatchView(value: string | null): NonNullable<TeamMatchListViewModel['filterSheet']>['view'] {
  return value === 'compact' ? 'compact' : 'card';
}

function toGenderRuleFilter(value: string | null): '' | '성별 무관' | '남' | '여' {
  if (value === '성별 무관' || value === '남' || value === '여') return value;
  return '';
}

function toTeamMatchKind(value: string | null): '' | 'friendly' | 'competition' {
  if (value === 'friendly' || value === 'competition') return value;
  return '';
}

function filterTeamMatchesByLevels(matches: V1TeamMatch[] | undefined, levels: NonNullable<TeamMatchListViewModel['filterSheet']>['levels']) {
  if (!matches || levels.length === 0) return matches ?? [];
  return matches.filter((match) => levelRangeMatches(levels, match.minLevel?.code, match.maxLevel?.code, match.levelLabel));
}

function countTeamMatchFilters(
  sort: NonNullable<TeamMatchListViewModel['filterSheet']>['sort'],
  genderRule: NonNullable<TeamMatchListViewModel['filterSheet']>['genderRule'],
  levels: NonNullable<TeamMatchListViewModel['filterSheet']>['levels'],
  kind: NonNullable<TeamMatchListViewModel['filterSheet']>['kind'],
) {
  return (sort ? 1 : 0) + (genderRule ? 1 : 0) + levels.length + (kind ? 1 : 0);
}

function toApplicantTeamsWithActions(
  match: V1TeamMatch,
  applications: import('@/types/api').V1TeamMatchApplicationsPage | undefined,
  onApprove: (applicationId: string) => void,
  onReject: (applicationId: string) => void,
  actionPending: boolean,
): TeamMatchDetailViewModel['match']['applicantTeams'] {
  if (match.approvedOpponentTeam) {
    const opponentStats = [
      match.approvedOpponentTeam.ratingScore == null
        ? null
        : `팀 평점 ${match.approvedOpponentTeam.ratingScore.toFixed(1)}`,
      match.approvedOpponentTeam.wins == null ? null : `${match.approvedOpponentTeam.wins}승`,
    ].filter((value): value is string => value !== null);
    return [{
      teamId: match.approvedOpponentTeam.teamId,
      name: match.approvedOpponentTeam.name,
      meta: opponentStats.join(' · '),
      status: '승인 완료',
      logoUrl: match.approvedOpponentTeam.logoUrl ?? null,
      sportName: match.approvedOpponentTeam.sportName ?? null,
      levelLabel: match.approvedOpponentTeam.levelLabel ?? null,
      trustState: match.approvedOpponentTeam.trustState ?? null,
      href: `/teams/${match.approvedOpponentTeam.teamId}`,
      applicationId: match.approvedOpponentTeam.applicationId,
      applicationStatus: 'approved',
    }];
  }

  if (applications?.items.length) {
    return applications.items.map((app) => ({
      teamId: app.applicantTeam.teamId,
      name: app.applicantTeam.name,
      meta: [
        app.applicantTeam.ratingScore == null ? null : `팀 평점 ${app.applicantTeam.ratingScore.toFixed(1)}`,
        `${app.applicantTeam.wins}승`,
      ].filter((value): value is string => value !== null).join(' · '),
      status: teamMatchApplicationStatusLabel(app.status),
      logoUrl: app.applicantTeam.logoUrl,
      sportName: app.applicantTeam.sportName,
      levelLabel: app.applicantTeam.levelLabel,
      trustState: app.applicantTeam.trustState,
      href: `/teams/${app.applicantTeam.teamId}`,
      applicationId: app.applicationId,
      applicationStatus: app.status,
      appliedByName: app.appliedBy.displayName,
      appliedAtLabel: formatApplicationTime(app.createdAt),
      message: app.message?.trim() || null,
      actionPending,
      onApprove: app.canApprove ? () => onApprove(app.applicationId) : undefined,
      onReject: app.canReject ? () => onReject(app.applicationId) : undefined,
    }));
  }

  // 0건·로딩 중·조회 실패 모두 빈 배열이다(목업 신청팀으로 채우지 않는다). 셋 중 무엇인지는
  // applicationsPending·applicationsError 가 가른다 — 빈 배열만 보고 "신청 없음"이라 하지 않는다.
  return [];
}


function toDetailMode(viewerState: V1TeamMatchViewerState, status: V1TeamMatchApiStatus): TeamMatchDetailViewModel['mode'] {
  // 취소는 뷰어 상태보다 우선한다 — cancel() 이 신청서를 그대로 두므로 viewerState 는
  // 취소 뒤에도 'host_team'/'approved' 로 남아 "참가 확정"·"매치 관리" 가 계속 보였다.
  if (status === 'cancelled') return 'cancelled';
  if (viewerState === 'host_team') return 'mine';
  if (viewerState === 'requested') return 'pending';
  if (viewerState === 'approved') return 'approved';
  return 'default';
}

function applyLabel(
  viewerState: V1TeamMatchViewerState,
  status: V1TeamMatchApiStatus,
  team?: { eligible: boolean; reasonCode: string; applicationId: string | null; name: string } | null,
  isGuest?: boolean,
  hasNoTeam?: boolean,
  /** eligibility 응답 도착 여부. 도착 전에는 "철회 대상을 못 찾았다"고 단정할 수 없다. */
  eligibilityLoaded?: boolean,
  /** 참가팀(host·승인 상대팀)의 active 멤버 — 신청할 대상이 아니라 자기 팀 경기를 보는 사람이다. */
  isParticipantMember?: boolean,
) {
  if (status === 'cancelled') return '취소된 팀매치예요';
  // 호스트의 하단 버튼은 보통 nextAction(매치 수정·모집 재개·참석명단 관리)이 그린다 — 이 라벨은 할 일이 없을 때의 상태다.
  if (viewerState === 'host_team') return status === 'expired' ? '경기 시간이 지났어요' : status === 'completed' ? '경기 종료' : '매치 수정';
  if (viewerState === 'requested' || team?.reasonCode === 'ALREADY_REQUESTED') {
    // 라벨과 액션은 같은 `team`에서 나와야 한다(getApplyAction도 이 팀의 applicationId를 쓴다).
    // 여러 팀을 관리하는 사용자에게 "어느 팀 신청을 취소하는지"를 밝혀야 신청 CTA
    // (`${팀명}으로 신청`)와 대칭이 맞고, 라벨·액션이 갈렸는지도 화면에서 바로 드러난다.
    if (team?.applicationId) return `${team.name} 신청 취소`;
    // 철회 대상을 못 찾은 경우(예: 신청 당시 팀에서 운영진 자격을 잃어 eligibility 목록에서
    // 빠짐) 이 CTA는 아무것도 못 한다 — 비활성 버튼에 '신청 취소'라고 적어두면 "여기서
    // 취소된다"는 거짓 안내가 된다. 응답이 아직 안 왔으면 기존 문구를 유지해 깜빡임을 막는다.
    return eligibilityLoaded ? '팀장·매니저만 취소할 수 있어요' : '신청 취소';
  }
  if (viewerState === 'approved') return '승인 완료';
  if (isParticipantMember) return OWN_TEAM_MATCH_LABEL;
  if (status !== 'recruiting') return '신청 불가';
  // 비인증 사용자: 로그인 유도 (#13)
  if (isGuest) return '로그인하고 신청하기';
  // 팀 없음: 팀 만들기 유도 (#13)
  if (hasNoTeam) return '팀 만들고 신청하기';
  if (team?.eligible) return `${josa(team.name, ['으로', '로'])} 신청`;
  return reasonLabel(team?.reasonCode);
}

const OWN_TEAM_MATCH_LABEL = '우리 팀 경기예요';

function statusLabel(viewerState: V1TeamMatchViewerState, status: V1TeamMatchApiStatus) {
  if (status === 'on_hold') return '보류';
  if (status === 'cancelled') return TEAM_MATCH_CANCELLED_LABEL;
  if (viewerState === 'host_team') return '내가 만든 팀매치';
  if (viewerState === 'requested') return '승인 대기';
  if (viewerState === 'approved') return '승인 완료';
  if (status === 'matched') return '상대팀 확정';
  // completed/cancelled를 뭉뚱그려 '신청 마감'이라 하면 이미 끝난 경기까지 "아직 신청받다
  // 막 닫혔다"는 인상을 준다 — guest가 완료된 리그 경기를 열어도 "모집 중"이 아니라 정확한
  // 상태가 보이게 한다(alpha 실측 C-1).
  if (status === 'completed') return '경기 종료';
  if (status !== 'recruiting') return '신청 마감';
  return '신청 가능';
}

const MATCHED_LOCK_NOTE = '시간·장소는 상대팀이 정해진 뒤에는 바꿀 수 없어요. 바꿔야 하면 채팅으로 상의해요.';

/**
 * 하단 바 상태 줄. 경기 진행 상태가 있으면 그것이 먼저고, 상대가 정해진 참가팀 운영진은 경기 준비를,
 * 모집 중인 호스트는 모집 상황(신청 수 포함)을 말한다. 나머지는 신청 흐름 라벨(statusLabel) 그대로다.
 */
function statusMeta({ scheduleLabel, fallback, listingHost, displayStatus, opponentAssigned, requestedCount, progress, attendance }: {
  scheduleLabel: string | null;
  fallback: string;
  listingHost: boolean;
  displayStatus: V1TeamMatchApiStatus;
  opponentAssigned: boolean;
  requestedCount: number;
  progress: TeamMatchDetailViewModel['progress'];
  attendance: boolean;
}): Pick<TeamMatchDetailViewModel, 'statusLabel' | 'statusLabelKind' | 'statusCaption'> {
  if (scheduleLabel) return { statusLabel: scheduleLabel, statusLabelKind: 'match' };
  if (progress) {
    if (displayStatus === 'completed') return { statusLabel: '경기 종료', statusLabelKind: 'match' };
    const submitted = attendance ? progress.lineupSubmitted : null;
    return {
      statusLabel: submitted === null ? '상대팀 확정' : submitted ? '참석명단 제출 완료' : '참석명단 제출 전',
      statusLabelKind: 'application',
      statusCaption: '경기 준비',
    };
  }
  if (listingHost && !opponentAssigned && displayStatus !== 'cancelled') {
    const label = displayStatus === 'recruiting'
      ? (requestedCount > 0 ? `모집 중 · 신청 ${requestedCount}팀` : '모집 중')
      : displayStatus === 'closed' ? '모집 마감' : displayStatus === 'expired' ? '모집 종료' : fallback;
    return { statusLabel: label, statusLabelKind: 'application', statusCaption: '모집 상태' };
  }
  return { statusLabel: fallback, statusLabelKind: 'application' };
}

function chatLabel(chatAvailable: boolean) {
  return chatAvailable ? '채팅' : '승인 후 채팅';
}

/**
 * 서버 assertCanUseTeamMatchChat(chat.service.ts)의 두 축을 미러링한다.
 *
 * ① **상대팀 확정** — 서버는 `hostTeamId`·`approvedApplicantTeamId` 가 둘 다 있어야
 *    허용한다. 이걸 빼면 상대 승인 전 상세에 들어가는 것만으로 채팅방 생성이 호출돼
 *    409 가 쌓인다. `approvedOpponentTeam` 이 있다는 것 자체가 상대 확정을 뜻한다.
 * ② **양 팀 owner/manager** — `viewerState === 'approved'` 는 "신청서를 낸 사람 한 명"만
 *    통과해서 쓸 수 없다. 리그 대진은 운영자가 신청서를 대신 내므로 원정팀 owner/manager
 *    가 그 값을 영영 못 얻어 채팅 버튼이 아예 안 보였다.
 *
 * 서버의 세 번째 축(`status ∈ {matched, completed}`)은 여기서 보지 않는다 — 프론트의
 * `getStatus` 는 `displayState` 우선이라 서버가 보는 DB `status` 와 같은 질문에 답하지
 * 않는다. 다만 취소(`cancelled`)는 두 값이 같으므로 호출부가 따로 걸러낸다(`chatAvailable`).
 */
function canOpenTeamMatchChat(
  canManageHostTeam: boolean,
  canManageOpponentTeam: boolean,
  opponentAssigned: boolean,
) {
  if (!opponentAssigned) return false;
  return canManageHostTeam || canManageOpponentTeam;
}

function buildHostActions({
  status,
  requestedCount,
  opponentName,
  isLeagueFixture,
  closeTeamMatch,
  reopenTeamMatch,
  cancelTeamMatch,
  deleteTeamMatch,
  pending,
}: {
  /** 서버 api status — close()/reopen() 이 보는 값과 같아야 눌러서 409 를 보지 않는다. */
  status: V1TeamMatchApiStatus;
  requestedCount: number;
  opponentName: string | null;
  isLeagueFixture: boolean;
  closeTeamMatch: () => Promise<unknown>;
  reopenTeamMatch: () => Promise<unknown>;
  cancelTeamMatch: () => Promise<unknown>;
  /** 지원 이력이 없어 삭제할 수 있을 때만 넘긴다. */
  deleteTeamMatch?: () => Promise<unknown>;
  pending: boolean;
}): TeamMatchDetailViewModel['hostActions'] {
  // 리그 대진의 팀 단독 취소는 서버가 항상 409로 거부한다(team-matches.service.ts cancel(),
  // LEAGUE_FIXTURE_HOST_CANCEL_FORBIDDEN) — 모집 마감/재개는 leagueId 가드가 없어 그대로 둔다.
  const cancelAction: NonNullable<TeamMatchDetailViewModel['hostActions']>[number] = {
    label: '팀매치 취소',
    description: opponentName ? `취소하면 ${opponentName}에 알림이 가요.` : '취소하면 되돌릴 수 없어요.',
    tone: 'danger',
    pending,
    confirm: TEAM_MATCH_CANCEL_CONFIRM,
    onClick: cancelTeamMatch,
  };
  const deleteAction: NonNullable<TeamMatchDetailViewModel['hostActions']>[number] | null = deleteTeamMatch
    ? {
        label: '팀매치 삭제',
        description: '지원 이력이 없는 팀매치라 목록에서 지워져요.',
        tone: 'danger',
        pending,
        confirm: { title: '팀매치를 삭제할까요?', message: '삭제하면 되돌릴 수 없어요.', confirmLabel: '팀매치 삭제', cancelLabel: '닫기' },
        onClick: deleteTeamMatch,
      }
    : null;
  const withDelete = (actions: NonNullable<TeamMatchDetailViewModel['hostActions']>) => (deleteAction ? [...actions, deleteAction] : actions);
  if (status === 'recruiting') {
    // 마감하면 서버가 대기 신청을 전부 expired 로 끝낸다(close()) — 끝나는 팀이 있을 때만 확인한다.
    const closeConfirm = requestedCount > 0
      ? {
          title: '모집을 마감할까요?',
          message: `대기 중인 신청 ${requestedCount}팀이 종료되고 알림이 가요. 마감한 뒤에도 모집을 다시 열 수 있어요.`,
          confirmLabel: '모집 마감',
          cancelLabel: '닫기',
          tone: 'default' as const,
        }
      : undefined;
    return withDelete([
      {
        label: '모집 마감',
        description: requestedCount > 0 ? `대기 중인 신청 ${requestedCount}팀이 종료돼요.` : '더 이상 신청을 받지 않아요.',
        tone: 'neutral',
        pending,
        confirm: closeConfirm,
        onClick: closeTeamMatch,
      },
      ...(isLeagueFixture ? [] : [cancelAction]),
    ]);
  }
  if (status === 'on_hold') return [];
  if (status === 'closed') {
    return withDelete([
      { label: '모집 재개', description: '다시 신청을 받아요.', tone: 'primary', pending, onClick: reopenTeamMatch },
      ...(isLeagueFixture ? [] : [cancelAction]),
    ]);
  }
  if (status === 'matched') {
    // Task 16 removed the standalone "complete" mutation — completion is now an
    // atomic side effect of the host submitting a validated result revision on
    // /team-matches/:id/result (see buildResultAction below), so cancel is the
    // only remaining direct mutation here.
    return isLeagueFixture ? [] : [cancelAction];
  }
  // cancelled·expired — 취소된 매치를 지우는 것이 남은 유일한 관리 동작이다.
  return withDelete([]);
}

function buildLineupAction(
  teamMatchId: string,
  ownTeamId: string | null,
  gameId: string | null,
  isLeagueFixture: boolean,
  chainFrom: string | null,
): TeamMatchDetailViewModel['lineupAction'] {
  if (ownTeamId === null) return undefined;
  if (!isLeagueFixture) {
    return { kind: 'attendance', href: withFromPath(`/team-matches/${teamMatchId}/lineup`, chainFrom) };
  }
  // 리그 대진의 참석명단 저장은 서버가 409(ROSTER_MANAGED_BY_ADJUSTMENTS)로 막는다.
  if (gameId === null) return undefined;
  return { kind: 'match-roster', href: withFromPath(gameRosterScreenPath(ownTeamId, gameId), chainFrom) };
}

// Task 17: entry point into /team-matches/:id/result(/approval). 친선 팀매치에서만
// 호스트가 작성·제출하고 상대팀 매니저는 승인·정정요청만 한다(docs/api/domains/games.md 의
// team_result_submit/opponent_result_decide 액터 분리) — 그래서 두 역할의 목적지가 갈린다.
//
// **리그 대진은 이 분리 자체가 없다.** 결과는 운영자가 콘솔에서 넣고 어드민이 확인한다
// (정본 §4). 서버는 참가팀의 제출·승인을 둘 다 403 으로 막으므로(games.service.ts
// regularLeagueResultAction) 두 역할 모두 열람 CTA 하나만 받는다.
//
// 두 게이트 모두 **팀 멤버십**(viewer.manageableHostTeam / manageableOpponentTeam)을 본다.
// 예전엔 상대팀 쪽만 `viewerState === 'approved'` 를 봤는데, 그 값은 신청서를 낸 사람
// 한 명에게만 붙는다 — 리그 대진은 운영자가 신청서를 대신 만들기 때문에 상대팀의 owner도
// manager도 승인 화면에 닿지 못했고, 결과가 SUBMITTED 에서 멈춰 순위표가 영영 갱신되지
// 않았다(alpha 실측). 일반 팀매치에서도 "신청한 사람 말고 다른 매니저"가 같은 이유로 막혀
// 있었다. 서버 권한(games.service.ts resolveActor)이 처음부터 멤버십 기준이라 이쪽이 정답이다.
function buildResultAction(
  teamMatchId: string,
  status: V1TeamMatchApiStatus,
  canManageHostTeam: boolean,
  canManageOpponentTeam: boolean,
  isLeagueFixture: boolean,
  chainFrom: string | null = null,
): TeamMatchDetailViewModel['resultAction'] {
  if (status !== 'matched' && status !== 'completed') return null;
  if (isLeagueFixture) {
    if (!canManageHostTeam && !canManageOpponentTeam) return null;
    // 양쪽 진입점이 같은 읽기 전용 화면으로 합류하므로(/result/approval 도 마찬가지)
    // 상대팀을 approval 경로로 돌리는 건 의미 없는 우회다.
    return { label: '경기 결과 보기', href: withFromPath(`/team-matches/${teamMatchId}/result`, chainFrom) };
  }
  if (canManageHostTeam) {
    return {
      label: status === 'completed' ? '경기 결과 보기' : '경기 기록 보기',
      href: withFromPath(`/team-matches/${teamMatchId}/result`, chainFrom),
    };
  }
  if (canManageOpponentTeam) {
    return {
      label: status === 'completed' ? '경기 결과 보기' : '경기 기록 보기',
      href: withFromPath(`/team-matches/${teamMatchId}/result/approval`, chainFrom),
    };
  }
  return null;
}

/**
 * 경기가 끝난 뒤 후기 작성 화면으로 가는 진입점.
 *
 * 게이트는 **참가팀 소속 + 경기 종료**까지만 본다 — 역할로 좁히지 않는다.
 * 종전에는 `canManageHostTeam || viewerState === 'approved'` 였는데, 그 둘은 각각
 * "host 팀 owner/manager" 와 "신청서를 낸 사람 한 명"이라(team-matches.service.ts
 * getViewerState) 양 팀 일반 팀원 전원과 (매니저가 신청한 경우) 신청팀 owner 까지
 * 진입점을 잃었다. 서버는 두 팀의 active 멤버 전원에게 후기를 허용한다
 * (reviews.service.ts resolveReviewerTeams).
 *
 * 서버가 실제로 어떤 대상을 열어줄지(상대 팀 / 상대 선수)는 역할과 라인업에 따라 갈리지만,
 * 그 판정은 작성 화면이 /reviews/sources/... 로 직접 받는다 — 여기서 미리 흉내 내면 두 곳의
 * 규칙이 갈릴 때 조용히 어긋난다. 실제 작성 권한은 서버가 다시 판정하므로, 화면은 같은
 * 기준으로 넓게 여는 쪽이 안전하다.
 */
function buildReviewAction(
  teamMatchId: string,
  status: V1TeamMatchApiStatus,
  participantMember: boolean,
): TeamMatchDetailViewModel['reviewAction'] {
  if (status !== 'completed') return null;
  if (!participantMember) return null;
  return { label: '후기 남기기', href: `/my/reviews/team_match/${teamMatchId}` };
}

async function shareTeamMatch(match: V1TeamMatch) {
  const title = match.title;
  const path = `/team-matches/${match.teamMatchId ?? match.id}`;
  const url = typeof window === 'undefined' ? path : new URL(path, window.location.origin).toString();

  if (navigator.share) {
    try {
      await navigator.share({ title, url });
    } catch (err) {
      // AbortError: user dismissed the native share sheet — not an error
      if (err instanceof Error && err.name === 'AbortError') return;
      throw err;
    }
    return;
  }

  await navigator.clipboard?.writeText(url);
}

function getApplyAction({
  viewerState,
  status,
  selectedTeamId,
  applicationId,
  eligible,
  isGuest,
  hasNoTeam,
  isParticipantMember,
  apply,
  withdraw,
  reasonCode,
  sportId,
  redirectTo,
}: {
  viewerState: V1TeamMatchViewerState;
  status: V1TeamMatchApiStatus;
  selectedTeamId?: string;
  applicationId?: string | null;
  eligible?: boolean;
  isGuest?: boolean;
  hasNoTeam?: boolean;
  isParticipantMember?: boolean;
  apply: (teamId: string) => Promise<unknown>;
  withdraw: () => Promise<unknown>;
  reasonCode?: string;
  sportId?: string;
  redirectTo: (href: string) => void;
}): (() => Promise<unknown>) | undefined {
  // 취소된 매치에는 신청도 철회도 없다 — 신청서가 살아 있어도 아래 철회 분기로 흘리지 않는다.
  if (status === 'cancelled') return undefined;
  // 내 신청서가 이미 살아 있으면 이 CTA가 할 수 있는 일은 '철회' 하나뿐이다. 철회 대상을 못
  // 찾았다고 해서 아래 신청 분기로 흘려보내면 안 된다 — 종전 코드가 `&& applicationId`로 이
  // 분기를 탈락시켰고, 그 순간 사용자가 고른 적 없는 다른 팀으로 새 신청이 나갔다(그리고
  // 화면은 '신청을 취소했어요.'라고 알렸다). 아무것도 안 하는 쪽이 잘못된 신청보다 낫다.
  if (viewerState === 'requested' || reasonCode === 'ALREADY_REQUESTED') {
    return applicationId ? withdraw : undefined;
  }
  // 자기 팀 경기에는 신청할 대상이 없다 — 라벨(OWN_TEAM_MATCH_LABEL)과 같은 근거로 끊는다.
  if (isParticipantMember) return undefined;
  // 이미 마감/확정/종료/취소된 매치는 신청할 게 없다 — 여기서 끊지 않으면 guest/무팀 사용자가
  // applyLabel()엔 '신청 불가'로 뜨는데 onApply는 여전히 로그인·팀만들기 리다이렉트를 반환해서
  // 파란 primary 버튼이 "신청 불가"라고 적힌 채 클릭되면 로그인 페이지로 튀는 상태였다
  // (alpha 실측 C-1: 완료된 리그 경기를 guest로 열면 그런 버튼이 보였다).
  if (status !== 'recruiting') return undefined;
  if (eligible && selectedTeamId) return () => apply(selectedTeamId);
  // 비인증: 로그인 페이지로 이동하되, 보던 팀매치 상세로 복귀하도록 redirect 전파 (Copilot)
  if (isGuest) return async () => { redirectTo(getLoginPathForRedirect(getCurrentRedirectPath())); };
  // 팀 없음: 팀 만들기로 보내되 이 팀매치 주소를 넘긴다(#13) — 만든 뒤 돌아와 새 팀으로 바로 신청한다.
  // 종목도 이 경기 종목으로 채운다: 다른 종목 팀은 SPORT_MISMATCH 라 돌아와도 고를 수 없다.
  if (hasNoTeam) {
    const createPath = sportId ? `/teams/new?sportId=${encodeURIComponent(sportId)}` : '/teams/new';
    return async () => { redirectTo(withFromPath(createPath, getCurrentRedirectPath())); };
  }
  return undefined;
}

function reasonLabel(reasonCode?: string) {
  if (reasonCode === 'HOST_TEAM_CANNOT_APPLY') return '내가 만든 팀매치예요';
  // 종목이 다른 팀은 신청 자체가 막힌다(서버 SPORT_MISMATCH) — 팀 이름만으로는 종목이
  // 안 드러나는 경우가 많아 "팀을 만들고 신청할 수 있어요"로 떨어지면 이미 관리 중인 팀이
  // 있는데도 팀을 새로 만들라는 오해를 준다. 종목이 다르다는 걸 명시한다.
  if (reasonCode === 'SPORT_MISMATCH') return '이 팀매치와 종목이 다른 팀이에요';
  if (reasonCode === 'ALREADY_APPROVED') return '승인 완료';
  if (reasonCode === 'ALREADY_REQUESTED') return '이미 신청한 팀이에요';
  if (reasonCode === 'ALREADY_REQUESTED_WITH_ANOTHER_TEAM') return '다른 팀으로 이미 신청했어요';
  if (reasonCode === 'MATCHED_ALREADY') return '이미 상대팀이 정해진 매치예요';
  if (reasonCode === 'NOT_RECRUITING') return '신청 마감된 매치예요';
  // 팀이 없는 경우 → 팀 만들기 유도
  return '팀을 만들고 신청할 수 있어요';
}

function modelScheduleLabel(match: V1TeamMatch) {
  const phase = getFriendlyTeamMatchSchedulePhase(match);
  if (phase === 'completion_pending') return '종료 확인 중';
  if (phase === 'live') return '진행 중';
  return null;
}
