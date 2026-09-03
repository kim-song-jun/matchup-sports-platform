'use client';

import { Search, X, ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useV1LeagueMatches, useV1Matches, useV1RecentSearches, useV1RecordSearch, useV1TeamMatches, useV1Teams } from '@/hooks/use-v1-api';
import type { V1Match, V1Team, V1TeamMatch } from '@/types/api';
import type { V1PublicLeagueListItem } from '@/types/league-match';
import { formatTournamentDateRangeShort } from '@/lib/date-utils';
import { trackEvent } from '@/lib/analytics';
import { EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { AUTH_NOTICE_STAGE } from '@/components/auth/auth-page';

type SearchState = 'results' | 'new' | 'empty' | 'error' | 'stale';

type SearchExperienceProps = {
  state?: SearchState;
};

export function SearchExperience({ state = 'results' }: SearchExperienceProps) {
  const router = useRouter();
  const initialQuery = getInitialQuery(state);
  const [query, setQuery] = useState(initialQuery);
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery);
  const shouldSearch = state === 'results' && submittedQuery.trim().length > 0;
  const filters = useMemo(() => ({ query: submittedQuery.trim(), limit: 5, sort: 'recommended' }), [submittedQuery]);
  const recentSearches = useV1RecentSearches();
  const recordSearch = useV1RecordSearch();
  const matchesQuery = useV1Matches(filters, { enabled: shouldSearch });
  const teamMatchesQuery = useV1TeamMatches(filters, { enabled: shouldSearch });
  const teamsQuery = useV1Teams(filters, { enabled: shouldSearch });
  // 리그: GET /league-matches 는 매치/팀매치/팀과 달리 서버 쪽 텍스트 query 필터가 없다
  // (ListLeagueMatchesQueryDto — sportId/teamId/regionId/state/cursor/limit 뿐, query 없음).
  // 이 감사 수정은 프론트엔드 표면(홈·검색·sitemap)만 배정돼 있어 백엔드 DTO 확장은
  // 범위 밖이다 — 대신 최근 순으로 상위 limit개를 받아 클라이언트에서 제목/시리즈명을
  // substring 매칭한다. 리그 수가 늘어나면 서버 쪽 query 필터가 필요해지므로, 그때는
  // 이 client-side 필터를 걷어내고 서버 필터로 옮겨야 한다(임시 조치임을 명시).
  const leagueMatchesQuery = useV1LeagueMatches({ limit: 30 }, { enabled: shouldSearch });
  const normalizedQuery = submittedQuery.trim().toLowerCase();
  const leagueResults = useMemo(() => {
    if (!shouldSearch || !normalizedQuery) return [];
    return (leagueMatchesQuery.data?.items ?? []).filter(
      (item) =>
        item.title.toLowerCase().includes(normalizedQuery) ||
        (item.seriesTitle?.toLowerCase().includes(normalizedQuery) ?? false),
    );
  }, [leagueMatchesQuery.data?.items, normalizedQuery, shouldSearch]);
  const apiResults = useMemo(() => {
    if (!shouldSearch) return [];
    return [
      ...(matchesQuery.data?.items ?? []).map(toMatchResult),
      ...(teamMatchesQuery.data?.items ?? []).map(toTeamMatchResult),
      ...(teamsQuery.data?.items ?? []).map(toTeamResult),
      ...leagueResults.map(toLeagueResult),
    ];
  }, [leagueResults, matchesQuery.data?.items, shouldSearch, teamMatchesQuery.data?.items, teamsQuery.data?.items]);
  const loading = shouldSearch && (matchesQuery.isLoading || teamMatchesQuery.isLoading || teamsQuery.isLoading || leagueMatchesQuery.isLoading);
  const errored = shouldSearch && (matchesQuery.isError || teamMatchesQuery.isError || teamsQuery.isError || leagueMatchesQuery.isError);

  const viewState = useMemo<SearchState>(() => {
    if (state !== 'results') {
      return state;
    }
    if (errored) return 'error';
    if (loading) return 'stale';
    return submittedQuery.trim() ? 'results' : 'new';
  }, [errored, loading, state, submittedQuery]);

  useEffect(() => {
    if (state !== 'results') return;
    const next = new URLSearchParams(window.location.search).get('q') ?? '';
    if (!next) return;
    setQuery(next);
    setSubmittedQuery(next);
  }, [state]);

  // 통합 검색(매치/팀매치/팀/리그)이 실제로 완료된 시점에만 1회 기록한다 — 같은 검색어로
  // 로딩 상태가 재렌더링되는 동안 중복 발화되지 않도록 마지막으로 기록한 검색어를 ref로 추적.
  const trackedSearchRef = useRef<string | null>(null);
  const matchResultCount = matchesQuery.data?.items?.length ?? 0;
  const teamMatchResultCount = teamMatchesQuery.data?.items?.length ?? 0;
  const teamResultCount = teamsQuery.data?.items?.length ?? 0;
  const leagueResultCount = leagueResults.length;
  useEffect(() => {
    if (!shouldSearch || loading || errored) return;
    const trimmedQuery = submittedQuery.trim();
    if (!trimmedQuery || trackedSearchRef.current === trimmedQuery) return;
    trackedSearchRef.current = trimmedQuery;
    // GA4 는 자유 입력 텍스트를 담을 수 없는 채널이다 — 사용자가 이름/전화번호 등 개인 식별
    // 정보를 검색어로 입력할 수 있으므로(제약 없는 open text), 원문 대신 길이만 전송한다.
    //
    // domain: 설계 문서(docs/superpowers/specs/2026-07-18-logging-ga-analytics-design.md)의
    // domain enum(match|team_match|team, tournament는 제외 명시)은 이제 이 통합검색 구현과
    // 다시 어긋난다 — 그룹 C 리그 발견성 감사(Task 153 Wave 3)로 league 도메인이 추가됐다.
    // 이 화면은 tournament는 여전히 조회하지 않고 match/teamMatch/team/league 4개 도메인을
    // 항상 동시에 조회한다. 리터럴 'all'은 어떤 도메인이 실제로 결과를 낳았는지 알 수 없어
    // 세그먼트 분석이 불가능하므로, 실제로 결과가 있었던 도메인만 콤마로 join해
    // 기록한다(전부 0건이면 빈 문자열 — "빈 검색" 세그먼트로 식별 가능).
    // 문서(2026-07-18-logging-ga-analytics-design.md)도 이 커밋에서 domain enum에 league를 반영했다.
    const respondingDomains = [
      matchResultCount > 0 ? 'match' : null,
      teamMatchResultCount > 0 ? 'team_match' : null,
      teamResultCount > 0 ? 'team' : null,
      leagueResultCount > 0 ? 'league' : null,
    ].filter((domain): domain is string => domain !== null);
    trackEvent('search', {
      queryLength: trimmedQuery.length,
      resultCount: apiResults.length,
      domain: respondingDomains.join(','),
    });
  }, [apiResults.length, errored, leagueResultCount, loading, matchResultCount, shouldSearch, submittedQuery, teamMatchResultCount, teamResultCount]);

  function goBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/home');
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = query.trim();
    setSubmittedQuery(nextQuery);
    if (!nextQuery) {
      router.replace('/search/new');
      return;
    }
    router.replace(`/search?q=${encodeURIComponent(nextQuery)}`);
    recordSearch.mutate({ query: nextQuery });
  }

  function clear() {
    setQuery('');
    setSubmittedQuery('');
    router.replace('/search/new');
  }

  function useChip(value: string) {
    setQuery(value);
    setSubmittedQuery(value);
    router.replace(`/search?q=${encodeURIComponent(value)}`);
    recordSearch.mutate({ query: value, filters: { source: 'recent' } });
  }

  function retry() {
    void Promise.all([matchesQuery.refetch(), teamMatchesQuery.refetch(), teamsQuery.refetch(), leagueMatchesQuery.refetch()]);
  }

  // 결과는 API 에서 온 것만 그린다. 예전엔 /search/new 가 코드에 박힌 카드 3장(죽은 /…/sample
  // 링크)을 그렸다(2026-09-04 감사 결함) — 가짜 데이터는 어떤 상태에서도 렌더하지 않는다.
  const results = apiResults;
  const hasEmptyApiResults = shouldSearch && !loading && !errored && apiResults.length === 0;
  const effectiveViewState = viewState === 'results' && hasEmptyApiResults ? 'empty' : viewState;

  return (
    <div className="tm-search-frame tm-content-enter" style={{ width: 'min(100%, var(--v1-app-chrome-frame-width))', height: '100%', minHeight: 0, margin: '0 auto', background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      <form className="tm-search-form-bar" onSubmit={submit} style={{ minHeight: 'var(--v1-shell-topbar-height)', padding: '8px 12px 8px 8px', borderBottom: '1px solid var(--grey100)', display: 'flex', alignItems: 'center', gap: 1, background: 'var(--bg)', flexShrink: 0 }}>
        <button type="button" aria-label="뒤로가기" onClick={goBack} className="tm-search-back-btn tm-hide-desktop tm-tap-44" style={{ width: 30, minWidth: 30, height: 40, border: 0, background: 'transparent', borderRadius: 'var(--radius-control)', display: 'grid', placeItems: 'center', color: 'var(--text-strong)', padding: 0 }}>
          <ChevronLeft size={20} />
        </button>
        <div className="tm-search-input-wrap" style={{ flex: 1, minHeight: 44, borderRadius: 'var(--radius-field)', background: 'var(--grey100)', border: viewState === 'error' ? '1px solid var(--red500)' : query ? '1px solid var(--blue500)' : '1px solid transparent', display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px 0 16px', minWidth: 0 }}>
          <input
            aria-label="검색어"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="검색어를 입력해 주세요"
            style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', color: 'var(--text-strong)' }}
            className="tm-text-body"
            autoFocus
          />
          {query ? (
            <button type="button" aria-label="검색어 지우기" onClick={clear} className="tm-tap-44" style={{ width: 30, minWidth: 30, height: 30, border: 0, background: 'transparent', display: 'grid', placeItems: 'center', padding: 0 }}>
              <span style={{ width: 20, height: 20, borderRadius: 'var(--radius-pill)', background: 'var(--grey400)', color: 'var(--static-white)', display: 'grid', placeItems: 'center' }}>
                <X size={13} />
              </span>
            </button>
          ) : null}
          <button type="submit" aria-label="검색" className="tm-tap-44" style={{ width: 34, minWidth: 34, height: 34, border: 0, background: 'transparent', borderRadius: 11, display: 'grid', placeItems: 'center', color: viewState === 'error' ? 'var(--red500)' : 'var(--blue500)', padding: 0 }}>
            <Search size={19} />
          </button>
        </div>
      </form>

      <div className="tm-search-body" style={{ flex: 1, overflow: 'auto', padding: '20px var(--v1-shell-page-x) calc(24px + var(--v1-shell-safe-bottom))' }}>
        <div className="tm-search-panel">
          <div className="tm-search-panel-col">
            <div className="tm-text-label">최근 검색</div>
            <div className="tm-search-recent-chips" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {(recentSearches.data?.items ?? []).map((item, index) => (
                <button key={item.id} type="button" onClick={() => useChip(item.query)} className={`tm-chip ${index === 0 ? 'tm-chip-active' : ''}`}>
                  {item.query}
                </button>
              ))}
              {!recentSearches.isLoading && !recentSearches.data?.items.length ? (
                <span className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>최근 검색어가 없어요.</span>
              ) : null}
              {recentSearches.isLoading ? (
                <span className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>최근 검색어를 불러오는 중이에요</span>
              ) : null}
            </div>

          </div>

          <div className="tm-search-results-col">
            <div style={{ height: 1, background: 'var(--grey100)', margin: '20px 0 20px' }} className="tm-hide-desktop" />
            <div className="tm-search-results-header">
              <div className="tm-text-label">검색 결과</div>
              {submittedQuery ? (
                <div className="tm-text-caption" style={{ marginTop: 2 }}>
                  {submittedQuery} · 매치/팀매치/팀/정규 리그 통합 조회
                </div>
              ) : null}
            </div>

            {effectiveViewState === 'results' ? (
              <div className="tm-search-results-list" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                {results.map((item) => (
                  <button key={item.title} type="button" onClick={() => router.push(item.href)} className="tm-card tm-card-interactive tm-search-result-card" style={{ width: '100%', textAlign: 'left', border: 0, background: 'var(--bg)', padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="tm-badge tm-badge-blue tm-badge-sm">{item.type}</span>
                      <div className="tm-text-body-lg">{item.title}</div>
                    </div>
                    <div className="tm-text-caption" style={{ marginTop: 8 }}>{item.meta}</div>
                  </button>
                ))}
              </div>
            ) : null}

            {/* 상태 화면은 전부 공용 EmptyState/ErrorState — 예전의 회색 사각 아이콘 + 한 줄 문구(다음 행동 없음)를
                그래픽 → 타이틀 → 다음 행동 순서로 통일한다. 나침반은 인증 안내와 같은 자산("다른 길이 있다"). */}
            {effectiveViewState === 'new' ? (
              <EmptyState
                illustration={{ name: AUTH_NOTICE_STAGE.illustration }}
                title="무엇을 찾고 있나요?"
                sub="매치·팀매치·팀·정규 리그를 검색어 하나로 한 번에 찾아요."
              />
            ) : null}

            {effectiveViewState === 'empty' ? (
              <EmptyState
                illustration={{ name: AUTH_NOTICE_STAGE.illustration }}
                title="조건에 맞는 결과가 없어요"
                sub="검색어를 바꾸거나 전체 매치를 둘러보면 다른 경기가 보여요."
                cta="전체 매치 둘러보기"
                onCta={() => router.push('/matches')}
              />
            ) : null}

            {effectiveViewState === 'error' ? (
              <ErrorState title="검색 결과를 불러오지 못했어요" message="검색어와 조건은 그대로 남아 있어요. 다시 불러올 수 있어요." onRetry={retry} retryLabel="다시 불러오기" />
            ) : null}

            {effectiveViewState === 'stale' ? (
              <div className="tm-text-caption tm-search-state-loading" role="status" style={{ marginTop: 24, textAlign: 'center', color: 'var(--text-caption)' }}>
                최신 결과를 불러오는 중이에요
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {effectiveViewState === 'error' ? (
        <div className="tm-native-toast-card tm-search-error-toast" style={{ position: 'absolute', left: 'var(--v1-shell-page-x)', right: 'var(--v1-shell-page-x)', bottom: 'calc(22px + var(--v1-shell-safe-bottom))', minHeight: 48, borderRadius: 'var(--radius-field)', background: 'var(--scrim-dark-94)', color: 'var(--static-white)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px', fontSize: 13, fontWeight: 700 }}>
          검색 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.
        </div>
      ) : null}
    </div>
  );
}

function getInitialQuery(state: SearchState) {
  if (state === 'new') return '';
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('q') ?? '';
}

function toMatchResult(item: V1Match) {
  return {
    type: '매치',
    title: item.title,
    meta: [item.sport?.name ?? item.sportName, item.place?.name ?? item.placeName, formatDateTime(item.startsAt), item.capacityText].filter(Boolean).join(' · '),
    href: `/matches/${item.matchId ?? item.id}`,
  };
}

function toTeamMatchResult(item: V1TeamMatch) {
  return {
    type: '팀매치',
    title: item.title,
    meta: [item.sport?.name ?? item.sportName, item.hostTeam?.name ?? item.hostTeamName, item.place?.name ?? item.placeName, formatDateTime(item.startsAt)].filter(Boolean).join(' · '),
    href: `/team-matches/${item.teamMatchId ?? item.id}`,
  };
}

function toLeagueResult(item: V1PublicLeagueListItem) {
  const dateLabel = formatTournamentDateRangeShort(item.startsOn, item.endsOn);
  return {
    type: '정규 리그',
    title: item.title,
    meta: [item.sport.name, item.region.name, item.tierLabel, dateLabel ?? '일정 미정', `${item.teamCount}팀 참가`]
      .filter(Boolean)
      .join(' · '),
    href: `/league-matches/${item.leagueId}`,
  };
}

function toTeamResult(item: V1Team) {
  return {
    type: '팀',
    title: item.name,
    meta: [item.sport?.name ?? item.sportName, item.region?.name ?? item.regionName, `${item.memberCount}명`, item.joinPolicy === 'approval_required' ? '신입 환영' : '모집 마감'].filter(Boolean).join(' · '),
    href: `/teams/${item.teamId ?? item.id}`,
  };
}

function formatDateTime(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
