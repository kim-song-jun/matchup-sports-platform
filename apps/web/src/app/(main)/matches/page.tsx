'use client';

import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Search, SlidersHorizontal, Calendar, MapPin, Clock, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMatches } from '@/hooks/use-api';
import { useDebounce } from '@/hooks/use-debounce';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { sportLabel, levelLabel, sportCardAccent } from '@/lib/constants';
import { formatCurrency, formatMatchDate, getTimeBadge } from '@/lib/utils';
import { getSportImage } from '@/lib/sport-image';
import type { Match } from '@/types/api';

const surfaceCard =
  'rounded-[28px] border border-slate-200/70 bg-white/85 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/75 dark:shadow-black/20';

const softCard =
  'rounded-[24px] border border-slate-200/60 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-black/10';

const sportFilters = [
  { key: '', label: '전체' },
  { key: 'soccer', label: '축구' },
  { key: 'futsal', label: '풋살' },
  { key: 'basketball', label: '농구' },
  { key: 'badminton', label: '배드민턴' },
  { key: 'ice_hockey', label: '아이스하키' },
  { key: 'swimming', label: '수영' },
  { key: 'tennis', label: '테니스' },
] as const;

const MatchCard = React.memo(function MatchCard({ match, almostFullLabel }: { match: Match; almostFullLabel: string }) {
  const filled = match.currentPlayers / match.maxPlayers;
  const isAlmostFull = filled >= 0.7;
  const timeBadge = getTimeBadge(match.matchDate);

  return (
    <Link href={`/matches/${match.id}`}>
      <div className={`${softCard} group flex overflow-hidden transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(15,23,42,0.08)] dark:hover:bg-slate-900`}>
        <div className="relative w-32 shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-800">
          <Image src={getSportImage(match.sportType, match.imageUrl)} alt={match.title} fill className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" sizes="128px" unoptimized />
          {timeBadge && (
            <span className="absolute left-2 top-2 rounded-full bg-slate-950/80 px-2 py-1 text-2xs font-bold text-white backdrop-blur">
              {timeBadge.text}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-slate-950 dark:text-white">{match.title}</p>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className={`${sportCardAccent[match.sportType]?.badge || 'bg-slate-100 text-slate-500'} rounded-full px-2.5 py-1 text-xs font-medium`}>
                  {sportLabel[match.sportType]}
                </span>
                <span>{formatMatchDate(match.matchDate)} {match.startTime}</span>
              </p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-2xs font-semibold ${isAlmostFull ? 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
              {match.currentPlayers}/{match.maxPlayers}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            {match.venue?.name && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-950/70">
                <MapPin size={12} />
                <span className="truncate">{match.venue.name}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-950/70">
              <Clock size={12} />
              {match.startTime}
            </span>
            {match.levelMin != null && match.levelMax != null && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-950/70">
                {levelLabel[match.levelMin]}~{levelLabel[match.levelMax]}
              </span>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-950 dark:text-white">{formatCurrency(match.fee)}</span>
            {isAlmostFull && <span className="text-xs font-semibold text-amber-700 dark:text-amber-200">{almostFullLabel}</span>}
          </div>
        </div>
      </div>
    </Link>
  );
});

export default function MatchesPage() {
  const t = useTranslations('matches');
  const te = useTranslations('empty');
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

  const activeSportLabel = sportFilters.find((f) => f.key === activeSport)?.label ?? '전체';

  return (
    <div className="relative isolate overflow-hidden pt-[var(--safe-area-top)] pb-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[360px]"
        style={{
          background:
            'radial-gradient(circle at 18% 0%, rgba(59,130,246,0.20), transparent 34%), radial-gradient(circle at 82% 4%, rgba(15,23,42,0.12), transparent 24%), linear-gradient(180deg, rgba(248,250,252,0.9) 0%, rgba(248,250,252,0.55) 44%, rgba(248,250,252,0) 100%)',
        }}
      />

      <header className="relative px-5 @3xl:px-0 pt-4">
        <div className={`${surfaceCard} p-6 sm:p-7`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Match discovery</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white">매치 탐색</h1>
              <p className="mt-3 max-w-[44rem] text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                검색과 필터는 가볍게, 결과 카드는 단단하게. 매치의 핵심 정보만 먼저 보이도록 정리했습니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-200">
                {matches.length}건
              </span>
              <span className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-200">
                {activeSportLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-200">
                {sortBy === 'latest' ? '최신순' : '마감 임박'}
              </span>
            </div>
          </div>
        </div>
      </header>

      <section className="relative mt-4 px-5 @3xl:px-0">
        <div className={`${surfaceCard} p-4 sm:p-5`}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white/80 py-3.5 pl-11 pr-4 text-base text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-slate-300 focus:bg-white dark:border-slate-800 dark:bg-slate-950/70 dark:text-white dark:focus:bg-slate-950"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              aria-label={t('openFilters')}
              className={`inline-flex h-[48px] w-full items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition-colors lg:w-auto ${
                showFilters
                  ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950'
                  : 'border-slate-200 bg-white/80 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-200 dark:hover:bg-slate-900'
              }`}
            >
              <SlidersHorizontal size={16} />
              필터
            </button>
          </div>
        </div>
      </section>

      <section className="relative mt-4 px-5 @3xl:px-0">
        <div className={`${surfaceCard} p-4 sm:p-5`}>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {sportFilters.map((f) => (
              <button
                key={f.key}
                onClick={() => setActiveSport(f.key)}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                  activeSport === f.key
                    ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950'
                    : 'border-slate-200 bg-white/70 text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {showFilters && (
        <section className="relative mt-4 px-5 @3xl:px-0">
          <div className={`${softCard} p-4 sm:p-5`}>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{t('date')}</label>
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-base text-slate-950 outline-none transition-colors focus:border-slate-300 dark:border-slate-800 dark:bg-slate-950/70 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{t('sort')}</label>
                <div className="flex gap-2">
                  {(['latest', 'deadline'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSortBy(s)}
                      className={`min-h-[44px] rounded-2xl border px-4 py-2 text-sm font-semibold transition-colors ${
                        sortBy === s
                          ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950'
                          : 'border-slate-200 bg-white/70 text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-white'
                      }`}
                    >
                      {s === 'latest' ? t('latest') : t('deadline')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {!isLoading && matches.length > 0 && (
        <section className="relative mt-4 px-5 @3xl:px-0">
          <div className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/75 px-4 py-3 text-sm text-slate-600 shadow-[0_12px_40px_rgba(15,23,42,0.04)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
            <span>{t('matchCount', { count: matches.length })}</span>
            <ChevronRight size={16} className="text-slate-400" />
          </div>
        </section>
      )}

      <section className="relative mt-4 px-5 @3xl:px-0">
        {isLoading ? (
          <div className="grid gap-3 @3xl:grid-cols-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-[118px] rounded-[24px] bg-slate-100/80 dark:bg-slate-800/70 skeleton-shimmer" />
            ))}
          </div>
        ) : error ? (
          <ErrorState onRetry={() => refetch()} />
        ) : matches.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title={te('noSearchResults')}
            description={te('noSearchResultsDesc')}
            action={{ label: t('viewMercenary'), href: '/mercenary' }}
          />
        ) : (
          <div className="grid gap-3 @3xl:grid-cols-2">
            {matches.map((match: Match) => (
              <MatchCard key={match.id} match={match} almostFullLabel={t('almostFull')} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
