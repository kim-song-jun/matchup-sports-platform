'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  useV1ApplyMatch,
  useV1Match,
  useV1MatchApplicationEligibility,
  useV1Matches,
  useV1MasterSports,
  useV1RecentSearches,
  useV1RecordSearch,
  useV1ResolveChatRoom,
  useV1WithdrawMatchApplication,
} from '@/hooks/use-v1-api';
import { V1_LEVELS, levelRangeMatches, toLevelCodes, toggleLevelCode } from '@/lib/v1-levels';
import type { V1Match, V1MatchApiStatus, V1Sport, V1ViewerState } from '@/types/api';
import { MatchDetailPageView, MatchListPageView, MatchStatePageView } from './matches-page';
import type { MatchCardModel, MatchDetailViewModel, MatchListViewModel } from './matches.types';
import { applyLabel, getMatchDetailViewModel, getMatchListViewModel, getMatchStateViewModel } from './matches.view-model';

const FIXED_MATCH_SPORT_NAMES = ['축구', '풋살', '러닝', '수영'] as const;

export function MatchListPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedSportId = searchParams.get('sportId') ?? undefined;
  const selectedSort = toMatchSort(searchParams.get('sort'));
  const selectedView = toMatchView(searchParams.get('view'));
  const selectedGenderRule = toGenderRuleFilter(searchParams.get('genderRule'));
  const selectedLevels = toLevelCodes(searchParams.get('levelCodes') ?? searchParams.get('levels'));
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
    const filters: { sportId?: string; query?: string; sort?: 'recommended' | 'latest' | 'deadline'; view?: 'card' | 'compact'; genderRule?: string; levelCodes?: string } = {};
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
  const filteredMatches = useV1Matches(matchFilters, { enabled: Boolean(matchFilters) });
  const countMatches = useV1Matches(countFilters, { enabled: Boolean(countFilters) });
  const recentSearches = useV1RecentSearches();
  const recordSearch = useV1RecordSearch();
  const sports = useV1MasterSports();
  const query = matchFilters ? filteredMatches : allMatches;

  if (query.isError) return <MatchStatePageView model={getMatchStateViewModel('error')} />;

  const base = getMatchListViewModel();
  const items = query.data?.items;
  const visibleItems = filterMatchesByLevels(items, selectedLevels);
  const countItems = filterMatchesByLevels((countFilters ? countMatches.data?.items ?? allMatches.data?.items : allMatches.data?.items) ?? items, selectedLevels);
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
        sports: buildSportSummary(searchParams, countItems, base, selectedSportId, sports.data),
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
        sports: buildSportSummary(searchParams, countItems, base, selectedSportId, sports.data),
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
  const router = useRouter();
  const query = useV1Match(matchId);
  const eligibility = useV1MatchApplicationEligibility(matchId, { enabled: Boolean(query.data) });
  const viewerState = query.data ? getViewerState(query.data, eligibility.data?.viewerState) : 'none';
  const applyMatch = useV1ApplyMatch(matchId);
  const withdrawMatch = useV1WithdrawMatchApplication(matchId, eligibility.data?.applicationId ?? query.data?.viewer?.applicationId);
  const resolveChatRoom = useV1ResolveChatRoom();
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
          manageHref: viewerState === 'host' ? `/matches/${matchId}/applications` : undefined,
          participants: toParticipants(
            query.data,
            fallback.match.participants,
            viewerState === 'host' ? `/matches/${matchId}/applications` : undefined,
          ),
        },
        mode: toDetailMode(viewerState, getStatus(query.data)),
        applyLabel: applyLabel(viewerState, getStatus(query.data), eligibility.data?.eligible, eligibility.data?.message),
        applyPending: applyMatch.isPending || withdrawMatch.isPending,
        statusLabel: statusLabel(viewerState, getStatus(query.data)),
        chatLabel: chatLabel(viewerState),
        chatPending: resolveChatRoom.isPending,
        onChat: canOpenMatchChat(viewerState)
          ? () => resolveChatRoom.mutate(
              { targetType: 'match', targetId: matchId },
              { onSuccess: (room) => router.push(room.route.replace('/chat/rooms/', '/chat/')) },
            )
          : undefined,
        onShare: () => shareMatch(query.data),
        onNotify: () => router.push('/notifications'),
        onApply: getApplyAction({
          viewerState,
          eligible: eligibility.data?.eligible,
          applicationId: eligibility.data?.applicationId ?? query.data.viewer?.applicationId,
          apply: () => applyMatch.mutateAsync({ message: null }),
          withdraw: () => withdrawMatch.mutateAsync({ reason: 'applicant_withdrawn_from_v1_web' }),
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
    endTime: match.endsAt ? formatTime(match.endsAt) : undefined,
    current: capacity.current,
    capacity: capacity.capacity,
    level: match.levelLabel ?? fallback.level,
    gender: match.genderRule ?? fallback.gender,
    host: match.host?.displayName ?? fallback.host,
    image: match.imageUrl ?? fallback.image,
    status,
    deadline: formatDeadline(match.deadlineAt, status),
    deadlineDetail: formatDeadlineDetail(match.deadlineAt, status),
    actionLabel: actionLabel(status),
  };
}

function toParticipants(
  match: V1Match,
  fallback: MatchDetailViewModel['match']['participants'],
  manageHref?: string,
) {
  if (!match.participantsPreview?.length) {
    return [{
      name: match.host?.displayName ?? fallback[0]?.name ?? '호스트',
      meta: '호스트',
      status: '승인완료',
      href: manageHref,
    }];
  }

  return match.participantsPreview.filter((participant) => participant.role === 'host').map((participant) => ({
    name: participant.displayName,
    meta: '매치 만든 사람',
    status: participant.status === 'confirmed' ? '승인완료' : participant.status,
    href: manageHref,
  }));
}

function buildSportSummary(params: URLSearchParams, items: V1Match[], fallback: MatchListViewModel, selectedSportId?: string, masterSports?: V1Sport[]) {
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
      href: sport?.id ? buildMatchHref(params, { sportId: sport.id, filter: null }) : buildMatchHref(params, { sportId: null, filter: null }),
    };
  });

  return [
    { label: fallback.sports[0]?.label ?? '전체', count: items.length, active: !selectedSportId, href: buildMatchHref(params, { sportId: null, filter: null }) },
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
  const genderOptions: NonNullable<MatchListViewModel['filterSheet']>['genderOptions'] = [
    { label: '성별 무관', value: '성별 무관', href: buildMatchHref(params, { genderRule: genderRule === '성별 무관' ? null : '성별 무관', filter: '1' }), active: genderRule === '성별 무관' },
    { label: '남', value: '남', href: buildMatchHref(params, { genderRule: genderRule === '남' ? null : '남', filter: '1' }), active: genderRule === '남' },
    { label: '여', value: '여', href: buildMatchHref(params, { genderRule: genderRule === '여' ? null : '여', filter: '1' }), active: genderRule === '여' },
  ];
  const levelOptions: NonNullable<MatchListViewModel['filterSheet']>['levelOptions'] = V1_LEVELS.map(({ code, label }) => ({
    label,
    value: code,
    href: buildMatchHref(params, { levelCodes: toggleLevelCode(levels, code), levels: null, filter: '1' }),
    active: levels.includes(code),
  }));

  return {
    open,
    closeHref: buildMatchHref(params, { filter: null }),
    resetHref: buildMatchHref(params, { sort: null, view: null, genderRule: null, levelCodes: null, levels: null, filter: '1' }),
    applyHref: buildMatchHref(params, { filter: null }),
    sort,
    view,
    genderRule,
    levels,
    sortOptions,
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

function filterMatchesByLevels(matches: V1Match[] | undefined, levels: NonNullable<MatchListViewModel['filterSheet']>['levels']) {
  if (!matches || levels.length === 0) return matches ?? [];
  return matches.filter((match) => levelRangeMatches(levels, match.minLevel?.code, match.maxLevel?.code, match.levelLabel));
}

function countMatchFilters(
  sort: '' | 'recommended' | 'deadline' | 'latest',
  genderRule: '' | '성별 무관' | '남' | '여',
  levels: NonNullable<MatchListViewModel['filterSheet']>['levels'],
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
  const base = (match.displayState as V1MatchApiStatus | undefined) ?? (match.status as V1MatchApiStatus);
  // 마감 UX 선행: deadlineAt < now 면 모집 종료로 표시
  if (base === 'recruiting' || base === 'open') {
    const dl = match.deadlineAt ? new Date(match.deadlineAt) : null;
    if (dl && !Number.isNaN(dl.getTime()) && dl.getTime() < Date.now()) return 'closed';
  }
  return base;
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

function statusLabel(viewerState: V1ViewerState, status: V1MatchApiStatus) {
  if (viewerState === 'host') return '내가 만든 매치';
  if (viewerState === 'requested') return '승인 대기';
  if (viewerState === 'approved' || viewerState === 'participant') return '승인 완료';
  if (status === 'closed' || status === 'cancelled' || status === 'completed' || status === 'expired' || status === 'full') return '신청 마감';
  return '신청 가능';
}

function chatLabel(viewerState: V1ViewerState) {
  return viewerState === 'approved' || viewerState === 'participant' ? '채팅' : '승인 후 채팅';
}

function canOpenMatchChat(viewerState: V1ViewerState) {
  return viewerState === 'approved' || viewerState === 'participant';
}

function actionLabel(status: MatchCardModel['status']) {
  if (status === 'pending') return '승인 대기';
  if (status === 'approved') return '승인 완료';
  if (status === 'full') return '신청 마감';
  if (status === 'mine') return '내 매치';
  return '참가 신청';
}

function formatDeadline(value: string | null | undefined, status: MatchCardModel['status']) {
  if (status === 'pending') return '승인 대기';
  if (status === 'approved') return '승인 완료';
  if (status === 'full') return '신청 마감';
  if (status === 'mine') return '내 매치';
  if (!value) return '신청 가능';

  const deadline = new Date(value);
  if (Number.isNaN(deadline.getTime())) return '신청 가능';
  const diffMs = deadline.getTime() - Date.now();
  if (diffMs <= 0) return '신청 마감';
  const diffHours = Math.ceil(diffMs / 3_600_000);
  if (diffHours < 24) return `마감 ${diffHours}시간 전`;
  const diffDays = Math.ceil(diffHours / 24);
  return `마감 ${diffDays}일 전`;
}

function formatDeadlineDetail(value: string | null | undefined, status: MatchCardModel['status']) {
  if (status === 'pending') return '승인 대기';
  if (status === 'approved') return '승인 완료';
  if (status === 'full') return '신청 마감';
  if (status === 'mine') return '내 매치';
  if (!value) return '경기 시작 전까지';

  const deadline = new Date(value);
  if (Number.isNaN(deadline.getTime())) return '경기 시작 전까지';
  return `${formatDate(value)} ${formatTime(value)}`;
}

async function shareMatch(match: V1Match): Promise<string | null> {
  const title = match.title;
  const path = `/matches/${match.matchId ?? match.id}`;
  const url = typeof window === 'undefined' ? path : new URL(path, window.location.origin).toString();

  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return null;
    } catch (err) {
      // AbortError: 사용자가 공유 시트를 닫은 것 — 오류가 아님
      if (err instanceof Error && err.name === 'AbortError') return null;
      // share 실패 시 clipboard로 폴백
    }
  }

  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(url);
      return '링크가 복사되었어요';
    } catch {
      // clipboard 실패 — prompt 폴백
    }
  }

  // 최후 폴백: prompt로 URL 보여주기
  window.prompt('링크를 복사해주세요', url);
  return null;
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
  apply: () => Promise<unknown>;
  withdraw: () => Promise<unknown>;
}): (() => Promise<unknown>) | undefined {
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
