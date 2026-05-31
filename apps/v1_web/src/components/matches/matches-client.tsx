'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  useV1ApplyMatch,
  useV1ApproveMatchApplication,
  useV1Match,
  useV1MatchApplicationEligibility,
  useV1MatchApplications,
  useV1Matches,
  useV1MasterSports,
  useV1RecentSearches,
  useV1RecordSearch,
  useV1RejectMatchApplication,
  useV1WithdrawMatchApplication,
} from '@/hooks/use-v1-api';
import type { V1Match, V1MatchApiStatus, V1Sport, V1ViewerState } from '@/types/api';
import { MatchDetailPageView, MatchListPageView, MatchStatePageView } from './matches-page';
import type { MatchCardModel, MatchDetailViewModel, MatchListViewModel } from './matches.types';
import { getMatchDetailViewModel, getMatchListViewModel, getMatchStateViewModel } from './matches.view-model';

const FIXED_MATCH_SPORT_NAMES = ['축구', '풋살', '러닝', '수영'] as const;

export function MatchListPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedSportId = searchParams.get('sportId') ?? undefined;
  const selectedSort = toMatchSort(searchParams.get('sort'));
  const selectedView = toMatchView(searchParams.get('view'));
  const selectedGenderRule = toGenderRuleFilter(searchParams.get('genderRule'));
  const selectedLevels = toLevelFilters(searchParams.get('levels'));
  const filterOpen = searchParams.get('filter') === '1';
  const initialQuery = searchParams.get('q') ?? '';
  const [searchValue, setSearchValue] = useState(initialQuery);
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery);
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    setSearchValue(initialQuery);
    setSubmittedQuery(initialQuery);
  }, [initialQuery]);
  const allMatches = useV1Matches();
  const activeFilterCount = countMatchFilters(selectedSort, selectedGenderRule, selectedLevels);
  const matchFilters = useMemo(() => {
    const filters: { sportId?: string; query?: string; sort?: 'recommended' | 'latest' | 'deadline'; view?: 'card' | 'compact'; genderRule?: string } = {};
    if (selectedSportId) filters.sportId = selectedSportId;
    if (selectedGenderRule) filters.genderRule = selectedGenderRule;
    if (submittedQuery.trim()) filters.query = submittedQuery.trim();
    if (selectedSort) filters.sort = selectedSort;
    if (selectedView !== 'card') filters.view = selectedView;
    return Object.keys(filters).length ? filters : undefined;
  }, [selectedGenderRule, selectedSportId, selectedSort, selectedView, submittedQuery]);
  const filteredMatches = useV1Matches(matchFilters, { enabled: Boolean(matchFilters) });
  const recentSearches = useV1RecentSearches();
  const recordSearch = useV1RecordSearch();
  const sports = useV1MasterSports();
  const query = matchFilters ? filteredMatches : allMatches;

  if (query.isError) return <MatchStatePageView model={getMatchStateViewModel('error')} />;

  const base = getMatchListViewModel();
  const items = query.data?.items;
  const visibleItems = filterMatchesByLevels(items, selectedLevels);
  const countItems = allMatches.data?.items ?? items ?? [];
  const searchModel: NonNullable<MatchListViewModel['search']> = {
    value: searchValue,
    placeholder: '지역, 시간, 매치명 검색',
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
  const model: MatchListViewModel = items
    ? {
        ...base,
        query: submittedQuery,
        filterCount: activeFilterCount,
        search: searchModel,
        filterHref: buildMatchHref(searchParams, { filter: '1' }),
        filterSheet: buildMatchFilterSheet(searchParams, selectedSort, selectedView, selectedGenderRule, selectedLevels, filterOpen),
        matches: visibleItems.map((item, index) => toMatchCard(item, base.matches[index] ?? base.matches[0])),
        sports: buildSportSummary(countItems, base, selectedSportId, sports.data),
        summary: {
          ...base.summary,
          count: visibleItems.length,
          today: countToday(visibleItems),
          urgent: visibleItems.filter((item) => statusToCardStatus(getStatus(item)) === 'open').length,
        },
      }
    : {
        ...base,
        query: submittedQuery,
        filterCount: activeFilterCount,
        search: searchModel,
        filterHref: buildMatchHref(searchParams, { filter: '1' }),
        filterSheet: buildMatchFilterSheet(searchParams, selectedSort, selectedView, selectedGenderRule, selectedLevels, filterOpen),
      };

  return <MatchListPageView model={model} />;

  function submitSearch(value: string, options?: { source?: string }) {
    const nextQuery = value.trim();
    setSearchValue(nextQuery);
    setSubmittedQuery(nextQuery);
    setSearchOpen(false);
    updateMatchUrl(nextQuery);
    if (nextQuery) {
      recordSearch.mutate({ query: nextQuery, filters: { domain: 'matches', source: options?.source ?? 'matches' } });
    }
  }

  function clearSearch() {
    setSearchValue('');
    setSubmittedQuery('');
    setSearchOpen(false);
    updateMatchUrl('');
  }

  function updateMatchUrl(nextQuery: string) {
    router.replace(buildMatchHref(searchParams, { q: nextQuery || null, filter: null }), { scroll: false });
  }
}

export function MatchDetailPageClient({ matchId }: { matchId: string }) {
  const query = useV1Match(matchId);
  const eligibility = useV1MatchApplicationEligibility(matchId, { enabled: Boolean(query.data) });
  const viewerState = query.data ? getViewerState(query.data, eligibility.data?.viewerState) : 'none';
  const applications = useV1MatchApplications(matchId, { status: 'requested', limit: 10 }, { enabled: viewerState === 'host' });
  const applyMatch = useV1ApplyMatch(matchId);
  const approveApplication = useV1ApproveMatchApplication(matchId);
  const rejectApplication = useV1RejectMatchApplication(matchId);
  const withdrawMatch = useV1WithdrawMatchApplication(matchId, eligibility.data?.applicationId ?? query.data?.viewer?.applicationId);
  const fallback = getMatchDetailViewModel();

  if (query.isError) {
    return <MatchStatePageView model={getMatchStateViewModel('error')} />;
  }

  const model: MatchDetailViewModel = query.data
    ? {
        ...fallback,
        match: {
          ...fallback.match,
          ...toMatchCard(query.data, fallback.match),
          description: query.data.description ?? query.data.descriptionPreview ?? fallback.match.description,
          address: query.data.place?.addressText ?? query.data.placeName ?? fallback.match.address,
          rules: query.data.rulesText ? [query.data.rulesText] : fallback.match.rules,
          participants: toParticipants(query.data, fallback.match.participants, applications.data?.items, {
            pending: approveApplication.isPending || rejectApplication.isPending,
            approve: (applicationId) => approveApplication.mutate({ applicationId }),
            reject: (applicationId) => rejectApplication.mutate({ applicationId, reason: 'host_rejected_from_v1_web' }),
          }),
        },
        mode: toDetailMode(viewerState, getStatus(query.data)),
        applyLabel: applyLabel(viewerState, getStatus(query.data), eligibility.data?.message),
        applyPending: applyMatch.isPending || withdrawMatch.isPending,
        onApply: getApplyAction({
          viewerState,
          eligible: eligibility.data?.eligible,
          applicationId: eligibility.data?.applicationId ?? query.data.viewer?.applicationId,
          apply: () => applyMatch.mutate({ message: null }),
          withdraw: () => withdrawMatch.mutate({ reason: 'applicant_withdrawn_from_v1_web' }),
        }),
      }
    : fallback;

  return <MatchDetailPageView model={model} />;
}

function toMatchCard(match: V1Match, fallback: MatchCardModel): MatchCardModel {
  const capacity = getCapacity(match, fallback);
  const status = statusToCardStatus(getStatus(match), getViewerState(match));

  return {
    ...fallback,
    id: match.matchId ?? match.id ?? fallback.id,
    title: match.title,
    sport: match.sport?.name ?? match.sportName ?? fallback.sport,
    venue: match.place?.name ?? match.placeName ?? fallback.venue,
    region: match.region?.name ?? match.regionName ?? fallback.region,
    date: formatDate(match.startsAt),
    time: formatTime(match.startsAt),
    current: capacity.current,
    capacity: capacity.capacity,
    level: match.levelLabel ?? fallback.level,
    gender: match.genderRule ?? fallback.gender,
    host: match.host?.displayName ?? fallback.host,
    image: match.imageUrl ?? fallback.image,
    status,
    deadline: status === 'open' ? '신청 가능' : status === 'pending' ? '승인 대기' : status === 'approved' ? '승인 완료' : fallback.deadline,
    actionLabel: actionLabel(status),
  };
}

function toParticipants(
  match: V1Match,
  fallback: MatchDetailViewModel['match']['participants'],
  applications?: Array<{ applicationId: string; displayName: string; message: string | null; status: string }>,
  actions?: { pending: boolean; approve: (applicationId: string) => void; reject: (applicationId: string) => void },
) {
  if (applications?.length) {
    return applications.map((application) => ({
      name: application.displayName,
      meta: application.message ? `신청 메시지 · ${application.message}` : '신청자',
      status: application.status === 'requested' ? '승인 대기' : application.status,
      actionPending: actions?.pending,
      onApprove: actions ? () => actions.approve(application.applicationId) : undefined,
      onReject: actions ? () => actions.reject(application.applicationId) : undefined,
    }));
  }

  if (!match.participantsPreview?.length) return fallback;

  return match.participantsPreview.map((participant) => ({
    name: participant.displayName,
    meta: participant.role === 'host' ? '호스트' : '참가자',
    status: participant.status === 'confirmed' ? '승인완료' : participant.status,
  }));
}

function buildSportSummary(items: V1Match[], fallback: MatchListViewModel, selectedSportId?: string, masterSports?: V1Sport[]) {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const name = item.sport?.name ?? item.sportName ?? '기타';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  });

  const fixedSports = FIXED_MATCH_SPORT_NAMES.map((name) => {
    const sport = masterSports?.find((item) => item.name === name);
    return {
      label: name,
      count: counts.get(name) ?? 0,
      active: sport?.id === selectedSportId,
      href: sport?.id ? `/matches?sportId=${sport.id}` : '/matches',
    };
  });

  return [
    { label: fallback.sports[0]?.label ?? '전체', count: items.length, active: !selectedSportId, href: '/matches' },
    ...fixedSports,
  ];
}

function buildMatchFilterSheet(
  params: URLSearchParams,
  sort: NonNullable<MatchListViewModel['filterSheet']>['sort'],
  view: NonNullable<MatchListViewModel['filterSheet']>['view'],
  genderRule: NonNullable<MatchListViewModel['filterSheet']>['genderRule'],
  levels: NonNullable<MatchListViewModel['filterSheet']>['levels'],
  open: boolean,
): NonNullable<MatchListViewModel['filterSheet']> {
  const sortOptions: NonNullable<MatchListViewModel['filterSheet']>['sortOptions'] = [
    { label: '추천순', value: 'recommended', href: buildMatchHref(params, { sort: sort === 'recommended' ? null : 'recommended', filter: '1' }), active: sort === 'recommended' },
    { label: '마감임박', value: 'deadline', href: buildMatchHref(params, { sort: sort === 'deadline' ? null : 'deadline', filter: '1' }), active: sort === 'deadline' },
    { label: '최신순', value: 'latest', href: buildMatchHref(params, { sort: sort === 'latest' ? null : 'latest', filter: '1' }), active: sort === 'latest' },
  ];
  const viewOptions: NonNullable<MatchListViewModel['filterSheet']>['viewOptions'] = [
    { label: '카드형', value: 'card', description: '이미지와 핵심 정보를 크게', href: buildMatchHref(params, { view: 'card', filter: '1' }), active: view === 'card' },
    { label: '콤팩트형', value: 'compact', description: '더 많은 매치를 빠르게', href: buildMatchHref(params, { view: 'compact', filter: '1' }), active: view === 'compact' },
  ];
  const genderOptions: NonNullable<MatchListViewModel['filterSheet']>['genderOptions'] = [
    { label: '성별 무관', value: '성별 무관', href: buildMatchHref(params, { genderRule: genderRule === '성별 무관' ? null : '성별 무관', filter: '1' }), active: genderRule === '성별 무관' },
    { label: '남', value: '남', href: buildMatchHref(params, { genderRule: genderRule === '남' ? null : '남', filter: '1' }), active: genderRule === '남' },
    { label: '여', value: '여', href: buildMatchHref(params, { genderRule: genderRule === '여' ? null : '여', filter: '1' }), active: genderRule === '여' },
  ];
  const levelOptions: NonNullable<MatchListViewModel['filterSheet']>['levelOptions'] = levelFilterValues.map((level) => ({
    label: level,
    value: level,
    href: buildMatchHref(params, { levels: toggleLevelFilter(levels, level), filter: '1' }),
    active: levels.includes(level),
  }));

  return {
    open,
    closeHref: buildMatchHref(params, { filter: null }),
    resetHref: buildMatchHref(params, { sort: null, view: null, genderRule: null, levels: null, filter: '1' }),
    applyHref: buildMatchHref(params, { filter: null }),
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

function buildMatchHref(params: URLSearchParams, overrides: Record<string, string | null>) {
  const next = new URLSearchParams(params.toString());
  Object.entries(overrides).forEach(([key, value]) => {
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
  });
  const queryString = next.toString();
  return queryString ? `/matches?${queryString}` : '/matches';
}

function toMatchSort(value: string | null): '' | 'recommended' | 'deadline' | 'latest' {
  if (value === 'recommended' || value === 'deadline' || value === 'latest') return value;
  return '';
}

function toMatchView(value: string | null): 'card' | 'compact' {
  return value === 'compact' ? 'compact' : 'card';
}

function toGenderRuleFilter(value: string | null): '' | '성별 무관' | '남' | '여' {
  if (value === '성별 무관' || value === '남' || value === '여') return value;
  return '';
}

const levelFilterValues = ['입문', '초보', '중수', '고수'] as const;

function toLevelFilters(value: string | null): Array<(typeof levelFilterValues)[number]> {
  if (!value) return [];
  const selected = value.split(',').filter((level): level is (typeof levelFilterValues)[number] =>
    levelFilterValues.includes(level as (typeof levelFilterValues)[number]),
  );
  return Array.from(new Set(selected));
}

function toggleLevelFilter(levels: Array<(typeof levelFilterValues)[number]>, level: (typeof levelFilterValues)[number]) {
  const next = levels.includes(level) ? levels.filter((item) => item !== level) : [...levels, level];
  return next.length ? next.join(',') : null;
}

function filterMatchesByLevels(matches: V1Match[] | undefined, levels: Array<(typeof levelFilterValues)[number]>) {
  if (!matches || levels.length === 0) return matches ?? [];
  return matches.filter((match) => levels.includes(toLevelFilterLabel(match.levelLabel)));
}

function toLevelFilterLabel(label: string): (typeof levelFilterValues)[number] {
  if (label.includes('입문')) return '입문';
  if (label.includes('초보')) return '초보';
  if (label.includes('중수')) return '중수';
  if (label.includes('고수')) return '고수';
  if (label.startsWith('A')) return '고수';
  if (label.startsWith('B')) return '중수';
  if (label.startsWith('C')) return '초보';
  return '입문';
}

function countMatchFilters(
  sort: '' | 'recommended' | 'deadline' | 'latest',
  genderRule: '' | '성별 무관' | '남' | '여',
  levels: Array<(typeof levelFilterValues)[number]>,
) {
  return Number(Boolean(sort)) + Number(Boolean(genderRule)) + levels.length;
}

function countToday(items: V1Match[]) {
  const today = new Date();
  return items.filter((item) => {
    const date = new Date(item.startsAt);
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  }).length;
}

function getCapacity(match: V1Match, fallback: MatchCardModel) {
  if (typeof match.participantCount === 'number' && typeof match.capacity === 'number') {
    return { current: match.participantCount, capacity: match.capacity };
  }

  const [current, capacity] = match.capacityText?.match(/\d+/g)?.map(Number) ?? [];
  return {
    current: current ?? fallback.current,
    capacity: capacity ?? match.capacity ?? fallback.capacity,
  };
}

function getStatus(match: V1Match): V1MatchApiStatus {
  return (match.displayState as V1MatchApiStatus | undefined) ?? (match.status as V1MatchApiStatus);
}

function getViewerState(match: V1Match, preflight?: Exclude<V1ViewerState, 'guest'>): V1ViewerState {
  return preflight ?? match.viewer?.state ?? match.viewerState ?? 'none';
}

function statusToCardStatus(status: V1MatchApiStatus, viewerState: V1ViewerState = 'none'): MatchCardModel['status'] {
  if (viewerState === 'host') return 'mine';
  if (viewerState === 'requested') return 'pending';
  if (viewerState === 'approved' || viewerState === 'participant') return 'approved';
  if (status === 'closed' || status === 'cancelled' || status === 'completed' || status === 'expired' || status === 'full') return 'full';
  return 'open';
}

function toDetailMode(viewerState: V1ViewerState, status: V1MatchApiStatus): MatchDetailViewModel['mode'] {
  if (viewerState === 'host') return 'mine';
  if (viewerState === 'requested') return 'pending';
  if (viewerState === 'approved' || viewerState === 'participant') return 'approved';
  if (status === 'closed' || status === 'cancelled' || status === 'completed' || status === 'expired' || status === 'full') return 'approved';
  return 'default';
}

function applyLabel(viewerState: V1ViewerState, status: V1MatchApiStatus, message?: string) {
  if (viewerState === 'host') return '매치 관리';
  if (viewerState === 'requested') return '신청 취소';
  if (viewerState === 'approved' || viewerState === 'participant') return '승인 완료';
  if (status === 'closed' || status === 'cancelled' || status === 'completed' || status === 'expired' || status === 'full') return '신청 불가';
  return message && message !== '신청할 수 있습니다.' ? message : '참가 신청';
}

function actionLabel(status: MatchCardModel['status']) {
  if (status === 'pending') return '승인 대기';
  if (status === 'approved') return '승인 완료';
  if (status === 'full') return '신청 마감';
  if (status === 'mine') return '내 매치';
  return '승인제 신청';
}

function getApplyAction({
  viewerState,
  eligible,
  applicationId,
  apply,
  withdraw,
}: {
  viewerState: V1ViewerState;
  eligible?: boolean;
  applicationId?: string | null;
  apply: () => void;
  withdraw: () => void;
}) {
  if (viewerState === 'requested' && applicationId) return withdraw;
  if (eligible) return apply;
  return undefined;
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
