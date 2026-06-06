'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  useV1ApplyTeamMatch,
  useV1MasterSports,
  useV1RecentSearches,
  useV1RecordSearch,
  useV1ResolveChatRoom,
  useV1TeamMatch,
  useV1TeamMatchEligibility,
  useV1TeamMatches,
  useV1WithdrawTeamMatchApplication,
} from '@/hooks/use-v1-api';
import { V1_LEVELS, levelRangeMatches, toLevelCodes, toggleLevelCode } from '@/lib/v1-levels';
import type { V1TeamMatch, V1TeamMatchApiStatus, V1TeamMatchViewerState } from '@/types/api';
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
  const filteredQuery = useV1TeamMatches(
    teamMatchFilters,
    { enabled: Boolean(teamMatchFilters) },
  );
  const recentSearches = useV1RecentSearches();
  const recordSearch = useV1RecordSearch();
  const query = teamMatchFilters ? filteredQuery : allQuery;

  if (query.isError) return <TeamMatchStatePageView model={getTeamMatchStateViewModel('error')} />;

  const base = getTeamMatchListViewModel();
  const items = query.data?.items;
  const visibleItems = filterTeamMatchesByLevels(items, selectedLevels);
  const allItems = allQuery.data?.items ?? items ?? [];
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
          sports: sportsQuery.data,
          matches: allItems,
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
          sports: sportsQuery.data,
          matches: allItems,
          selectedSportId,
        }),
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
  const viewerState = query.data ? getViewerState(query.data) : 'none';
  const canQueryEligibility = Boolean(query.data && query.data.viewer && query.data.viewer.state !== 'guest' && viewerState !== 'host_team');
  const eligibility = useV1TeamMatchEligibility(teamMatchId, undefined, { enabled: canQueryEligibility });
  const applyTeamMatch = useV1ApplyTeamMatch(teamMatchId);
  const resolveChatRoom = useV1ResolveChatRoom();
  const selectedEligibility = eligibility.data?.teams.find((team) => team.eligible) ?? eligibility.data?.teams[0] ?? null;
  const withdrawTeamMatch = useV1WithdrawTeamMatchApplication(teamMatchId, selectedEligibility?.applicationId);
  const fallback = getTeamMatchDetailViewModel();

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
          manageHref: viewerState === 'host_team' ? `/team-matches/${teamMatchId}/edit` : undefined,
          applicantTeams: toApplicantTeams(
            query.data,
            fallback.match.applicantTeams,
            viewerState === 'host_team' ? `/team-matches/${teamMatchId}/edit` : undefined,
          ),
        },
        mode: toDetailMode(viewerState, getStatus(query.data)),
        applyLabel: applyLabel(viewerState, getStatus(query.data), selectedEligibility),
        applyPending: applyTeamMatch.isPending || withdrawTeamMatch.isPending,
        statusLabel: statusLabel(viewerState, getStatus(query.data)),
        chatLabel: chatLabel(viewerState, getStatus(query.data)),
        chatPending: resolveChatRoom.isPending,
        onChat: canOpenTeamMatchChat(viewerState, getStatus(query.data))
          ? () => resolveChatRoom.mutate(
              { targetType: 'team_match', targetId: teamMatchId },
              { onSuccess: (room) => router.push(room.route.replace('/chat/rooms/', '/chat/')) },
            )
          : undefined,
        onShare: () => shareTeamMatch(query.data),
        onNotify: () => router.push('/notifications'),
        onApply: getApplyAction({
          viewerState,
          selectedTeamId: selectedEligibility?.teamId,
          applicationId: selectedEligibility?.applicationId,
          eligible: selectedEligibility?.eligible,
          apply: (teamId) => applyTeamMatch.mutate({ applicantTeamId: teamId, message: null }),
          withdraw: () => withdrawTeamMatch.mutate({ reason: 'applicant_team_withdrawn_from_v1_web' }),
        }),
      }
    : fallback;

  return <TeamMatchDetailPageView model={model} />;
}

function toTeamMatch(match: V1TeamMatch, fallback: TeamMatchModel): TeamMatchModel {
  const status = statusToCardStatus(getStatus(match), getViewerState(match));

  return {
    ...fallback,
    id: match.teamMatchId ?? match.id ?? fallback.id,
    title: match.title,
    sport: match.sport?.name ?? match.sportName ?? fallback.sport,
    hostTeam: match.hostTeam?.name ?? match.hostTeamName ?? fallback.hostTeam,
    venue: match.place?.name ?? match.placeName ?? fallback.venue,
    date: formatDate(match.startsAt),
    time: formatTime(match.startsAt),
    grade: match.levelLabel ?? fallback.grade,
    cost: parseMoney(match.costNote, fallback.cost),
    opponentCost: parseMoney(match.costNote, fallback.opponentCost),
    uniform: match.rulesText ?? fallback.uniform,
    gender: match.genderRule ?? fallback.gender,
    status,
  };
}

function buildSportChips({
  base,
  sports,
  matches,
  selectedSportId,
}: {
  base: TeamMatchListViewModel;
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
      href: '/team-matches',
    },
    ...fixedSports.map((sport) => ({
      label: sport.name,
      count: matches.filter((match) => {
        const matchSport = match.sport;
        return matchSport?.sportId === sport.id || matchSport?.name === sport.name || match.sportName === sport.name;
      }).length,
      active: selectedSportId === sport.id,
      href: `/team-matches?sportId=${encodeURIComponent(sport.id)}`,
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
  const viewOptions: NonNullable<TeamMatchListViewModel['filterSheet']>['viewOptions'] = [
    { label: '카드형', value: 'card', description: 'VS 히어로와 팀 정보', href: buildTeamMatchHref(params, { view: 'card', filter: '1' }), active: view === 'card' },
    { label: '콤팩트형', value: 'compact', description: '더 많은 팀매치 비교', href: buildTeamMatchHref(params, { view: 'compact', filter: '1' }), active: view === 'compact' },
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
    viewOptions,
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

function toApplicantTeams(
  match: V1TeamMatch,
  fallback: TeamMatchDetailViewModel['match']['applicantTeams'],
  manageHref?: string,
) {
  if (match.approvedOpponentTeam) {
    return [{ name: match.approvedOpponentTeam.name, meta: '승인된 상대팀', status: '승인완료', href: manageHref }];
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
  if (viewerState === 'approved' || status === 'matched') return 'approved';
  return 'open';
}

function toDetailMode(viewerState: V1TeamMatchViewerState, status: V1TeamMatchApiStatus): TeamMatchDetailViewModel['mode'] {
  if (viewerState === 'host_team') return 'mine';
  if (viewerState === 'requested') return 'pending';
  if (viewerState === 'approved' || status === 'matched') return 'approved';
  return 'default';
}

function applyLabel(
  viewerState: V1TeamMatchViewerState,
  status: V1TeamMatchApiStatus,
  team?: { eligible: boolean; reasonCode: string; applicationId: string | null; name: string } | null,
) {
  if (viewerState === 'guest') return '로그인 후 신청';
  if (viewerState === 'host_team') return '매치 관리';
  if (viewerState === 'requested' || team?.reasonCode === 'ALREADY_REQUESTED') return '신청 취소';
  if (viewerState === 'approved' || status === 'matched') return '승인 완료';
  if (status !== 'recruiting') return '신청 불가';
  if (team?.eligible) return `${team.name}으로 신청`;
  return reasonLabel(team?.reasonCode);
}

function statusLabel(viewerState: V1TeamMatchViewerState, status: V1TeamMatchApiStatus) {
  if (viewerState === 'host_team') return '내가 만든 팀매치';
  if (viewerState === 'requested') return '승인 대기';
  if (viewerState === 'approved' || status === 'matched') return '승인 완료';
  if (status !== 'recruiting') return '신청 마감';
  return '신청 가능';
}

function chatLabel(viewerState: V1TeamMatchViewerState, status: V1TeamMatchApiStatus) {
  return canOpenTeamMatchChat(viewerState, status) ? '채팅' : '승인 후 채팅';
}

function canOpenTeamMatchChat(viewerState: V1TeamMatchViewerState, _status: V1TeamMatchApiStatus) {
  return viewerState === 'approved';
}

async function shareTeamMatch(match: V1TeamMatch) {
  const title = match.title;
  const path = `/team-matches/${match.teamMatchId ?? match.id}`;
  const url = typeof window === 'undefined' ? path : new URL(path, window.location.origin).toString();

  if (navigator.share) {
    await navigator.share({ title, url });
    return;
  }

  await navigator.clipboard?.writeText(url);
}

function getApplyAction({
  viewerState,
  selectedTeamId,
  applicationId,
  eligible,
  apply,
  withdraw,
}: {
  viewerState: V1TeamMatchViewerState;
  selectedTeamId?: string;
  applicationId?: string | null;
  eligible?: boolean;
  apply: (teamId: string) => void;
  withdraw: () => void;
}) {
  if ((viewerState === 'requested' || applicationId) && applicationId) return withdraw;
  if (eligible && selectedTeamId) return () => apply(selectedTeamId);
  return undefined;
}

function reasonLabel(reasonCode?: string) {
  if (reasonCode === 'HOST_TEAM_CANNOT_APPLY') return '호스트 팀은 신청 불가';
  if (reasonCode === 'ALREADY_APPROVED') return '승인 완료';
  if (reasonCode === 'MATCHED_ALREADY') return '매칭 완료';
  if (reasonCode === 'NOT_RECRUITING') return '신청 불가';
  return '신청할 팀 없음';
}

function parseMoney(value: string | null | undefined, fallback: number) {
  const amount = value?.match(/\d[\d,]*/)?.[0]?.replace(/,/g, '');
  return amount ? Number(amount) : fallback;
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
