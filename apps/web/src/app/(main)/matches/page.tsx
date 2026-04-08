'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, SlidersHorizontal, Clock, Users, MapPin, Sparkles, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMatches } from '@/hooks/use-api';
import { useDebounce } from '@/hooks/use-debounce';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { SafeImage } from '@/components/ui/safe-image';
import { sportLabel, sportCardAccent } from '@/lib/constants';
import {
  buildMatchApiParams,
  buildMatchDiscoverySearchParams,
  countActiveMatchDiscoveryFilters,
  getTodayFilterDate,
  parseMatchDiscoveryFilters,
  type MatchDiscoveryFilters,
  type MatchDiscoveryLevel,
  type MatchDiscoverySort,
} from '@/lib/match-discovery';
import { formatCurrency, formatMatchDate, getTimeBadge, friendlyLevel } from '@/lib/utils';
import { getSportImage } from '@/lib/sport-image';
import type { Match } from '@/types/api';

const SPORT_FILTERS = [
  { key: '', translationKey: 'all' },
  { key: 'soccer', translationKey: 'soccer' },
  { key: 'futsal', translationKey: 'futsal' },
  { key: 'basketball', translationKey: 'basketball' },
  { key: 'badminton', translationKey: 'badminton' },
  { key: 'ice_hockey', translationKey: 'ice_hockey' },
  { key: 'swimming', translationKey: 'swimming' },
  { key: 'tennis', translationKey: 'tennis' },
] as const;

const LEVEL_FILTERS: Array<{ key: MatchDiscoveryLevel; translationKey: string }> = [
  { key: 'all', translationKey: 'anyLevel' },
  { key: 'beginner', translationKey: 'beginner' },
  { key: 'intermediate', translationKey: 'intermediate' },
  { key: 'advanced', translationKey: 'advanced' },
];

const SORT_FILTERS: Array<{ key: MatchDiscoverySort; translationKey: string }> = [
  { key: 'upcoming', translationKey: 'upcoming' },
  { key: 'latest', translationKey: 'latest' },
  { key: 'deadline', translationKey: 'deadline' },
];

const MatchCard = React.memo(function MatchCard({ match }: { match: Match }) {
  const filled = match.currentPlayers / match.maxPlayers;
  const isFull = match.status === 'full' || filled >= 1;
  const isAlmostFull = !isFull && filled >= 0.7;
  const timeBadge = getTimeBadge(match.matchDate);
  const accent = sportCardAccent[match.sportType];
  const dotColor = accent?.dot || 'bg-gray-400';
  const remaining = match.maxPlayers - match.currentPlayers;
  const matchImage = getSportImage(match.sportType, match.imageUrl, match.id);
  const fallbackMatchImage = getSportImage(match.sportType, undefined, match.id);

  return (
    <Link href={`/matches/${match.id}`} className="block">
      <div className="group rounded-2xl border border-gray-100 bg-white overflow-hidden hover:border-gray-200 active:scale-[0.98] transition-[border-color,transform] duration-150 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700">
        <div className="relative aspect-[16/9] overflow-hidden bg-gray-100 dark:bg-gray-800">
          <SafeImage
            src={matchImage}
            fallbackSrc={fallbackMatchImage}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" />

          <div className="absolute left-3.5 top-3.5 flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${dotColor} ring-[1.5px] ring-white/60`} />
            <span className="text-2xs font-semibold text-white/90">{sportLabel[match.sportType]}</span>
            {timeBadge && (
              <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-2xs font-bold leading-none text-white backdrop-blur-sm">
                {timeBadge.text}
              </span>
            )}
          </div>

          <div className="absolute bottom-3 left-3.5">
            <span className="text-sm font-bold text-white">{formatCurrency(match.fee)}</span>
          </div>

          <div className="absolute bottom-3 right-3">
            {isFull ? (
              <span className="rounded-md bg-white/15 px-2 py-1 text-2xs font-bold leading-none text-white/70 backdrop-blur-sm">
                마감
              </span>
            ) : isAlmostFull ? (
              <span className="rounded-md bg-amber-500/20 px-2 py-1 text-2xs font-bold leading-none text-amber-300 backdrop-blur-sm">
                {remaining}자리 남음
              </span>
            ) : (
              <span className="rounded-md bg-white/15 px-2 py-1 text-2xs font-semibold leading-none text-white/80 backdrop-blur-sm">
                <Users size={10} className="mr-0.5 inline -mt-px" />
                {match.currentPlayers}/{match.maxPlayers}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-2 px-3.5 py-3.5">
          <h3 className="truncate text-sm font-semibold leading-snug text-gray-900 dark:text-gray-100">
            {match.title}
          </h3>

          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <Clock size={11} className="shrink-0 opacity-40" />
            <span className="shrink-0">{formatMatchDate(match.matchDate)} {match.startTime}</span>
            {match.venue?.name && (
              <>
                <span className="shrink-0 opacity-30">·</span>
                <span className="truncate">{match.venue.name}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <MapPin size={11} className="shrink-0 opacity-40" />
            <span className="truncate">
              {match.venue?.district ? `${match.venue.city} ${match.venue.district}` : match.venue?.city || '지역 미정'}
            </span>
            <span className="shrink-0 opacity-30">·</span>
            <span className="shrink-0">{friendlyLevel(match.levelMin, match.levelMax)}</span>
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [showFilters, setShowFilters] = useState(false);
  const urlFilters = useMemo(() => parseMatchDiscoveryFilters(searchParams), [searchParams]);
  const pendingFiltersRef = useRef(urlFilters);
  const [draftFilters, setDraftFilters] = useState(urlFilters);
  const [searchInput, setSearchInput] = useState(urlFilters.q);
  const debouncedSearch = useDebounce(searchInput, 300);

  const updateFilters = useCallback((partial: Partial<MatchDiscoveryFilters>) => {
    const nextFilters = { ...pendingFiltersRef.current, ...partial };
    pendingFiltersRef.current = nextFilters;
    setDraftFilters(nextFilters);
    const nextParams = buildMatchDiscoverySearchParams(nextFilters);
    const queryString = nextParams.toString();

    startTransition(() => {
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    });
  }, [pathname, router, startTransition]);

  useEffect(() => {
    pendingFiltersRef.current = urlFilters;
    setDraftFilters((prev) => {
      const isSame =
        prev.sport === urlFilters.sport &&
        prev.q === urlFilters.q &&
        prev.date === urlFilters.date &&
        prev.city === urlFilters.city &&
        prev.level === urlFilters.level &&
        prev.fee === urlFilters.fee &&
        prev.available === urlFilters.available &&
        prev.sort === urlFilters.sort;

      return isSame ? prev : urlFilters;
    });
  }, [urlFilters]);

  useEffect(() => {
    setSearchInput(urlFilters.q);
  }, [urlFilters.q]);

  useEffect(() => {
    if (debouncedSearch === draftFilters.q) return;
    updateFilters({ q: debouncedSearch });
  }, [debouncedSearch, draftFilters.q, updateFilters]);

  useEffect(() => {
    if (
      draftFilters.date ||
      draftFilters.city ||
      draftFilters.level !== 'all' ||
      draftFilters.sort !== 'upcoming'
    ) {
      setShowFilters(true);
    }
  }, [draftFilters.city, draftFilters.date, draftFilters.level, draftFilters.sort]);

  const activeFilterCount = useMemo(
    () => countActiveMatchDiscoveryFilters(draftFilters),
    [draftFilters],
  );
  const apiParams = useMemo(() => buildMatchApiParams(draftFilters), [draftFilters]);
  const { data, isLoading, error, refetch } = useMatches(apiParams);
  const matches = data?.items ?? [];
  const today = useMemo(() => getTodayFilterDate(), []);

  const activeSummary = useMemo(() => {
    const summary: string[] = [];
    if (draftFilters.sport) summary.push(sportLabel[draftFilters.sport] || draftFilters.sport);
    if (draftFilters.q) summary.push(`"${draftFilters.q}"`);
    if (draftFilters.date) summary.push(draftFilters.date === today ? t('today') : draftFilters.date);
    if (draftFilters.city) summary.push(`${t('regionLabel')}: ${draftFilters.city}`);
    if (draftFilters.level !== 'all') {
      const levelKey = LEVEL_FILTERS.find((item) => item.key === draftFilters.level)?.translationKey;
      if (levelKey) summary.push(t(levelKey));
    }
    if (draftFilters.fee === 'free') summary.push(t('free'));
    if (draftFilters.available) summary.push(t('availableOnly'));
    if (draftFilters.sort !== 'upcoming') {
      const sortKey = SORT_FILTERS.find((item) => item.key === draftFilters.sort)?.translationKey;
      if (sortKey) summary.push(t(sortKey));
    }
    return summary;
  }, [draftFilters, t, today]);

  const handleClearFilters = useCallback(() => {
    setSearchInput('');
    updateFilters({
      sport: '',
      q: '',
      date: '',
      city: '',
      level: 'all',
      fee: 'all',
      available: false,
      sort: 'upcoming',
    });
  }, [updateFilters]);

  return (
    <div className="pt-[var(--safe-area-top)]">
      <header className="px-5 pb-3 pt-4 @3xl:px-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('findMatch')}</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={handleClearFilters}
            data-testid="match-clear-filters"
            className="min-h-[44px] shrink-0 rounded-xl border border-gray-200 px-3 text-sm font-medium text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:text-white"
          >
            {t('clearFilters')}
          </button>
        </div>
      </header>

      <div className="mb-3 px-5 @3xl:px-0">
        <div className="relative flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input
              type="text"
              value={searchInput}
              placeholder={t('searchPlaceholder')}
              data-testid="match-search-input"
              onChange={(event) => setSearchInput(event.target.value)}
              className="w-full rounded-xl bg-gray-50 py-3 pl-10 pr-11 text-base text-gray-900 outline-none transition-colors focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:bg-gray-800 dark:text-gray-100 dark:focus:bg-gray-900"
            />
            {searchInput && (
              <button
                type="button"
                aria-label={t('clearSearch')}
                onClick={() => setSearchInput('')}
                className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button
            type="button"
            aria-label={t('openFilters')}
            aria-pressed={showFilters}
            data-testid="match-filter-toggle"
            onClick={() => setShowFilters((prev) => !prev)}
            className={`relative flex h-[46px] w-[46px] items-center justify-center rounded-xl transition-colors ${
              showFilters
                ? 'bg-blue-500 text-white'
                : 'bg-gray-50 text-gray-500 active:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:active:bg-gray-700'
            }`}
          >
            <SlidersHorizontal size={16} />
            {activeFilterCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gray-900 px-1 text-2xs font-bold text-white dark:bg-white dark:text-gray-900">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="mb-3 flex gap-2 overflow-x-auto px-5 pb-1 scrollbar-hide @3xl:px-0">
        {SPORT_FILTERS.map((filter) => {
          const isActive = draftFilters.sport === filter.key;
          const testId = filter.key ? `match-sport-${filter.key}` : 'match-sport-all';

          return (
            <button
              key={filter.key || 'all'}
              type="button"
              data-testid={testId}
              aria-pressed={isActive}
              onClick={() => updateFilters({ sport: isActive ? '' : filter.key })}
              className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {filter.key ? ts(filter.translationKey) : ts('all')}
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto px-5 pb-1 scrollbar-hide @3xl:px-0">
        <button
          type="button"
          data-testid="match-quick-today"
          aria-pressed={draftFilters.date === today}
          onClick={() => updateFilters({ date: draftFilters.date === today ? '' : today })}
          className={`shrink-0 rounded-full px-3 py-2 text-sm font-medium transition-colors ${
            draftFilters.date === today
              ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
          }`}
        >
          {t('today')}
        </button>
        <button
          type="button"
          data-testid="match-quick-free"
          aria-pressed={draftFilters.fee === 'free'}
          onClick={() => updateFilters({ fee: draftFilters.fee === 'free' ? 'all' : 'free' })}
          className={`shrink-0 rounded-full px-3 py-2 text-sm font-medium transition-colors ${
            draftFilters.fee === 'free'
              ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
          }`}
        >
          {t('free')}
        </button>
        <button
          type="button"
          data-testid="match-quick-beginner"
          aria-pressed={draftFilters.level === 'beginner'}
          onClick={() => updateFilters({ level: draftFilters.level === 'beginner' ? 'all' : 'beginner' })}
          className={`shrink-0 rounded-full px-3 py-2 text-sm font-medium transition-colors ${
            draftFilters.level === 'beginner'
              ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
          }`}
        >
          {t('beginner')}
        </button>
        <button
          type="button"
          data-testid="match-quick-available"
          aria-pressed={draftFilters.available}
          onClick={() => updateFilters({ available: !draftFilters.available })}
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-sm font-medium transition-colors ${
            draftFilters.available
              ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
          }`}
        >
          <Sparkles size={14} />
          {t('availableOnly')}
        </button>
      </div>

      {activeSummary.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 px-5 @3xl:px-0">
          {activeSummary.map((item) => (
            <span
              key={item}
              className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 dark:bg-blue-900/30 dark:text-blue-300"
            >
              {item}
            </span>
          ))}
        </div>
      )}

      {showFilters && (
        <div className="mb-4 px-5 @3xl:px-0">
          <div className="space-y-4 rounded-2xl bg-gray-50 p-4 dark:bg-gray-800">
            <div className="grid gap-4 @3xl:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
                  {t('date')}
                </label>
                <input
                  type="date"
                  value={draftFilters.date}
                  data-testid="match-date-input"
                  onChange={(event) => updateFilters({ date: event.target.value })}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-base text-gray-900 outline-none transition-colors focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
                  {t('regionLabel')}
                </label>
                <input
                  type="text"
                  value={draftFilters.city}
                  data-testid="match-region-input"
                  placeholder={t('regionPlaceholder')}
                  onChange={(event) => updateFilters({ city: event.target.value })}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-base text-gray-900 outline-none transition-colors focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
                {t('level')}
              </label>
              <div className="flex flex-wrap gap-2">
                {LEVEL_FILTERS.map((filter) => {
                  const isActive = draftFilters.level === filter.key;
                  return (
                    <button
                      key={filter.key}
                      type="button"
                      aria-pressed={isActive}
                      data-testid={`match-level-${filter.key}`}
                      onClick={() => updateFilters({ level: filter.key })}
                      className={`min-h-[44px] rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-blue-500 text-white'
                          : 'border border-gray-200 bg-white text-gray-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {t(filter.translationKey)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
                {t('sort')}
              </label>
              <div className="flex flex-wrap gap-2">
                {SORT_FILTERS.map((filter) => {
                  const isActive = draftFilters.sort === filter.key;
                  return (
                    <button
                      key={filter.key}
                      type="button"
                      aria-pressed={isActive}
                      data-testid={`match-sort-${filter.key}`}
                      onClick={() => updateFilters({ sort: filter.key })}
                      className={`min-h-[44px] rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-blue-500 text-white'
                          : 'border border-gray-200 bg-white text-gray-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {t(filter.translationKey)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {!isLoading && matches.length > 0 && (
        <div className="mb-3 px-5 @3xl:px-0">
          <p data-testid="match-count" className="text-sm text-gray-500 dark:text-gray-400">
            {t('matchCount', { count: matches.length })}
            {(activeFilterCount > 0 || isPending) && <span className="ml-1">{t('filteredResults')}</span>}
          </p>
        </div>
      )}

      <div className="px-5 @3xl:px-0">
        {isLoading ? (
          <div className="flex flex-col gap-3 @3xl:grid @3xl:grid-cols-2">
            {[1, 2, 3, 4].map((value) => (
              <div key={value} className="rounded-2xl bg-gray-50 skeleton-shimmer dark:bg-gray-800">
                <div className="aspect-[16/9]" />
                <div className="space-y-2 p-3.5">
                  <div className="h-4 w-3/4 rounded bg-gray-100 dark:bg-gray-700" />
                  <div className="h-3 w-1/2 rounded bg-gray-100 dark:bg-gray-700" />
                </div>
              </div>
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
          <div data-testid="match-results" className="flex flex-col gap-3 @3xl:grid @3xl:grid-cols-2 stagger-children">
            {matches.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
