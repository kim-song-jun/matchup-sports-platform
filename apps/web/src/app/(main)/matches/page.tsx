'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, SlidersHorizontal } from 'lucide-react';
import { useMatches } from '@/hooks/use-api';
import { useDebounce } from '@/hooks/use-debounce';
import { ErrorState } from '@/components/ui/error-state';
import { sportLabel, levelLabel } from '@/lib/constants';
import { formatCurrency, formatMatchDate, getTimeBadge } from '@/lib/utils';
import { getSportImage } from '@/lib/sport-image';
import type { Match } from '@/types/api';

const sportFilters = [
  { key: '', label: '전체' },
  { key: 'soccer', label: '축구' },
  { key: 'futsal', label: '풋살' },
  { key: 'basketball', label: '농구' },
  { key: 'badminton', label: '배드민턴' },
  { key: 'ice_hockey', label: '아이스하키' },
  { key: 'swimming', label: '수영' },
  { key: 'tennis', label: '테니스' },
];

const MatchCard = React.memo(function MatchCard({ match }: { match: Match }) {
  const filled = match.currentPlayers / match.maxPlayers;
  const isAlmostFull = filled >= 0.7;
  const timeBadge = getTimeBadge(match.matchDate);

  return (
    <Link href={`/matches/${match.id}`}>
      <div className="rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden flex hover:bg-gray-50 dark:hover:bg-gray-750 active:scale-[0.98] transition-colors">
        {/* 이미지 */}
        <div className="w-28 shrink-0 bg-gray-100 dark:bg-gray-800 overflow-hidden relative">
          <img src={getSportImage(match.sportType, match.imageUrl)} alt={match.title} className="w-full h-full object-cover" loading="lazy" />
          {timeBadge && (
            <span className="absolute top-1.5 left-1.5 text-[9px] font-bold bg-gray-900/70 text-white rounded-md px-1.5 py-0.5">{timeBadge.text}</span>
          )}
        </div>
        {/* 텍스트 */}
        <div className="flex-1 bg-white dark:bg-gray-800 p-3 min-w-0 flex flex-col justify-center">
          <h3 className="text-[14px] font-semibold text-gray-900 dark:text-gray-100 truncate">
            {match.title.replace(/[\u{1F300}-\u{1FAFF}]/gu, '').trim()}
          </h3>
          <p className="text-[11px] text-gray-500 mt-1">
            {sportLabel[match.sportType]} · {formatMatchDate(match.matchDate)} {match.startTime}
          </p>
          {match.venue?.name && <p className="text-[11px] text-gray-500 mt-0.5 truncate">{match.venue.name}</p>}
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`text-[12px] font-semibold ${isAlmostFull ? 'text-red-500' : 'text-gray-700 dark:text-gray-300'}`}>
              {match.currentPlayers}/{match.maxPlayers}명
            </span>
            <span className="text-[11px] text-gray-500">{formatCurrency(match.fee)}</span>
            {isAlmostFull && <span className="text-[10px] font-medium text-red-500">마감임박</span>}
          </div>
        </div>
      </div>
    </Link>
  );
});

export default function MatchesPage() {
  const [activeSport, setActiveSport] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [showFilters, setShowFilters] = useState(false);
  const [dateFilter, setDateFilter] = useState('');
  const [sortBy, setSortBy] = useState<'latest' | 'deadline'>('latest');
  const params = activeSport ? { sportType: activeSport } : undefined;
  const { data, isLoading, error, refetch } = useMatches(params);
  const allMatches = data?.items ?? [];
  const matches = useMemo(() => {
    let result = debouncedSearch
      ? allMatches.filter((m: Match) =>
          m.title.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          m.venue?.name?.toLowerCase().includes(debouncedSearch.toLowerCase())
        )
      : allMatches;
    if (dateFilter) {
      result = result.filter((m: Match) => m.matchDate?.startsWith(dateFilter));
    }
    if (sortBy === 'deadline') {
      result = [...result].sort((a: Match, b: Match) => {
        const fa = a.currentPlayers / a.maxPlayers;
        const fb = b.currentPlayers / b.maxPlayers;
        return fb - fa;
      });
    }
    return result;
  }, [allMatches, debouncedSearch, dateFilter, sortBy]);

  return (
    <div className="pt-[var(--safe-area-top)]">
      <header className="px-5 lg:px-0 pt-4 pb-3">
        <h1 className="text-[22px] font-bold text-gray-900 dark:text-white">매치 찾기</h1>
      </header>

      {/* 검색바 */}
      <div className="px-5 lg:px-0 mb-3">
        <div className="relative flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input type="text" placeholder="지역, 시설명 검색" value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl bg-gray-50 dark:bg-gray-800 py-3 pl-10 pr-4 text-[14px] text-gray-900 dark:text-gray-100 placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white dark:focus:bg-gray-900 transition-colors" />
          </div>
          <button onClick={() => setShowFilters(!showFilters)} aria-label="필터 열기"
            className={`flex h-[46px] w-[46px] items-center justify-center rounded-xl transition-colors ${showFilters ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-50 dark:bg-gray-800 text-gray-500 active:bg-gray-100'}`}>
            <SlidersHorizontal size={16} />
          </button>
        </div>
      </div>

      {/* 필터 칩 */}
      <div className="px-5 lg:px-0 mb-4 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {sportFilters.map((f) => (
          <button key={f.key} onClick={() => setActiveSport(f.key)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
              activeSport === f.key
                ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                : 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* 상세 필터 */}
      {showFilters && (
        <div className="px-5 lg:px-0 mb-4">
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4 space-y-3">
            <div>
              <label className="text-[12px] font-medium text-gray-500 mb-1.5 block">날짜</label>
              <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-[14px] text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-gray-500 mb-1.5 block">정렬</label>
              <div className="flex gap-2">
                {(['latest', 'deadline'] as const).map((s) => (
                  <button key={s} onClick={() => setSortBy(s)}
                    className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${sortBy === s ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600'}`}>
                    {s === 'latest' ? '최신순' : '마감임박'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {!isLoading && matches.length > 0 && (
        <div className="px-5 lg:px-0 mb-3">
          <p className="text-[13px] text-gray-500">{matches.length}개의 매치</p>
        </div>
      )}

      {/* 매치 리스트 */}
      <div className="px-5 lg:px-0">
        {isLoading ? (
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-[92px] rounded-xl bg-gray-50 dark:bg-gray-800 skeleton-shimmer" />
            ))}
          </div>
        ) : error ? (
          <ErrorState onRetry={() => refetch()} />
        ) : matches.length === 0 ? (
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 py-14 text-center">
            <p className="text-[14px] text-gray-500">
              {activeSport ? `${sportLabel[activeSport]} 매치가 없어요` : '매치가 없어요'}
            </p>
            <p className="text-[13px] text-gray-500 mt-1">직접 매치를 만들어보세요</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 stagger-children">
            {matches.map((match: Match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
