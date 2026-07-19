'use client';

import { Search, X, ChevronLeft, Clock, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useV1Matches, useV1RecentSearches, useV1RecordSearch, useV1TeamMatches, useV1Teams } from '@/hooks/use-v1-api';
import type { V1Match, V1Team, V1TeamMatch } from '@/types/api';
import { AppChrome } from '@/components/v1-ui/shell';
import { trackEvent } from '@/lib/analytics';

type SearchState = 'results' | 'new' | 'empty' | 'error' | 'stale';

type SearchExperienceProps = {
  state?: SearchState;
};

const quickFilters = [
  ['오늘 참여 가능', '오늘 매치만 기준'],
  ['마감임박', '24시간 이내'],
  ['초보 환영', '레벨 필터 적용'],
  ['팀매치 포함', '팀매치 결과 함께 보기'],
];

const baseResults = [
  { type: '매치', title: '성수 저녁 풋살', meta: '성수 풋살파크 · 오늘 20:00 · 8/10명', href: '/matches/sample' },
  { type: '팀매치', title: '마포 풋살 팀매치', meta: '마포 실내체육관 · 토요일 · 상대팀 모집 중', href: '/team-matches/sample' },
  { type: '팀', title: '성수 러너스 FC', meta: '풋살 · 성동구 · 신입 환영', href: '/teams/sample' },
];

export function SearchExperience({ state = 'results' }: SearchExperienceProps) {
  const router = useRouter();
  const initialQuery = getInitialQuery(state);
  const [query, setQuery] = useState(initialQuery);
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery);
  const [selectedQuickFilter, setSelectedQuickFilter] = useState<string | null>(null);
  const shouldSearch = state === 'results' && submittedQuery.trim().length > 0;
  const filters = useMemo(() => ({ query: submittedQuery.trim(), limit: 5, sort: 'recommended' }), [submittedQuery]);
  const recentSearches = useV1RecentSearches();
  const recordSearch = useV1RecordSearch();
  const matchesQuery = useV1Matches(filters, { enabled: shouldSearch });
  const teamMatchesQuery = useV1TeamMatches(filters, { enabled: shouldSearch });
  const teamsQuery = useV1Teams(filters, { enabled: shouldSearch });
  const apiResults = useMemo(() => {
    if (!shouldSearch) return [];
    return [
      ...(matchesQuery.data?.items ?? []).map(toMatchResult),
      ...(teamMatchesQuery.data?.items ?? []).map(toTeamMatchResult),
      ...(teamsQuery.data?.items ?? []).map(toTeamResult),
    ];
  }, [matchesQuery.data?.items, shouldSearch, teamMatchesQuery.data?.items, teamsQuery.data?.items]);
  const loading = shouldSearch && (matchesQuery.isLoading || teamMatchesQuery.isLoading || teamsQuery.isLoading);
  const errored = shouldSearch && (matchesQuery.isError || teamMatchesQuery.isError || teamsQuery.isError);

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

  // 통합 검색(매치/팀매치/팀)이 실제로 완료된 시점에만 1회 기록한다 — 같은 검색어로
  // 로딩 상태가 재렌더링되는 동안 중복 발화되지 않도록 마지막으로 기록한 검색어를 ref로 추적.
  const trackedSearchRef = useRef<string | null>(null);
  useEffect(() => {
    if (!shouldSearch || loading || errored) return;
    const trimmedQuery = submittedQuery.trim();
    if (!trimmedQuery || trackedSearchRef.current === trimmedQuery) return;
    trackedSearchRef.current = trimmedQuery;
    // GA4 는 자유 입력 텍스트를 담을 수 없는 채널이다 — 사용자가 이름/전화번호 등 개인 식별
    // 정보를 검색어로 입력할 수 있으므로(제약 없는 open text), 원문 대신 길이만 전송한다.
    trackEvent('search', { queryLength: trimmedQuery.length, resultCount: apiResults.length, domain: 'all' });
  }, [apiResults.length, errored, loading, shouldSearch, submittedQuery]);

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
    recordSearch.mutate({ query: nextQuery, filters: selectedQuickFilter ? { quickFilter: selectedQuickFilter } : undefined });
  }

  function clear() {
    setQuery('');
    setSubmittedQuery('');
    router.replace('/search/new');
  }

  function useChip(value: string) {
    setSelectedQuickFilter(null);
    setQuery(value);
    setSubmittedQuery(value);
    router.replace(`/search?q=${encodeURIComponent(value)}`);
    recordSearch.mutate({ query: value, filters: { source: 'recent' } });
  }

  function toggleQuickFilter(value: string) {
    setSelectedQuickFilter(value);
    setQuery(value);
    setSubmittedQuery(value);
    router.replace(`/search?q=${encodeURIComponent(value)}`);
    recordSearch.mutate({ query: value, filters: { quickFilter: value } });
  }

  const results = state === 'results' ? apiResults : baseResults;
  const hasEmptyApiResults = shouldSearch && !loading && !errored && apiResults.length === 0;
  const effectiveViewState = viewState === 'results' && hasEmptyApiResults ? 'empty' : viewState;
  const effectiveShowStateMessage = effectiveViewState === 'empty' || effectiveViewState === 'error' || effectiveViewState === 'stale';

  return (
    <AppChrome
      title="검색"
      topBar={false}
      showSearch={false}
      showNotifications={false}
      bottomNav={true}
    >
    <div className="tm-search-frame" style={{ width: 'min(100%, var(--v1-app-chrome-frame-width))', height: '100%', minHeight: 0, margin: '0 auto', background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      <form className="tm-search-form-bar" onSubmit={submit} style={{ minHeight: 'var(--v1-shell-topbar-height)', padding: '8px 10px 8px 8px', borderBottom: '1px solid var(--grey100)', display: 'flex', alignItems: 'center', gap: 1, background: 'var(--bg)', flexShrink: 0 }}>
        <button type="button" aria-label="뒤로가기" onClick={goBack} className="tm-search-back-btn tm-hide-desktop" style={{ width: 30, minWidth: 30, height: 40, border: 0, background: 'transparent', borderRadius: 12, display: 'grid', placeItems: 'center', color: 'var(--text-strong)', padding: 0 }}>
          <ChevronLeft size={20} />
        </button>
        <div className="tm-search-input-wrap" style={{ flex: 1, minHeight: 44, borderRadius: 14, background: 'var(--grey100)', border: viewState === 'error' ? '1px solid var(--red500)' : query ? '1px solid var(--blue500)' : '1px solid transparent', display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px 0 14px', minWidth: 0 }}>
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
            <button type="button" aria-label="검색어 지우기" onClick={clear} style={{ width: 30, minWidth: 30, height: 30, border: 0, background: 'transparent', display: 'grid', placeItems: 'center', padding: 0 }}>
              <span style={{ width: 20, height: 20, borderRadius: 999, background: 'var(--grey400)', color: 'var(--static-white)', display: 'grid', placeItems: 'center' }}>
                <X size={13} />
              </span>
            </button>
          ) : null}
          <button type="submit" aria-label="검색" style={{ width: 34, minWidth: 34, height: 34, border: 0, background: 'transparent', borderRadius: 11, display: 'grid', placeItems: 'center', color: viewState === 'error' ? 'var(--red500)' : 'var(--blue500)', padding: 0 }}>
            <Search size={19} />
          </button>
        </div>
      </form>

      <div className="tm-search-body" style={{ flex: 1, overflow: 'auto', padding: '18px var(--v1-shell-page-x) calc(22px + var(--v1-shell-safe-bottom))' }}>
        <div className="tm-search-panel">
          <div className="tm-search-panel-col">
            <div className="tm-text-label">최근 검색</div>
            <div className="tm-search-recent-chips" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
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

            <div className="tm-text-label" style={{ marginTop: 20 }}>빠른 조건</div>
            <div className="tm-search-quick-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              {quickFilters.map(([title, sub]) => {
                const selected = selectedQuickFilter === title;
                return (
                  <button key={title} type="button" onClick={() => toggleQuickFilter(title)} className="tm-card tm-card-interactive" aria-pressed={selected} style={{ textAlign: 'left', padding: 14, border: 0, background: selected ? 'var(--blue50)' : 'var(--bg)' }}>
                    <div className="tm-text-label" style={{ color: selected ? 'var(--blue500)' : 'var(--text-strong)' }}>{title}</div>
                    <div className="tm-text-micro" style={{ marginTop: 4, color: 'var(--text-caption)' }}>{sub}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="tm-search-results-col">
            <div style={{ height: 1, background: 'var(--grey100)', margin: '20px 0 18px' }} className="tm-hide-desktop" />
            <div className="tm-search-results-header">
              <div className="tm-text-label">검색 결과</div>
              {submittedQuery ? (
                <div className="tm-text-caption" style={{ marginTop: 2 }}>
                  {submittedQuery} · 매치/팀매치/팀 통합 조회
                </div>
              ) : null}
            </div>

            {effectiveViewState === 'results' ? (
              <div className="tm-search-results-list" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                {results.map((item) => (
                  <button key={item.title} type="button" onClick={() => router.push(item.href)} className="tm-card tm-card-interactive tm-search-result-card" style={{ width: '100%', textAlign: 'left', border: 0, background: 'var(--bg)', padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="tm-badge tm-badge-blue tm-badge-sm">{item.type}</span>
                      <div className="tm-text-body-lg">{item.title}</div>
                    </div>
                    <div className="tm-text-caption" style={{ marginTop: 6 }}>{item.meta}</div>
                  </button>
                ))}
              </div>
            ) : null}

            {effectiveViewState === 'new' ? (
              <div className="tm-search-state-msg" style={{ marginTop: 42, textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ width: 48, height: 48, borderRadius: 16, background: 'var(--grey50)', display: 'grid', placeItems: 'center', margin: '0 auto 14px', color: 'var(--grey500)' }}>
                  <Search size={22} />
                </div>
                <div className="tm-text-body-lg">검색어를 입력하거나 조건을 선택해 주세요</div>
                <div className="tm-text-caption" style={{ marginTop: 6 }}>최근 검색과 빠른 조건은 검색 전에도 그대로 있어요.</div>
              </div>
            ) : null}

            {effectiveShowStateMessage ? (
              <div className="tm-search-state-msg" style={{ marginTop: 42, textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ width: 48, height: 48, borderRadius: 16, background: 'var(--grey50)', display: 'grid', placeItems: 'center', margin: '0 auto 14px', color: effectiveViewState === 'error' ? 'var(--red500)' : 'var(--grey500)' }}>
                  {effectiveViewState === 'stale' ? <Clock size={22} /> : effectiveViewState === 'error' ? <AlertCircle size={22} /> : <Search size={22} />}
                </div>
                <div className="tm-text-body-lg">{effectiveViewState === 'stale' ? '최신 결과를 불러오는 중이에요.' : effectiveViewState === 'error' ? '검색 결과를 불러오지 못했어요.' : '검색 결과가 없어요.'}</div>
                <div className="tm-text-caption" style={{ marginTop: 6 }}>검색어와 조건은 그대로 남아 있어요.</div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {effectiveViewState === 'error' ? (
        <div className="tm-search-error-toast" style={{ position: 'absolute', left: 'var(--v1-shell-page-x)', right: 'var(--v1-shell-page-x)', bottom: 'calc(22px + var(--v1-shell-safe-bottom))', minHeight: 48, borderRadius: 14, background: 'rgba(25,31,40,.94)', color: 'var(--static-white)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 14px', fontSize: 13, fontWeight: 700 }}>
          검색 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.
        </div>
      ) : null}
    </div>
    </AppChrome>
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
