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
  const allQuery = useV1TeamMatches();
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
  const countFilters = useMemo(() => {
    const filters: { query?: string; genderRule?: string; levelCodes?: string } = {};
    if (selectedGenderRule) filters.genderRule = selectedGenderRule;
    if (selectedLevels.length) filters.levelCodes = selectedLevels.join(',');
    if (submittedQuery.trim()) filters.query = submittedQuery.trim();
    return Object.keys(filters).length ? filters : undefined;
  }, [selectedGenderRule, selectedLevels, submittedQuery]);
  const filteredQuery = useV1TeamMatches(
    teamMatchFilters,
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
  const items = query.data?.items;
  const visibleItems = filterTeamMatchesByLevels(items, selectedLevels);
  const countItems = filterTeamMatchesByLevels((countFilters ? countQuery.data?.items ?? allQuery.data?.items : allQuery.data?.items) ?? items, selectedLevels);
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
  const resolveChatRoom = useV1ResolveChatRoom();
  const autoResolvedChatRef = useRef<string | null>(null);
  const selectedEligibility = eligibility.data?.teams.find((team) => team.eligible) ?? eligibility.data?.teams[0] ?? null;
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
    if (!query.data || !canOpenTeamMatchChat(viewerState, getStatus(query.data)) || autoResolvedChatRef.current === teamMatchId) return;
    autoResolvedChatRef.current = teamMatchId;
    resolveChatRoom.mutate({ targetType: 'team_match', targetId: teamMatchId });
  }, [query.data, resolveChatRoom, teamMatchId, viewerState]);

  if (query.isError) return <TeamMatchStatePageView model={getTeamMatchStateViewModel('error')} />;

  const model: TeamMatchDetailViewModel = query.data
    ? {
        ...fallback,
        match: {
          ...fallback.match,
          ...toTeamMatch(query.data, fallback.match),
          description: query.data.description ?? query.data.descriptionPreview ?? fallback.match.description,
          address: query.data.place?.addressText ?? query.data.placeName ?? fallback.match.address,
          hostTeamHref: query.data.hostTeam?.teamId ? `/teams/${query.data.hostTeam.teamId}` : undefined,
          hostTeamId: query.data.hostTeam?.teamId ?? null,
          hostTeamLogoUrl: query.data.hostTeam?.logoUrl ?? null,
          hostTeamTrustState: query.data.hostTeam?.trustState ?? null,
          applicantActionError: actionError,
          manageHref: canManageHostTeam ? `/team-matches/${teamMatchId}/edit` : undefined,
          applicantTeams: toApplicantTeamsWithActions(
            query.data,
            applications.data,
            fallback.match.applicantTeams,
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
        applyLabel: applyLabel(viewerState, getStatus(query.data), selectedEligibility, isGuest, hasNoTeam),
        applyPending: applyTeamMatch.isPending || withdrawTeamMatch.isPending,
        hostActions: canManageHostTeam
          ? buildHostActions({
              status: getStatus(query.data),
              closeTeamMatch: () => closeTeamMatch.mutateAsync({ reason: 'host_closed_from_v1_web' }),
              reopenTeamMatch: () => reopenTeamMatch.mutateAsync({ reason: 'host_reopened_from_v1_web' }),
              cancelTeamMatch: () => cancelTeamMatch.mutateAsync({ reason: 'host_cancelled_from_v1_web' }),
              pending: closeTeamMatch.isPending || reopenTeamMatch.isPending || cancelTeamMatch.isPending,
            })
          : undefined,
        resultAction: buildResultAction(teamMatchId, viewerState, getStatus(query.data), canManageHostTeam),
        reviewAction: buildReviewAction(teamMatchId, getStatus(query.data), isParticipantMember),
        statusLabel: statusLabel(viewerState, getStatus(query.data)),
        chatLabel: chatLabel(viewerState, getStatus(query.data)),
        chatPending: resolveChatRoom.isPending,
        onChat: canOpenTeamMatchChat(viewerState, getStatus(query.data))
          ? () => resolveChatRoom.mutate(
              { targetType: 'team_match', targetId: teamMatchId },
              { onSuccess: (room) => router.push(chatRoomHref(room.roomId, room.route)) },
            )
          : undefined,
        onShare: () => shareTeamMatch(query.data),
        onNotify: () => router.push('/notifications'),
        lineupHref: ownTeamId ? `/team-matches/${teamMatchId}/lineup` : undefined,
        onApply: getApplyAction({
          viewerState,
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

// 경기조건은 구조화 필드(matchFormat/matchStyle/uniformColor, levelLabel)가 진실이다. `fallback`은
// 화면 스켈레톤용 하드코딩 목업(team-matches.view-model.ts)일 뿐 이 매치의 실제 조건이 아니므로
// grade/format/style/uniform에는 쓰지 않는다 — 실제 매치에 다른 매치의 목업 문구("A등급",
// "11:11" 등)를 그대로 노출하는 회귀였다(리뷰 지적).
//
// 백필 CLI 실행 전(구조화 컬럼 3종이 전부 비어 있는) 레거시 row는 서버가 만든 표시 전용 파생값인
// rulesText(formatMatchConditionsRulesText, team-matches.service.ts 참고 — 그 케이스에서는
// formatNote 원문을 그대로 담아 내려준다)를 style 한 칸에 그대로 보여준다. rulesText를 ' · '로
// 재-split해 grade/format/style/uniform 네 칸에 다시 배정하지는 않는다(예전 parseRules가 이
// 방식이었다) — 원래 저장 로직이 filter(Boolean)으로 빈 필드를 건너뛰고 이어붙여 위치를 보존하지
// 않았기 때문에 재분해는 값을 엉뚱한 칸에 잘못 배정할 수 있다(team-match-conditions-backfill.ts
// 문서 주석 참고, 동일한 근거). style 한 칸에 그대로 두면 값을 잃지도, 틀린 라벨을 붙이지도 않는다.
// exported for direct unit coverage (see team-matches-client.test.tsx) — a pure mapping
// function, cheaper to test directly than by plumbing new testids through the mocked
// page-view component tree.
export function toTeamMatch(match: V1TeamMatch, fallback: TeamMatchModel): TeamMatchModel {
  const status = statusToCardStatus(getStatus(match), getViewerState(match));
  const costs = parseCosts(match.costNote, fallback);
  const hasStructuredConditions = Boolean(match.matchFormat) || (match.matchStyle?.length ?? 0) > 0 || Boolean(match.uniformColor);
  const legacyNote = !hasStructuredConditions ? match.rulesText ?? '' : '';

  return {
    ...fallback,
    id: match.teamMatchId ?? match.id ?? fallback.id,
    title: match.title,
    imageUrl: match.imageUrl ?? fallback.imageUrl,
    sport: match.sport?.name ?? match.sportName ?? fallback.sport,
    hostTeam: match.hostTeam?.name ?? match.hostTeamName ?? fallback.hostTeam,
    venue: match.place?.name ?? match.placeName ?? fallback.venue,
    region: match.region?.name ?? match.regionName ?? fallback.region,
    date: formatDate(match.startsAt),
    time: formatTime(match.startsAt),
    endTime: match.endsAt ? formatTime(match.endsAt) : undefined,
    grade: match.levelLabel || '',
    format: match.matchFormat || '',
    style: match.matchStyle?.length ? match.matchStyle.join(' · ') : legacyNote,
    cost: costs.cost,
    opponentCost: costs.opponentCost,
    uniform: match.uniformColor || '',
    gender: match.genderRule ?? fallback.gender,
    status,
  };
}

function buildSportChips({
  base,
  params,
  sports,
  matches,
  selectedSportId,
}: {
  base: TeamMatchListViewModel;
  params: URLSearchParams;
  sports?: Array<{ id: string; name: string }>;
  matches: V1TeamMatch[];
  selectedSportId?: string;
}): TeamMatchListViewModel['sports'] {
  const fixedSports = sports?.length
    ? sports.slice(0, 4)
    : base.sports.slice(1, 5).map((sport) => ({ id: sport.label, name: sport.label }));

  return [
    {
      label: base.sports[0]?.label ?? '전체',
      count: matches.length,
      active: !selectedSportId,
      href: buildTeamMatchHref(params, { sportId: null, filter: null }),
    },
    ...fixedSports.map((sport) => ({
      label: sport.name,
      count: matches.filter((match) => {
        const matchSport = match.sport;
        return matchSport?.sportId === sport.id || matchSport?.name === sport.name || match.sportName === sport.name;
      }).length,
      active: selectedSportId === sport.id,
      href: buildTeamMatchHref(params, { sportId: sport.id, filter: null }),
    })),
  ];
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

function buildTeamMatchHref(params: URLSearchParams, overrides: Record<string, string | null>) {
  const next = new URLSearchParams(params.toString());
  Object.entries(overrides).forEach(([key, value]) => {
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
  });
  const queryString = next.toString();
  return queryString ? `/team-matches?${queryString}` : '/team-matches';
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
  fallback: TeamMatchDetailViewModel['match']['applicantTeams'],
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

  return fallback.map((team) => ({ ...team, href: manageHref }));
}

function getStatus(match: V1TeamMatch): V1TeamMatchApiStatus {
  return (match.displayState as V1TeamMatchApiStatus | undefined) ?? (match.status as V1TeamMatchApiStatus);
}

function getViewerState(match: V1TeamMatch): V1TeamMatchViewerState {
  return match.viewer?.state ?? match.viewerState ?? 'none';
}

function statusToCardStatus(status: V1TeamMatchApiStatus, viewerState: V1TeamMatchViewerState = 'none'): TeamMatchModel['status'] {
  if (viewerState === 'host_team') return 'mine';
  if (viewerState === 'requested') return 'pending';
  if (viewerState === 'approved') return 'approved';
  if (status === 'matched' || status === 'closed' || status === 'cancelled' || status === 'completed' || status === 'expired') return 'closed';
  return 'open';
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
) {
  if (viewerState === 'host_team') return '매치 관리';
  if (viewerState === 'requested' || team?.reasonCode === 'ALREADY_REQUESTED') return '신청 취소';
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
  if (status !== 'recruiting') return '신청 마감';
  return '신청 가능';
}

function chatLabel(viewerState: V1TeamMatchViewerState, status: V1TeamMatchApiStatus) {
  return canOpenTeamMatchChat(viewerState, status) ? '채팅' : '승인 후 채팅';
}

function canOpenTeamMatchChat(viewerState: V1TeamMatchViewerState, _status: V1TeamMatchApiStatus) {
  return viewerState === 'approved' || viewerState === 'host_team';
}

function buildHostActions({
  status,
  closeTeamMatch,
  reopenTeamMatch,
  cancelTeamMatch,
  pending,
}: {
  status: V1TeamMatchApiStatus;
  closeTeamMatch: () => Promise<unknown>;
  reopenTeamMatch: () => Promise<unknown>;
  cancelTeamMatch: () => Promise<unknown>;
  pending: boolean;
}): TeamMatchDetailViewModel['hostActions'] {
  if (status === 'recruiting') {
    return [
      { label: '모집 마감', tone: 'neutral', pending, onClick: closeTeamMatch },
      { label: '팀매치 취소', tone: 'danger', pending, onClick: cancelTeamMatch },
    ];
  }
  if (status === 'closed') {
    return [
      { label: '모집 재개', tone: 'primary', pending, onClick: reopenTeamMatch },
      { label: '팀매치 취소', tone: 'danger', pending, onClick: cancelTeamMatch },
    ];
  }
  if (status === 'matched') {
    // Task 16 removed the standalone "complete" mutation — completion is now an
    // atomic side effect of the host submitting a validated result revision on
    // /team-matches/:id/result (see buildResultAction below), so cancel is the
    // only remaining direct mutation here.
    return [{ label: '팀매치 취소', tone: 'danger', pending, onClick: cancelTeamMatch }];
  }
  return [];
}

// Task 17: entry point into /team-matches/:id/result(/approval). Host drafts/submits
// the result; the opponent manager only ever approves or requests a change — never
// drafts or submits (see docs/api/domains/games.md's team_result_submit/opponent_result_decide
// actor split), so the two viewer roles get distinct destinations.
function buildResultAction(
  teamMatchId: string,
  viewerState: V1TeamMatchViewerState,
  status: V1TeamMatchApiStatus,
  canManageHostTeam: boolean,
): TeamMatchDetailViewModel['resultAction'] {
  if (status !== 'matched' && status !== 'completed') return null;
  if (canManageHostTeam) {
    return {
      label: status === 'completed' ? '경기 결과 보기' : '경기 결과 입력',
      href: `/team-matches/${teamMatchId}/result`,
      tone: 'primary',
    };
  }
  if (viewerState === 'approved') {
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
 * 서버가 실제로 어떤 대상을 열어줄지(상대 팀 / 상대 선수)는 역할과 라인업에 따라 갈리지만,
 * 그 판정은 작성 화면이 /reviews/sources/... 로 직접 받는다 — 여기서 미리 흉내 내면 두 곳의
 * 규칙이 갈릴 때 조용히 어긋난다. 그래서 "참가팀 소속 + 경기 종료"까지만 보고 링크를 연다.
 */
/**
 * 후기 진입점은 **참가팀 소속**이면 연다 — 역할로 좁히지 않는다.
 *
 * 종전에는 `canManageHostTeam || viewerState === 'approved'` 였는데, 그 둘은 각각
 * "host 팀 owner/manager" 와 "신청서를 낸 사람 한 명"이라(team-matches.service.ts
 * getViewerState) 양 팀 일반 팀원 전원과 (매니저가 신청한 경우) 신청팀 owner 까지
 * 진입점을 잃었다. 서버는 두 팀의 active 멤버 전원에게 후기를 허용하므로
 * (reviews.service.ts resolveReviewerTeams) 화면도 같은 기준으로 연다.
 * 실제 작성 권한은 서버가 다시 판정하므로, 여기서 넓게 여는 쪽이 안전하다.
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
  if ((viewerState === 'requested' || reasonCode === 'ALREADY_REQUESTED') && applicationId) return withdraw;
  if (eligible && selectedTeamId) return () => apply(selectedTeamId);
  // 비인증: 로그인 페이지로 이동하되, 보던 팀매치 상세로 복귀하도록 redirect 전파 (Copilot)
  if (isGuest) return async () => { redirectTo(getLoginPathForRedirect(getCurrentRedirectPath())); };
  // 팀 없음: 팀 만들기 페이지로 이동 (#13)
  if (hasNoTeam) return async () => { redirectTo('/teams/new'); };
  return undefined;
}

function reasonLabel(reasonCode?: string) {
  if (reasonCode === 'HOST_TEAM_CANNOT_APPLY') return '내가 만든 팀매치예요';
  if (reasonCode === 'ALREADY_APPROVED') return '승인 완료';
  if (reasonCode === 'MATCHED_ALREADY') return '이미 상대팀이 정해진 매치예요';
  if (reasonCode === 'NOT_RECRUITING') return '신청 마감된 매치예요';
  // 팀이 없는 경우 → 팀 만들기 유도
  return '팀을 만들고 신청할 수 있어요';
}

function parseCosts(value: string | null | undefined, fallback: TeamMatchModel) {
  const amounts = value?.match(/\d[\d,]*/g)?.map((item) => Number(item.replace(/,/g, ''))) ?? [];
  return {
    cost: amounts[0] ?? fallback.cost,
    opponentCost: amounts[1] ?? fallback.opponentCost,
  };
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}
