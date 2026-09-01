'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useV1ApplyTeamMatch,
  useV1ApproveTeamMatchApplication,
  useV1CancelTeamMatch,
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
  useV1TeamMatches,
  useV1WithdrawTeamMatchApplication,
} from '@/hooks/use-v1-api';
import { trackEvent } from '@/lib/analytics';
import { chatRoomHref } from '@/lib/chat-route';
import { V1_LEVELS, levelRangeMatches, toLevelCodes, toggleLevelCode } from '@/lib/v1-levels';
import type { V1TeamMatch, V1TeamMatchApiStatus, V1TeamMatchViewerState } from '@/types/api';
import { extractErrorMessage } from '@/lib/error-message';
import { getCurrentRedirectPath, getLoginPathForRedirect } from '@/lib/session-storage';
// 호스트팀뿐 아니라 승인된 상대팀 매니저도 자기 사이드 라인업을 관리할 수 있다 — 이 판단은
// team-match-lineup.service.ts의 loadContext()와 완전히 동일한 규칙이라 그 규칙을 그대로
// 재현해둔 순수 함수를 라인업 모듈에서 재사용한다(새로 만들지 않음).
import { resolveOwnTeamId } from '@/app/team-matches/[id]/lineup/lineup.view-model';
import { TeamMatchDetailPageView, TeamMatchListPageView, TeamMatchStatePageView } from './team-matches-page';
import type { TeamMatchDetailViewModel, TeamMatchListViewModel, TeamMatchModel } from './team-matches.types';
import {
  getTeamMatchDetailViewModel,
  getTeamMatchListViewModel,
  getTeamMatchStateViewModel,
} from './team-matches.view-model';
import {
  buildSportChips,
  buildTeamMatchHref,
  formatDate,
  formatTime,
  getStatus,
  getViewerState,
  statusToCardStatus,
  toTeamMatch,
} from './team-matches.card-model';

export function TeamMatchListPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedSportId = searchParams.get('sportId') ?? undefined;
  const selectedSort = toTeamMatchSort(searchParams.get('sort'));
  const selectedView = toTeamMatchView(searchParams.get('view'));
  const selectedGenderRule = toGenderRuleFilter(searchParams.get('genderRule'));
  const selectedLevels = toLevelCodes(searchParams.get('levelCodes') ?? searchParams.get('levels'));
  const filterOpen = searchParams.get('filter') === '1';
  const activeFilterCount = countTeamMatchFilters(selectedSort, selectedGenderRule, selectedLevels);
  const initialQuery = searchParams.get('q') ?? '';
  const [searchValue, setSearchValue] = useState(initialQuery);
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery);
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    setSearchValue(initialQuery);
    setSubmittedQuery(initialQuery);
  }, [initialQuery]);
  const sportsQuery = useV1MasterSports();
  const teamMatchFilters = useMemo(() => {
    const filters: { sportId?: string; query?: string; sort?: 'recommended' | 'deadline' | 'latest'; view?: 'card' | 'compact'; genderRule?: string; levelCodes?: string } = {};
    if (selectedSportId) filters.sportId = selectedSportId;
    if (selectedGenderRule) filters.genderRule = selectedGenderRule;
    if (selectedLevels.length) filters.levelCodes = selectedLevels.join(',');
    if (submittedQuery.trim()) filters.query = submittedQuery.trim();
    if (selectedSort) filters.sort = selectedSort;
    if (selectedView !== 'card') filters.view = selectedView;
    return Object.keys(filters).length ? filters : undefined;
  }, [selectedGenderRule, selectedLevels, selectedSportId, selectedSort, selectedView, submittedQuery]);
  // 서버는 20건씩 커서 페이지네이션인데(team-matches.service.ts) 예전엔 이 화면이 단발
  // useQuery로 첫 페이지만 받아 21번째부터는 볼 방법이 없었다(감사 결함 — matches-client.tsx의
  // 같은 수정과 동일 패턴, league-matches-list-client.tsx의 "더 보기" 누적 방식을 따른다).
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
  const allQuery = useV1TeamMatches(allQueryFilters);
  const countFilters = useMemo(() => {
    const filters: { query?: string; genderRule?: string; levelCodes?: string } = {};
    if (selectedGenderRule) filters.genderRule = selectedGenderRule;
    if (selectedLevels.length) filters.levelCodes = selectedLevels.join(',');
    if (submittedQuery.trim()) filters.query = submittedQuery.trim();
    return Object.keys(filters).length ? filters : undefined;
  }, [selectedGenderRule, selectedLevels, submittedQuery]);
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

  if (query.isError) return <TeamMatchStatePageView model={getTeamMatchStateViewModel('error')} />;

  const base = getTeamMatchListViewModel();
  const pageItems = query.data?.items;
  const items: V1TeamMatch[] | undefined = pageItems === undefined
    ? undefined
    : cursor
      ? [...accumulated, ...pageItems.filter((item) => !accumulated.some((prev) => (prev.teamMatchId ?? prev.id) === (item.teamMatchId ?? item.id)))]
      : pageItems;
  const visibleItems = filterTeamMatchesByLevels(items, selectedLevels);
  const countItems = filterTeamMatchesByLevels((countFilters ? countQuery.data?.items ?? allQuery.data?.items : allQuery.data?.items) ?? items, selectedLevels);
  const hasNext = query.data?.pageInfo?.hasNext ?? false;
  const handleLoadMore = () => {
    if (!query.data?.pageInfo?.nextCursor || query.isFetching) return;
    setAccumulated(items ?? []);
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
        filterSheet: buildTeamMatchFilterSheet(searchParams, selectedSort, selectedView, selectedGenderRule, selectedLevels, filterOpen),
        sports: buildSportChips({
          base,
          params: searchParams,
          sports: sportsQuery.data,
          matches: countItems,
          selectedSportId,
        }),
        matches: visibleItems.map((item, index) => toTeamMatch(item, base.matches[index] ?? base.matches[0])),
        summary: { ...base.summary, count: visibleItems.length, today: visibleItems.length },
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
        filterSheet: buildTeamMatchFilterSheet(searchParams, selectedSort, selectedView, selectedGenderRule, selectedLevels, filterOpen),
        sports: buildSportChips({
          base,
          params: searchParams,
          sports: sportsQuery.data,
          matches: countItems,
          selectedSportId,
        }),
        matches: [],
        // #5: 로딩 중임을 명시 — 빈/로딩 구분
        isLoading: query.isLoading,
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

export function TeamMatchDetailPageClient({ teamMatchId }: { teamMatchId: string }) {
  const router = useRouter();
  const query = useV1TeamMatch(teamMatchId);
  const rawViewerState = query.data ? getViewerState(query.data) : 'none';
  const canManageHostTeam = query.data?.viewer?.manageableHostTeam === true;
  // 결과 승인 진입 게이트. `viewerState === 'approved'` 를 쓰면 안 된다 — 그건 신청서를
  // 낸 사람 한 명만 통과하는 값이라, 운영자가 대진을 만드는 리그전에서는 상대팀의 누구도
  // 승인 버튼을 보지 못했다. 서버는 이미 팀 멤버십으로 판정하므로 화면도 그것을 쓴다.
  const canManageOpponentTeam = query.data?.viewer?.manageableOpponentTeam === true;
  const viewerState = rawViewerState === 'host_team' && !canManageHostTeam ? 'none' : rawViewerState;
  // 후기 진입점 전용 — 위 `viewerState` 는 관리 권한 기준으로 좁혀진 값이라 쓸 수 없다.
  const isParticipantMember = query.data?.viewer?.participantMember === true;
  // guest = 비인증 사용자: viewerState가 'guest'이거나 query.data에 viewer.state='guest'로 내려오는 경우
  const isGuest = viewerState === 'guest';
  const eligibility = useV1TeamMatchEligibility(teamMatchId, undefined, { enabled: Boolean(query.data) && viewerState !== 'host_team' && !isGuest });
  // Request the server max (50) so applicant teams aren't hidden behind the default
  // page size of 20. One match seeks a single opponent, so applicant teams stay well
  // within a single page — no cursor pagination needed here.
  const applications = useV1TeamMatchApplications(teamMatchId, { limit: 50 }, { enabled: Boolean(query.data) && canManageHostTeam });
  const applyTeamMatch = useV1ApplyTeamMatch(teamMatchId);
  const approveApplication = useV1ApproveTeamMatchApplication(teamMatchId);
  const rejectApplication = useV1RejectTeamMatchApplication(teamMatchId);
  const closeTeamMatch = useV1CloseTeamMatch(teamMatchId);
  const reopenTeamMatch = useV1ReopenTeamMatch(teamMatchId);
  const cancelTeamMatch = useV1CancelTeamMatch(teamMatchId);
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
  const myTeamsQuery = useV1MyTeams();
  const ownTeamId = useMemo(() => resolveOwnTeamId(query.data, myTeamsQuery.data), [query.data, myTeamsQuery.data]);

  useEffect(() => {
    if (!query.data || !canOpenTeamMatchChat(canManageHostTeam, canManageOpponentTeam) || autoResolvedChatRef.current === teamMatchId) return;
    autoResolvedChatRef.current = teamMatchId;
    resolveChatRoom.mutate(
      { targetType: 'team_match', targetId: teamMatchId },
      // 이 자동 resolve는 조용히 실패해도 된다(다시 열면 재시도되고, 배너까지 띄우면
      // 페이지 진입만으로 매번 에러가 뜬다) — 그래도 삼키지 않고 로그는 남긴다.
      { onError: (e) => console.warn('team match chat auto-resolve failed', e) },
    );
  }, [query.data, resolveChatRoom, teamMatchId, canManageHostTeam, canManageOpponentTeam]);

  if (query.isError) return <TeamMatchStatePageView model={getTeamMatchStateViewModel('error')} />;

  const model: TeamMatchDetailViewModel = query.data
    ? {
        ...fallback,
        match: {
          ...fallback.match,
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
          hostTeamTrustState: query.data.hostTeam?.trustState ?? null,
          league: query.data.league ?? null,
          applicantActionError: actionError,
          manageHref: canManageHostTeam ? `/team-matches/${teamMatchId}/edit` : undefined,
          applicantTeams: toApplicantTeamsWithActions(
            query.data,
            applications.data,
            canManageHostTeam ? `/team-matches/${teamMatchId}/edit` : undefined,
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
        mode: toDetailMode(viewerState, getStatus(query.data)),
        applyLabel: applyLabel(viewerState, getStatus(query.data), selectedEligibility, isGuest, hasNoTeam, eligibility.isSuccess),
        applyPending: applyTeamMatch.isPending || withdrawTeamMatch.isPending,
        hostActions: canManageHostTeam
          ? buildHostActions({
              status: getStatus(query.data),
              // 리그 대진은 서버가 팀 단독 취소를 409 LEAGUE_FIXTURE_HOST_CANCEL_FORBIDDEN 으로
              // 거부한다(team-matches.service.ts cancel()) — 눌러서 실패를 봐야만 알 수 있게
              // 두지 않고 애초에 버튼을 노출하지 않는다.
              isLeagueFixture: Boolean(query.data.league),
              closeTeamMatch: () => closeTeamMatch.mutateAsync({ reason: 'host_closed_from_v1_web' }),
              reopenTeamMatch: () => reopenTeamMatch.mutateAsync({ reason: 'host_reopened_from_v1_web' }),
              cancelTeamMatch: () => cancelTeamMatch.mutateAsync({ reason: 'host_cancelled_from_v1_web' }),
              pending: closeTeamMatch.isPending || reopenTeamMatch.isPending || cancelTeamMatch.isPending,
            })
          : undefined,
        resultAction: buildResultAction(teamMatchId, getStatus(query.data), canManageHostTeam, canManageOpponentTeam),
        reviewAction: buildReviewAction(teamMatchId, getStatus(query.data), isParticipantMember),
        statusLabel: statusLabel(viewerState, getStatus(query.data)),
        chatLabel: chatLabel(canManageHostTeam, canManageOpponentTeam),
        chatPending: resolveChatRoom.isPending,
        chatError,
        onChat: canOpenTeamMatchChat(canManageHostTeam, canManageOpponentTeam)
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
        onNotify: () => router.push('/notifications'),
        lineupHref: ownTeamId ? `/team-matches/${teamMatchId}/lineup` : undefined,
        onApply: getApplyAction({
          viewerState,
          status: getStatus(query.data),
          selectedTeamId: selectedEligibility?.teamId,
          applicationId: selectedEligibility?.applicationId,
          eligible: selectedEligibility?.eligible,
          isGuest,
          hasNoTeam,
          apply: (teamId) =>
            applyTeamMatch.mutateAsync({ applicantTeamId: teamId, message: null }).then((result) => {
              trackEvent('team_match_apply_complete', { teamMatchId });
              return result;
            }),
          withdraw: () => withdrawTeamMatch.mutateAsync({ reason: 'applicant_team_withdrawn_from_v1_web' }),
          reasonCode: selectedEligibility?.reasonCode,
          redirectTo: (href) => router.push(href),
        }),
      }
    : fallback;

  return <TeamMatchDetailPageView model={model} />;
}


function buildTeamMatchFilterSheet(
  params: URLSearchParams,
  sort: NonNullable<TeamMatchListViewModel['filterSheet']>['sort'],
  view: NonNullable<TeamMatchListViewModel['filterSheet']>['view'],
  genderRule: NonNullable<TeamMatchListViewModel['filterSheet']>['genderRule'],
  levels: NonNullable<TeamMatchListViewModel['filterSheet']>['levels'],
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

  return {
    open,
    closeHref: buildTeamMatchHref(params, { filter: null }),
    resetHref: buildTeamMatchHref(params, { sort: null, view: null, genderRule: null, levelCodes: null, levels: null, filter: '1' }),
    applyHref: buildTeamMatchHref(params, { filter: null }),
    sort,
    view,
    genderRule,
    levels,
    sortOptions,
    genderOptions,
    levelOptions,
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

function filterTeamMatchesByLevels(matches: V1TeamMatch[] | undefined, levels: NonNullable<TeamMatchListViewModel['filterSheet']>['levels']) {
  if (!matches || levels.length === 0) return matches ?? [];
  return matches.filter((match) => levelRangeMatches(levels, match.minLevel?.code, match.maxLevel?.code, match.levelLabel));
}

function countTeamMatchFilters(
  sort: NonNullable<TeamMatchListViewModel['filterSheet']>['sort'],
  genderRule: NonNullable<TeamMatchListViewModel['filterSheet']>['genderRule'],
  levels: NonNullable<TeamMatchListViewModel['filterSheet']>['levels'],
) {
  return (sort ? 1 : 0) + (genderRule ? 1 : 0) + levels.length;
}

function toApplicantTeamsWithActions(
  match: V1TeamMatch,
  applications: import('@/types/api').V1TeamMatchApplicationsPage | undefined,
  manageHref: string | undefined,
  onApprove: (applicationId: string) => void,
  onReject: (applicationId: string) => void,
  actionPending: boolean,
): TeamMatchDetailViewModel['match']['applicantTeams'] {
  if (match.approvedOpponentTeam) {
    return [{ name: match.approvedOpponentTeam.name, meta: '승인된 상대팀', status: '승인 완료', href: manageHref, applicationId: match.approvedOpponentTeam.applicationId }];
  }

  if (applications?.items.length) {
    return applications.items.map((app) => ({
      name: app.applicantTeam.name,
      meta: `매너 ${app.applicantTeam.score?.toFixed(1) ?? '-'} · ${app.applicantTeam.matchCount}전`,
      status: app.status === 'requested' ? '승인 대기' : app.status === 'approved' ? '승인 완료' : app.status === 'rejected' ? '미승인' : app.status,
      href: manageHref,
      applicationId: app.applicationId,
      actionPending,
      onApprove: app.canApprove ? () => onApprove(app.applicationId) : undefined,
      onReject: app.canReject ? () => onReject(app.applicationId) : undefined,
    }));
  }

  // 아직 신청팀이 없거나(정말 0건) applications가 로딩 중이면 목업 신청팀 목록(fallback)으로
  // 채우지 않는다 — 실제로 신청한 적 없는 팀 이름이 화면에 뜨는 회귀였다. 빈 배열이면
  // team-matches-page.tsx가 신청팀 카드를 비워서 보여준다(별도 안내 문구 없음, .map() 결과만 없음).
  return [];
}


function toDetailMode(viewerState: V1TeamMatchViewerState, status: V1TeamMatchApiStatus): TeamMatchDetailViewModel['mode'] {
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
) {
  if (viewerState === 'host_team') return '매치 관리';
  if (viewerState === 'requested' || team?.reasonCode === 'ALREADY_REQUESTED') {
    // 라벨과 액션은 같은 `team`에서 나와야 한다(getApplyAction도 이 팀의 applicationId를 쓴다).
    // 여러 팀을 관리하는 사용자에게 "어느 팀 신청을 취소하는지"를 밝혀야 신청 CTA
    // (`${팀명}으로 신청`)와 대칭이 맞고, 라벨·액션이 갈렸는지도 화면에서 바로 드러난다.
    if (team?.applicationId) return `${team.name} 신청 취소`;
    // 철회 대상을 못 찾은 경우(예: 신청 당시 팀에서 운영진 자격을 잃어 eligibility 목록에서
    // 빠짐) 이 CTA는 아무것도 못 한다 — 비활성 버튼에 '신청 취소'라고 적어두면 "여기서
    // 취소된다"는 거짓 안내가 된다. 응답이 아직 안 왔으면 기존 문구를 유지해 깜빡임을 막는다.
    return eligibilityLoaded ? '팀 운영진만 취소할 수 있어요' : '신청 취소';
  }
  if (viewerState === 'approved') return '승인 완료';
  if (status !== 'recruiting') return '신청 불가';
  // 비인증 사용자: 로그인 유도 (#13)
  if (isGuest) return '로그인하고 신청하기';
  // 팀 없음: 팀 만들기 유도 (#13)
  if (hasNoTeam) return '팀 만들고 신청하기';
  if (team?.eligible) return `${team.name}으로 신청`;
  return reasonLabel(team?.reasonCode);
}

function statusLabel(viewerState: V1TeamMatchViewerState, status: V1TeamMatchApiStatus) {
  if (viewerState === 'host_team') return '내가 만든 팀매치';
  if (viewerState === 'requested') return '승인 대기';
  if (viewerState === 'approved') return '승인 완료';
  if (status === 'matched') return '상대팀 확정';
  // completed/cancelled를 뭉뚱그려 '신청 마감'이라 하면 이미 끝난 경기까지 "아직 신청받다
  // 막 닫혔다"는 인상을 준다 — guest가 완료된 리그 경기를 열어도 "모집 중"이 아니라 정확한
  // 상태가 보이게 한다(alpha 실측 C-1).
  if (status === 'completed') return '경기 종료';
  if (status === 'cancelled') return '매치 취소';
  if (status !== 'recruiting') return '신청 마감';
  return '신청 가능';
}

function chatLabel(canManageHostTeam: boolean, canManageOpponentTeam: boolean) {
  return canOpenTeamMatchChat(canManageHostTeam, canManageOpponentTeam) ? '채팅' : '승인 후 채팅';
}

/**
 * 서버 assertCanUseTeamMatchChat(chat.service.ts)과 정확히 같은 기준 — 양 팀
 * owner/manager. 예전엔 `viewerState === 'approved'` 를 썼는데, 그 값은 "신청서를 낸
 * 사람 한 명"만 통과한다. 리그 대진의 신청서는 운영자가 대신 내기 때문에(원정팀
 * appliedByUserId가 운영자로 남는다) 원정팀 owner/manager는 영원히 이 값을 얻지 못해
 * 채팅 버튼 자체가 안 보였다. manageableHostTeam/manageableOpponentTeam은 팀
 * 멤버십(owner/manager)만으로 판정해 서버 권한과 정확히 일치한다.
 */
function canOpenTeamMatchChat(canManageHostTeam: boolean, canManageOpponentTeam: boolean) {
  return canManageHostTeam || canManageOpponentTeam;
}

function buildHostActions({
  status,
  isLeagueFixture,
  closeTeamMatch,
  reopenTeamMatch,
  cancelTeamMatch,
  pending,
}: {
  status: V1TeamMatchApiStatus;
  isLeagueFixture: boolean;
  closeTeamMatch: () => Promise<unknown>;
  reopenTeamMatch: () => Promise<unknown>;
  cancelTeamMatch: () => Promise<unknown>;
  pending: boolean;
}): TeamMatchDetailViewModel['hostActions'] {
  // 리그 대진의 팀 단독 취소는 서버가 항상 409로 거부한다(team-matches.service.ts cancel(),
  // LEAGUE_FIXTURE_HOST_CANCEL_FORBIDDEN) — 모집 마감/재개는 leagueId 가드가 없어 그대로 둔다.
  const cancelAction: NonNullable<TeamMatchDetailViewModel['hostActions']>[number] = {
    label: '팀매치 취소',
    tone: 'danger',
    pending,
    onClick: cancelTeamMatch,
  };
  if (status === 'recruiting') {
    return [
      { label: '모집 마감', tone: 'neutral', pending, onClick: closeTeamMatch },
      ...(isLeagueFixture ? [] : [cancelAction]),
    ];
  }
  if (status === 'closed') {
    return [
      { label: '모집 재개', tone: 'primary', pending, onClick: reopenTeamMatch },
      ...(isLeagueFixture ? [] : [cancelAction]),
    ];
  }
  if (status === 'matched') {
    // Task 16 removed the standalone "complete" mutation — completion is now an
    // atomic side effect of the host submitting a validated result revision on
    // /team-matches/:id/result (see buildResultAction below), so cancel is the
    // only remaining direct mutation here.
    return isLeagueFixture ? [] : [cancelAction];
  }
  return [];
}

// Task 17: entry point into /team-matches/:id/result(/approval). Host drafts/submits
// the result; the opponent manager only ever approves or requests a change — never
// drafts or submits (see docs/api/domains/games.md's team_result_submit/opponent_result_decide
// actor split), so the two viewer roles get distinct destinations.
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
): TeamMatchDetailViewModel['resultAction'] {
  if (status !== 'matched' && status !== 'completed') return null;
  if (canManageHostTeam) {
    return {
      label: status === 'completed' ? '경기 결과 보기' : '경기 결과 입력',
      href: `/team-matches/${teamMatchId}/result`,
      tone: 'primary',
    };
  }
  if (canManageOpponentTeam) {
    return {
      label: status === 'completed' ? '경기 결과 확인/승인' : '경기 결과 대기',
      href: `/team-matches/${teamMatchId}/result/approval`,
      tone: status === 'completed' ? 'primary' : 'neutral',
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
  apply,
  withdraw,
  reasonCode,
  redirectTo,
}: {
  viewerState: V1TeamMatchViewerState;
  status: V1TeamMatchApiStatus;
  selectedTeamId?: string;
  applicationId?: string | null;
  eligible?: boolean;
  isGuest?: boolean;
  hasNoTeam?: boolean;
  apply: (teamId: string) => Promise<unknown>;
  withdraw: () => Promise<unknown>;
  reasonCode?: string;
  redirectTo: (href: string) => void;
}): (() => Promise<unknown>) | undefined {
  // 내 신청서가 이미 살아 있으면 이 CTA가 할 수 있는 일은 '철회' 하나뿐이다. 철회 대상을 못
  // 찾았다고 해서 아래 신청 분기로 흘려보내면 안 된다 — 종전 코드가 `&& applicationId`로 이
  // 분기를 탈락시켰고, 그 순간 사용자가 고른 적 없는 다른 팀으로 새 신청이 나갔다(그리고
  // 화면은 '신청을 취소했어요.'라고 알렸다). 아무것도 안 하는 쪽이 잘못된 신청보다 낫다.
  if (viewerState === 'requested' || reasonCode === 'ALREADY_REQUESTED') {
    return applicationId ? withdraw : undefined;
  }
  // 이미 마감/확정/종료/취소된 매치는 신청할 게 없다 — 여기서 끊지 않으면 guest/무팀 사용자가
  // applyLabel()엔 '신청 불가'로 뜨는데 onApply는 여전히 로그인·팀만들기 리다이렉트를 반환해서
  // 파란 primary 버튼이 "신청 불가"라고 적힌 채 클릭되면 로그인 페이지로 튀는 상태였다
  // (alpha 실측 C-1: 완료된 리그 경기를 guest로 열면 그런 버튼이 보였다).
  if (status !== 'recruiting') return undefined;
  if (eligible && selectedTeamId) return () => apply(selectedTeamId);
  // 비인증: 로그인 페이지로 이동하되, 보던 팀매치 상세로 복귀하도록 redirect 전파 (Copilot)
  if (isGuest) return async () => { redirectTo(getLoginPathForRedirect(getCurrentRedirectPath())); };
  // 팀 없음: 팀 만들기 페이지로 이동 (#13)
  if (hasNoTeam) return async () => { redirectTo('/teams/new'); };
  return undefined;
}

function reasonLabel(reasonCode?: string) {
  if (reasonCode === 'HOST_TEAM_CANNOT_APPLY') return '내가 만든 팀매치예요';
  // 종목이 다른 팀은 신청 자체가 막힌다(서버 SPORT_MISMATCH) — 팀 이름만으로는 종목이
  // 안 드러나는 경우가 많아 "팀을 만들고 신청할 수 있어요"로 떨어지면 이미 관리 중인 팀이
  // 있는데도 팀을 새로 만들라는 오해를 준다. 종목이 다르다는 걸 명시한다.
  if (reasonCode === 'SPORT_MISMATCH') return '이 팀매치와 종목이 다른 팀이에요';
  if (reasonCode === 'ALREADY_APPROVED') return '승인 완료';
  if (reasonCode === 'MATCHED_ALREADY') return '이미 상대팀이 정해진 매치예요';
  if (reasonCode === 'NOT_RECRUITING') return '신청 마감된 매치예요';
  // 팀이 없는 경우 → 팀 만들기 유도
  return '팀을 만들고 신청할 수 있어요';
}


