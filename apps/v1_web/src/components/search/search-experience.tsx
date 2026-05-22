'use client';

import { Search, X, ChevronLeft, Clock, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';

type SearchState = 'results' | 'new' | 'empty' | 'error' | 'stale';

type SearchExperienceProps = {
  state?: SearchState;
};

const recentSearches = ['동네', '강남', '오늘 대기', '마감임박'];
const quickFilters = [
  ['오늘 참여 가능', '오늘 매치만 기준'],
  ['마감임박', '24시간 이내'],
  ['초보 환영', '레벨 필터 적용'],
  ['팀 매치 포함', '팀매치 결과 함께 보기'],
];

const baseResults = [
  { type: '매치', title: '성수 저녁 풋살', meta: '성수 풋살파크 · 오늘 20:00 · 8/10명', href: '/matches/sample' },
  { type: '팀매치', title: '마포 풋살 팀매치', meta: '마포 실내체육관 · 토요일 · 상대팀 모집중', href: '/team-matches/sample' },
  { type: '팀', title: '성수 러너스 FC', meta: '풋살 · 성동구 · 신입 환영', href: '/teams/sample' },
];

export function SearchExperience({ state = 'results' }: SearchExperienceProps) {
  const router = useRouter();
  const [query, setQuery] = useState(state === 'new' ? '' : '동네');
  const [submittedQuery, setSubmittedQuery] = useState(state === 'new' ? '' : '동네');

  const viewState = useMemo<SearchState>(() => {
    if (state !== 'results') {
      return state;
    }
    return submittedQuery.trim() ? 'results' : 'new';
  }, [state, submittedQuery]);

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
    router.replace('/search');
  }

  function clear() {
    setQuery('');
    setSubmittedQuery('');
    router.replace('/search/new');
  }

  function useChip(value: string) {
    setQuery(value);
    setSubmittedQuery(value);
    router.replace('/search');
  }

  const showStateMessage = viewState === 'empty' || viewState === 'error' || viewState === 'stale';

  return (
    <div style={{ width: 'min(100%, 375px)', height: '100dvh', margin: '0 auto', background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      <form onSubmit={submit} style={{ minHeight: 56, padding: '8px 10px 8px 8px', borderBottom: '1px solid var(--grey100)', display: 'flex', alignItems: 'center', gap: 1, background: 'var(--bg)', flexShrink: 0 }}>
        <button type="button" aria-label="back" onClick={goBack} style={{ width: 30, minWidth: 30, height: 40, border: 0, background: 'transparent', borderRadius: 12, display: 'grid', placeItems: 'center', color: 'var(--text-strong)', padding: 0 }}>
          <ChevronLeft size={20} />
        </button>
        <div style={{ flex: 1, minHeight: 44, borderRadius: 14, background: 'var(--grey100)', border: viewState === 'error' ? '1px solid var(--red500)' : query ? '1px solid var(--blue500)' : '1px solid transparent', display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px 0 14px', minWidth: 0 }}>
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
            <button type="button" aria-label="clear search" onClick={clear} style={{ width: 30, minWidth: 30, height: 30, border: 0, background: 'transparent', display: 'grid', placeItems: 'center', padding: 0 }}>
              <span style={{ width: 20, height: 20, borderRadius: 999, background: 'var(--grey400)', color: 'var(--static-white)', display: 'grid', placeItems: 'center' }}>
                <X size={13} />
              </span>
            </button>
          ) : null}
          <button type="submit" aria-label="submit search" style={{ width: 34, minWidth: 34, height: 34, border: 0, background: 'transparent', borderRadius: 11, display: 'grid', placeItems: 'center', color: viewState === 'error' ? 'var(--red500)' : 'var(--blue500)', padding: 0 }}>
            <Search size={19} />
          </button>
        </div>
      </form>

      <div style={{ flex: 1, overflow: 'auto', padding: '18px 20px 22px' }}>
        <div className="tm-text-label">최근 검색</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {recentSearches.map((label, index) => (
            <button key={label} type="button" onClick={() => useChip(label)} className={`tm-chip ${index === 0 ? 'tm-chip-active' : ''}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="tm-text-label" style={{ marginTop: 20 }}>빠른 조건</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
          {quickFilters.map(([title, sub], index) => (
            <button key={title} type="button" onClick={() => useChip(title)} className="tm-card tm-card-interactive" style={{ textAlign: 'left', padding: 14, border: 0, background: index === 0 ? 'var(--blue50)' : 'var(--bg)' }}>
              <div className="tm-text-label" style={{ color: index === 0 ? 'var(--blue500)' : 'var(--text-strong)' }}>{title}</div>
              <div className="tm-text-micro" style={{ marginTop: 4, color: 'var(--text-caption)' }}>{sub}</div>
            </button>
          ))}
        </div>

        <div style={{ height: 1, background: 'var(--grey100)', margin: '20px 0 18px' }} />
        <div>
          <div className="tm-text-label">검색 결과</div>
          <div className="tm-text-caption" style={{ marginTop: 2 }}>
            {submittedQuery || '입력 전'} · 매치/팀매치/팀 통합 조회
          </div>
        </div>

        {viewState === 'results' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {baseResults.map((item) => (
              <button key={item.title} type="button" onClick={() => router.push(item.href)} className="tm-card tm-card-interactive" style={{ width: '100%', textAlign: 'left', border: 0, background: 'var(--bg)', padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="tm-badge tm-badge-blue tm-badge-sm">{item.type}</span>
                  <div className="tm-text-body-lg">{item.title}</div>
                </div>
                <div className="tm-text-caption" style={{ marginTop: 6 }}>{item.meta}</div>
              </button>
            ))}
          </div>
        ) : null}

        {viewState === 'new' ? (
          <div style={{ marginTop: 42, textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ width: 48, height: 48, borderRadius: 16, background: 'var(--grey50)', display: 'grid', placeItems: 'center', margin: '0 auto 14px', color: 'var(--grey500)' }}>
              <Search size={22} />
            </div>
            <div className="tm-text-body-lg">검색어를 입력하거나 조건을 선택해 주세요</div>
            <div className="tm-text-caption" style={{ marginTop: 6 }}>최근 검색과 빠른 조건은 검색 전에도 유지됩니다.</div>
          </div>
        ) : null}

        {showStateMessage ? (
          <div style={{ marginTop: 42, textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ width: 48, height: 48, borderRadius: 16, background: 'var(--grey50)', display: 'grid', placeItems: 'center', margin: '0 auto 14px', color: viewState === 'error' ? 'var(--red500)' : 'var(--grey500)' }}>
              {viewState === 'stale' ? <Clock size={22} /> : viewState === 'error' ? <AlertCircle size={22} /> : <Search size={22} />}
            </div>
            <div className="tm-text-body-lg">{viewState === 'stale' ? '최신 검색 결과를 확인 중입니다.' : viewState === 'error' ? '검색 결과를 불러오지 못했습니다.' : '검색 결과가 없습니다.'}</div>
            <div className="tm-text-caption" style={{ marginTop: 6 }}>검색어와 조건은 유지됩니다.</div>
          </div>
        ) : null}
      </div>

      {viewState === 'error' ? (
        <div style={{ position: 'absolute', left: 20, right: 20, bottom: 22, minHeight: 48, borderRadius: 14, background: 'rgba(25,31,40,.94)', color: 'var(--static-white)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 14px', fontSize: 13, fontWeight: 700 }}>
          새로고침이 필요합니다. 잠시 후 다시 검색해 주세요.
        </div>
      ) : null}
    </div>
  );
}
