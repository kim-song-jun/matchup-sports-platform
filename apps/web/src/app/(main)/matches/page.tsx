'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, SlidersHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMatches } from '@/hooks/use-api';
import { useDebounce } from '@/hooks/use-debounce';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { sportLabel, levelLabel, sportCardAccent } from '@/lib/constants';
import { formatCurrency, formatMatchDate, getTimeBadge } from '@/lib/utils';
import { getSportImage } from '@/lib/sport-image';
import type { Match } from '@/types/api';

const MatchCard = React.memo(function MatchCard({ match, almostFullLabel }: { match: Match; almostFullLabel: string }) {
  const filled = match.currentPlayers / match.maxPlayers;
  const isAlmostFull = filled >= 0.7;
  const timeBadge = getTimeBadge(match.matchDate);

  return (
    <Link href={`/matches/${match.id}`}>
      <div className="rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden flex hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-[0.98] transition-colors">
        {/* 이미지 */}
        <div className="w-28 shrink-0 bg-gray-100 dark:bg-gray-800 overflow-hidden relative">
          <img src={getSportImage(match.sportType, match.imageUrl)} alt={match.title} className="w-full h-full object-cover" loading="lazy" />
          {timeBadge && (
            <span className="absolute top-1.5 left-1.5 text-2xs font-bold bg-gray-900/70 text-white rounded-md px-1.5 py-0.5">{timeBadge.text}</span>
          )}
        </div>
        {/* 텍스트 */}
        <div className="flex-1 bg-white dark:bg-gray-800 p-4 min-w-0 flex flex-col justify-center">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
            {match.title}
          </h3>
          <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5 truncate">
            <span className={`${sportCardAccent[match.sportType]?.badge || 'bg-gray-100 text-gray-500'} rounded-full px-2 py-0.5 text-xs font-normal shrink-0`}>
              {sportLabel[match.sportType]}
            </span>
            <span className="shrink-0">{formatMatchDate(match.matchDate)} {match.startTime}</span>
            {match.venue?.name && <><span className="shrink-0">·</span><span className="truncate">{match.venue.name}</span></>}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`text-xs font-normal ${isAlmostFull ? 'text-amber-500' : 'text-gray-700 dark:text-gray-300'}`}>
              {match.currentPlayers}/{match.maxPlayers}
            </span>
            <span className="text-xs text-gray-500">{formatCurrency(match.fee)}</span>
            {match.levelMin != null && match.levelMax != null && (
              <span className="text-2xs text-gray-500 dark:text-gray-400">{levelLabel[match.levelMin]}~{levelLabel[match.levelMax]}</span>
            )}
            {isAlmostFull && <span className="text-2xs font-medium text-amber-500">{almostFullLabel}</span>}
          </div>
        </div>
      </div>
    </Link>
  );
});

export default function MatchesPage() {
  const t = useTranslations('matches');
  const te = useTranslations('empty');
  const ts = useTranslations('sports');
  const [activeSport, setActiveSport] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [showFilters, setShowFilters] = useState(false);
  const [dateFilter, setDateFilter] = useState('');
  const [sortBy, setSortBy] = useState<'latest' | 'deadline'>('latest');
  const params = activeSport ? { sportType: activeSport } : undefined;
  const { data, isLoading, error, refetch } = useMatches(params);

  const sportFilters = [
    { key: '', label: ts('all') },
    { key: 'soccer', label: ts('soccer') },
    { key: 'futsal', label: ts('futsal') },
    { key: 'basketball', label: ts('basketball') },
    { key: 'badminton', label: ts('badminton') },
    { key: 'ice_hockey', label: ts('ice_hockey') },
    { key: 'swimming', label: ts('swimming') },
    { key: 'tennis', label: ts('tennis') },
  ];
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
      <header className="px-5 @3xl:px-0 pt-4 pb-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('findMatch')}</h1>
      </header>

      {/* 검색바 */}
      <div className="px-5 @3xl:px-0 mb-3">
        <div className="relative flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input type="text" placeholder={t('searchPlaceholder')} value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl bg-gray-50 dark:bg-gray-800 py-3 pl-10 pr-4 text-base text-gray-900 dark:text-gray-100 placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white dark:focus:bg-gray-900 transition-colors" />
          </div>
          <button onClick={() => setShowFilters(!showFilters)} aria-label={t('openFilters')}
            className={`flex h-[46px] w-[46px] items-center justify-center rounded-xl transition-colors ${showFilters ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-50 dark:bg-gray-800 text-gray-500 active:bg-gray-100'}`}>
            <SlidersHorizontal size={16} />
          </button>
        </div>
      </div>

      {/* 필터 칩 */}
      <div className="px-5 @3xl:px-0 mb-4 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {sportFilters.map((f) => (
          <button key={f.key} onClick={() => setActiveSport(f.key)}
            className={`shrink-0 min-h-[44px] rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
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
        <div className="px-5 @3xl:px-0 mb-4">
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">{t('date')}</label>
              <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-base text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">{t('sort')}</label>
              <div className="flex gap-2">
                {(['latest', 'deadline'] as const).map((s) => (
                  <button key={s} onClick={() => setSortBy(s)}
                    className={`min-h-[44px] rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${sortBy === s ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600'}`}>
                    {s === 'latest' ? t('latest') : t('deadline')}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {!isLoading && matches.length > 0 && (
        <div className="px-5 @3xl:px-0 mb-3">
          <p className="text-sm text-gray-500">{t('matchCount', { count: matches.length })}</p>
        </div>
      )}

      {/* 매치 리스트 */}
      <div className="px-5 @3xl:px-0">
        {isLoading ? (
          <div className="flex flex-col gap-3 @3xl:grid @3xl:grid-cols-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-[92px] rounded-xl bg-gray-50 dark:bg-gray-800 skeleton-shimmer" />
            ))}
          </div>
        ) : error ? (
          <ErrorState onRetry={() => refetch()} />
        ) : matches.length === 0 ? (
          <EmptyState
            icon={Search}
            title={te('noSearchResults')}
            description={te('noSearchResultsDesc')}
            action={{ label: t('viewMercenary'), href: '/mercenary' }}
          />
        ) : (
          <div className="flex flex-col gap-3 @3xl:grid @3xl:grid-cols-2 stagger-children">
            {matches.map((match: Match) => (
              <MatchCard key={match.id} match={match} almostFullLabel={t('almostFull')} />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
