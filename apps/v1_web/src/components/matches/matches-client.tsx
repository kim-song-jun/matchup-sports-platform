'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { trackEvent } from '@/lib/analytics';
import { chatRoomHref } from '@/lib/chat-route';
import { V1_LEVELS, levelRangeMatches, toLevelCodes, toggleLevelCode } from '@/lib/v1-levels';
import type { V1Match, V1MatchApiStatus, V1Sport, V1ViewerState } from '@/types/api';
import { toDetailMode } from './matches.mode';
import { MatchDetailPageSkeleton, MatchDetailPageView, MatchListPageView, MatchStatePageView } from './matches-page';
import type { MatchCardModel, MatchDetailViewModel, MatchListViewModel } from './matches.types';
import { applyLabel, getMatchDetailViewModel, getMatchListViewModel, getMatchStateViewModel } from './matches.view-model';
import {
  actionLabel,
  buildMatchHref,
  buildSportSummary,
  countToday,
  formatDeadline,
  formatDeadlineDetail,
  getCapacity,
  getStatus,
  getViewerState,
  statusToCardStatus,
  toMatchCard,
} from './matches.card-model';


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
  // 서버는 20건씩 커서 페이지네이션으로 자르는데(matches.service.ts list()) 예전엔 이 화면이
  // 단발 useQuery로 첫 페이지만 받아 21번째 매치부터는 볼 방법이 아예 없었다(감사 결함).
  // 대회 목록(tournaments/page.tsx)과 같은 "더 보기" 누적 방식 — 다만 그 화면 수준의
  // 데스크톱 페이지 번호 분기까지는 아직 이 화면 규모에 근거가 없다.
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulated, setAccumulated] = useState<V1Match[]>([]);
  // 필터가 바뀌면(종목·성별·레벨·검색·정렬·보기) 새 조건의 1페이지부터 다시 쌓는다.
  // useEffect가 아니라 렌더 중에 직접 되감는다("prop이 바뀔 때 state 조정" — React 공식
  // 패턴): useEffect로 하면 effect가 도는 다음 렌더까지 "새 필터 + 이전 cursor"가 합쳐진
  // 요청이 한 번 나간다 — 그 cursor는 이전 필터 기준 토큰이라 새 필터에서는 무효하고,
  // 서버가 그 조합을 어떻게 처리할지도 검증된 바 없다. 렌더 중 set을 호출하면 이 렌더의
  // 출력은 버려지고 즉시 다시 렌더되므로 그 중간 상태가 화면에도, 요청에도 나타나지 않는다.
  const matchFiltersKey = matchFilters ? JSON.stringify(matchFilters) : '';
  const [pagedFiltersKey, setPagedFiltersKey] = useState(matchFiltersKey);
  if (pagedFiltersKey !== matchFiltersKey) {
    setPagedFiltersKey(matchFiltersKey);
    setCursor(undefined);
    setAccumulated([]);
  }
  const allMatchesFilters = useMemo(() => (!matchFilters && cursor ? { cursor } : undefined), [matchFilters, cursor]);
  const filteredMatchesFilters = useMemo(
    () => (matchFilters ? (cursor ? { ...matchFilters, cursor } : matchFilters) : undefined),
    [matchFilters, cursor],
  );
  const allMatches = useV1Matches(allMatchesFilters);
  const countFilters = useMemo(() => {
    const filters: { query?: string; genderRule?: string; levelCodes?: string } = {};
    if (selectedGenderRule) filters.genderRule = selectedGenderRule;
    if (selectedLevels.length) filters.levelCodes = selectedLevels.join(',');
    if (submittedQuery.trim()) filters.query = submittedQuery.trim();
    return Object.keys(filters).length ? filters : undefined;
  }, [selectedGenderRule, selectedLevels, submittedQuery]);
  const filteredMatches = useV1Matches(filteredMatchesFilters, { enabled: Boolean(matchFilters) });
  const countMatches = useV1Matches(countFilters, { enabled: Boolean(countFilters) });
  const recentSearches = useV1RecentSearches();
  const recordSearch = useV1RecordSearch();
  const sports = useV1MasterSports();
  const query = matchFilters ? filteredMatches : allMatches;

  if (query.isError) return <MatchStatePageView model={getMatchStateViewModel('error')} />;

  const base = getMatchListViewModel();
  const pageItems = query.data?.items;
  // 누적: cursor가 있으면(2페이지 이상) 직전까지 쌓아둔 목록 뒤에 새 페이지를 이어 붙인다 —
  // id 기준 중복 제거는 in-flight 재요청(포커스 재검증 등)이 겹쳐 와도 카드가 두 번 그려지지
  // 않게 하기 위함.
  const items: V1Match[] | undefined = pageItems === undefined
    ? undefined
    : cursor
      ? [...accumulated, ...pageItems.filter((item) => !accumulated.some((prev) => (prev.matchId ?? prev.id) === (item.matchId ?? item.id)))]
      : pageItems;
  const visibleItems = filterMatchesByLevels(items, selectedLevels);
  const countItems = filterMatchesByLevels((countFilters ? countMatches.data?.items ?? allMatches.data?.items : allMatches.data?.items) ?? items, selectedLevels);
  const hasNext = query.data?.pageInfo?.hasNext ?? false;
  const handleLoadMore = () => {
    if (!query.data?.pageInfo?.nextCursor || query.isFetching) return;
    setAccumulated(items ?? []);
    setCursor(query.data.pageInfo.nextCursor);
  };
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
        hasNext,
        onLoadMore: handleLoadMore,
        loadMorePending: query.isFetching,
      }
    : {
        ...base,
        query: submittedQuery,
        filterCount: activeFilterCount,
        search: searchModel,
        filterHref: buildMatchHref(searchParams, { filter: '1' }),
        filterSheet: buildMatchFilterSheet(searchParams, selectedSort, selectedView, selectedGenderRule, selectedLevels, filterOpen),
        matches: [],
        sports: buildSportSummary(searchParams, countItems, base, selectedSportId, sports.data),
        summary: {
          ...base.summary,
          count: 0,
          today: 0,
          urgent: 0,
        },
        // team-matches-client.tsx #5와 동일 — 로딩 중임을 명시해 EmptyState 대신 스켈레톤을
        // 그리게 한다(로딩 중을 "조건에 맞는 매치 0개"로 오인시키지 않는다).
        isLoading: query.isLoading,
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

/**
 * `seed` 는 서버 컴포넌트(app/matches/[id]/page.tsx)가 존재 확인·메타데이터를 위해
 * 이미 받아 둔 공개 매치 응답이다. 그동안 이 값을 버리고 클라이언트가 같은 매치를
 * 처음부터 다시 받았기 때문에, 딥링크·푸시·새로고침으로 들어오면 첫 화면이 비어 있었다.
 * 추가 요청 없이 그 결과를 그대로 첫 표시값으로 쓴다(비인증 응답이라 뷰어 상태는 없고,
 * `revalidate: 300` 캐시라 최대 5분 오래된 값일 수 있어 행동은 잠근 채 표시만 한다).
 */
export function MatchDetailPageClient({ matchId, seed }: { matchId: string; seed?: V1Match | null }) {
  const router = useRouter();
  const query = useV1Match(matchId, { seed });
  const eligibility = useV1MatchApplicationEligibility(matchId, { enabled: Boolean(query.data) });
  const viewerState = query.data ? getViewerState(query.data, eligibility.data?.viewerState) : 'none';
  const applyMatch = useV1ApplyMatch(matchId);
  const withdrawMatch = useV1WithdrawMatchApplication(matchId, eligibility.data?.applicationId ?? query.data?.viewer?.applicationId);
  const resolveChatRoom = useV1ResolveChatRoom();
  const autoResolvedChatRef = useRef<string | null>(null);
  const matchViewTrackedRef = useRef<string | null>(null);
  const fallback = getMatchDetailViewModel();
  const matchSportType = query.data ? query.data.sport?.name ?? query.data.sportName : undefined;

  useEffect(() => {
    if (!query.data || !canOpenMatchChat(viewerState) || autoResolvedChatRef.current === matchId) return;
    autoResolvedChatRef.current = matchId;
    resolveChatRoom.mutate({ targetType: 'match', targetId: matchId });
  }, [matchId, query.data, resolveChatRoom, viewerState]);

  useEffect(() => {
    if (!query.data || matchViewTrackedRef.current === matchId) return;
    matchViewTrackedRef.current = matchId;
    trackEvent('match_view', { matchId, sportType: matchSportType ?? '' });
  }, [matchId, query.data, matchSportType]);

  if (query.isError) {
    return <MatchStatePageView model={getMatchStateViewModel('error')} />;
  }

  // 데이터가 오기 전에는 하드코딩 목업(`fallback`)을 화면 전체로 렌더하지 않는다 —
  // 목업 제목·주소·참가자가 실제 값처럼 보여 사용자가 잘못 읽던 결함이었다.
  // `fallback` 은 아래에서 필드 단위 기본값으로만 쓴다.
  if (!query.data) {
    return <MatchDetailPageSkeleton />;
  }

  // 목록 캐시에서 승계한 표시용 데이터로 그리는 중. 제목·장소·날짜는 진짜지만 뷰어
  // 상태·참가자는 아직 없다 — 이 동안 상태 라벨과 행동 버튼을 잠가, 이미 신청한 매치에
  // "참가 신청"이 뜨는 식의 잘못된 안내를 막는다.
  const seeding = query.isPlaceholderData;

  const model: MatchDetailViewModel = {
    ...fallback,
    match: {
      // `...fallback.match` 스프레드를 걷어냈다 — 확장 필드까지 전부 아래에서 채우므로
      // 목업이 남을 자리가 없다(남아 있으면 새 필드를 추가할 때 조용히 다시 샌다).
      ...toMatchCard(query.data, fallback.match),
      // fallback.match.description/address는 로딩 스켈레톤(fallback 전체를 그대로 보여주는
      // 케이스)에서만 써야 하는 하드코딩 목업이다 — 실제 매치가 로드된 뒤 API가 값을 안 주면
      // ''로 둔다(team-matches-client.tsx의 동일 패턴과 통일). 렌더 쪽(matches-page.tsx)이
      // falsy면 이미 섹션·sub를 숨긴다(설명은 InfoRow 미사용, 주소는 InfoRow의 sub
      // optional 처리, 규칙은 `.length` 가드) — 상세 주소를 비워 만든 매치에 목업 주소
      // '서울 양천구 안양천로 939'가 실제 주소처럼 뜨던 결함(2026-08-27 감사
      // M-A-personal-match-state)을 막는다.
      description: query.data.description ?? query.data.descriptionPreview ?? '',
      address: query.data.place?.addressText ?? query.data.placeName ?? '',
      // API가 규칙을 안 주면 빈 배열 — 목업 규칙('풋살화 착용' 등)을 남의 매치에
      // 붙이지 않는다. 렌더 쪽(matches-page.tsx)이 `.length` 로 섹션을 숨긴다.
      rules: query.data.rulesText ? [query.data.rulesText] : [],
      editHref: viewerState === 'host' ? `/matches/${matchId}/edit` : undefined,
      applicationsHref: viewerState === 'host' ? `/matches/${matchId}/applications` : undefined,
      participants: toParticipants(
        query.data,
        viewerState === 'host' ? `/matches/${matchId}/applications` : undefined,
      ),
    },
    mode: toDetailMode(viewerState, getStatus(query.data)),
    reviewAction: buildMatchReviewAction(matchId, viewerState, getStatus(query.data)),
    applyLabel: seeding ? '불러오는 중' : applyLabel(viewerState, getStatus(query.data), eligibility.data?.eligible, eligibility.data?.message),
    // seeding 을 여기 넣지 않는다 — 렌더 쪽이 applyPending 을 '처리 중'(= 내 신청을
    // 처리하는 중)으로 읽어 applyLabel 을 덮어쓴다. 잠금은 onApply 를 비우는 것으로
    // 충분하고(canRunAction=false → disabled), 라벨은 '불러오는 중'이 남는다.
    applyPending: applyMatch.isPending || withdrawMatch.isPending,
    statusLabel: seeding ? undefined : statusLabel(viewerState, getStatus(query.data)),
    chatLabel: chatLabel(viewerState),
    chatPending: resolveChatRoom.isPending,
    onChat: !seeding && canOpenMatchChat(viewerState)
      ? () => resolveChatRoom.mutate(
          { targetType: 'match', targetId: matchId },
          { onSuccess: (room) => router.push(chatRoomHref(room.roomId, room.route)) },
        )
      : undefined,
    onShare: () => shareMatch(query.data),
    onNotify: () => router.push('/notifications'),
    onApply: seeding ? undefined : getApplyAction({
      viewerState,
      eligible: eligibility.data?.eligible,
      applicationId: eligibility.data?.applicationId ?? query.data.viewer?.applicationId,
      apply: () =>
        applyMatch.mutateAsync({ message: null }).then((result) => {
          trackEvent('match_join_complete', { matchId, sportType: matchSportType ?? '' });
          return result;
        }),
      withdraw: () =>
        withdrawMatch.mutateAsync({ reason: 'applicant_withdrawn_from_v1_web' }).then((result) => {
          trackEvent('match_leave', { matchId });
          return result;
        }),
    }),
  };

  return <MatchDetailPageView model={model} />;
}


function toParticipants(match: V1Match, manageHref?: string) {
  if (!match.participantsPreview?.length) {
    return [{
      // 목업 참가자('김정민' 등)를 호스트 이름 자리에 쓰지 않는다 — 실제 매치의
      // 호스트가 다른 사람 이름으로 보이던 결함이었다.
      name: match.host?.displayName ?? '호스트',
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


/**
 * 매치가 끝난 뒤 후기 작성 화면으로 가는 진입점. 실제로 평가할 대상이 있는지(같이 뛴 다른
 * 참가자)는 작성 화면이 /reviews/sources/match/:id 로 직접 받는다 — 여기서 미리 판정하면
 * 서버 규칙과 갈릴 때 조용히 어긋난다. 여기서는 "완료 + 참가자" 까지만 본다.
 */
function buildMatchReviewAction(
  matchId: string,
  viewerState: V1ViewerState,
  status: V1MatchApiStatus,
): MatchDetailViewModel['reviewAction'] {
  if (status !== 'completed') return null;
  if (viewerState !== 'host' && viewerState !== 'approved') return null;
  return { label: '후기 남기기', href: `/my/reviews/match/${matchId}` };
}


function statusLabel(viewerState: V1ViewerState, status: V1MatchApiStatus) {
  if (viewerState === 'host') return '내가 만든 매치';
  if (viewerState === 'requested') return '승인 대기';
  if (viewerState === 'approved' || viewerState === 'participant') return '승인 완료';
  if (status === 'closed' || status === 'cancelled' || status === 'completed' || status === 'expired' || status === 'full') return '신청 마감';
  return '신청 가능';
}

function chatLabel(viewerState: V1ViewerState) {
  return viewerState === 'host' || viewerState === 'approved' || viewerState === 'participant' ? '채팅' : '승인 후 채팅';
}

function canOpenMatchChat(viewerState: V1ViewerState) {
  return viewerState === 'host' || viewerState === 'approved' || viewerState === 'participant';
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
      return '링크를 복사했어요';
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


