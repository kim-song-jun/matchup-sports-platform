'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, SlidersHorizontal, Sparkles, X, List, Map, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { MobilePageTopZone } from '@/components/layout/mobile-page-top-zone';
import { useMatches } from '@/hooks/use-api';
import { useDebounce } from '@/hooks/use-debounce';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { MatchCard } from '@/components/match/match-card';
import { sportLabel } from '@/lib/constants';
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
import type { Match } from '@/types/api';

const MatchesMapView = dynamic(
  () => import('@/components/map/matches-map-view').then((m) => ({ default: m.MatchesMapView })),
  {
    ssr: false,
    loading: () => (
      <div
        role="status"
        aria-label="지도 불러오는 중"
        className="h-[400px] rounded-xl bg-gray-100 dark:bg-gray-800 skeleton-shimmer"
      />
    ),
  },
);

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


export function MatchesPage() {
  const t = useTranslations('matches');
  const te = useTranslations('empty');
  const ts = useTranslations('sports');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
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
      <MobilePageTopZone
        surface="plain"
        eyebrow="AI 추천"
        title={t('findMatch')}
        subtitle={t('subtitle')}
        action={(
          <Link
            href="/matches/new"
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500 text-white transition-colors hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500"
            aria-label="매치 만들기"
          >
            <Plus size={18} aria-hidden="true" />
          </Link>
        )}
      />

      <div className="mb-2 px-5 @3xl:px-0" data-testid="match-filter-bar">
        <div className="relative flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
            <label htmlFor="match-search-input" className="sr-only">매치 검색</label>
            <Input
              id="match-search-input"
              type="text"
              value={searchInput}
              placeholder={t('searchPlaceholder')}
              data-testid="match-search-input"
              onChange={(event) => setSearchInput(event.target.value)}
              className="h-11 rounded-lg py-0 pl-9 pr-10 text-sm"
            />
            {searchInput && (
              <button
                type="button"
                aria-label={t('clearSearch')}
                onClick={() => setSearchInput('')}
                className="absolute right-2.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              >
                <X size={13} />
              </button>
            )}
          </div>
          <div className="flex overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            <button
              type="button"
              aria-label="리스트 뷰"
              aria-pressed={viewMode === 'list'}
              onClick={() => setViewMode('list')}
              className={`flex min-h-[44px] min-w-[44px] items-center justify-center transition-colors ${
                viewMode === 'list'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              <List size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="지도 뷰"
              aria-pressed={viewMode === 'map'}
              onClick={() => setViewMode('map')}
              className={`flex min-h-[44px] min-w-[44px] items-center justify-center transition-colors ${
                viewMode === 'map'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              <Map size={16} aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            aria-label={t('openFilters')}
            aria-pressed={showFilters}
            data-testid="match-filter-toggle"
            onClick={() => setShowFilters((prev) => !prev)}
            className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors ${
              showFilters
                ? 'bg-blue-500 text-white'
                : 'border border-gray-200 bg-white text-gray-500 active:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:active:bg-gray-700'
            }`}
          >
            <SlidersHorizontal size={15} />
            {activeFilterCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-gray-900 px-0.5 text-2xs font-bold text-white dark:bg-white dark:text-gray-900">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="mb-2 flex gap-2 overflow-x-auto px-5 pb-1 scrollbar-hide @3xl:px-0">
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
              className={`shrink-0 min-h-[44px] rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-500 text-white'
                  : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
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
          className={`shrink-0 min-h-[44px] rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            draftFilters.date === today
              ? 'border border-blue-500 bg-blue-50 text-blue-600 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300'
              : 'border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-600'
          }`}
        >
          {t('today')}
        </button>
        <button
          type="button"
          data-testid="match-quick-free"
          aria-pressed={draftFilters.fee === 'free'}
          onClick={() => updateFilters({ fee: draftFilters.fee === 'free' ? 'all' : 'free' })}
          className={`shrink-0 min-h-[44px] rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            draftFilters.fee === 'free'
              ? 'border border-blue-500 bg-blue-50 text-blue-600 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300'
              : 'border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-600'
          }`}
        >
          {t('free')}
        </button>
        <button
          type="button"
          data-testid="match-quick-beginner"
          aria-pressed={draftFilters.level === 'beginner'}
          onClick={() => updateFilters({ level: draftFilters.level === 'beginner' ? 'all' : 'beginner' })}
          className={`shrink-0 min-h-[44px] rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            draftFilters.level === 'beginner'
              ? 'border border-blue-500 bg-blue-50 text-blue-600 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300'
              : 'border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-600'
          }`}
        >
          {t('beginner')}
        </button>
        <button
          type="button"
          data-testid="match-quick-available"
          aria-pressed={draftFilters.available}
          onClick={() => updateFilters({ available: !draftFilters.available })}
          className={`inline-flex shrink-0 min-h-[44px] items-center gap-1 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            draftFilters.available
              ? 'border border-blue-500 bg-blue-50 text-blue-600 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300'
              : 'border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-600'
          }`}
        >
          <Sparkles size={13} aria-hidden="true" />
          {t('availableOnly')}
        </button>
        {activeFilterCount > 0 && (
          <button
            type="button"
            data-testid="match-clear-filters"
            onClick={handleClearFilters}
            className="inline-flex shrink-0 min-h-[44px] items-center gap-1 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-sm font-medium text-gray-500 transition-colors hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:border-gray-600"
          >
            <X size={13} aria-hidden="true" />
            {t('clearFilters')}
          </button>
        )}
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
          <Card variant="subtle" className="space-y-4">
            <div className="grid gap-4 @3xl:grid-cols-2">
              <div>
                <label htmlFor="match-filter-date" className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
                  {t('date')}
                </label>
                <Input
                  id="match-filter-date"
                  type="date"
                  value={draftFilters.date}
                  data-testid="match-date-input"
                  onChange={(event) => updateFilters({ date: event.target.value })}
                  className="rounded-lg px-3 py-2 text-base dark:bg-gray-900"
                />
              </div>
              <div>
                <label htmlFor="match-filter-region" className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
                  {t('regionLabel')}
                </label>
                <Input
                  id="match-filter-region"
                  type="text"
                  value={draftFilters.city}
                  data-testid="match-region-input"
                  placeholder={t('regionPlaceholder')}
                  onChange={(event) => updateFilters({ city: event.target.value })}
                  className="rounded-lg px-3 py-2 text-base dark:bg-gray-900"
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
                      className={`min-h-[44px] rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
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
                      className={`min-h-[44px] rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
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
          </Card>
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
          <div className="flex flex-col gap-3 @3xl:grid @3xl:grid-cols-2 @3xl:gap-4">
            {[1, 2, 3, 4].map((value) => (
              <Card key={value} variant="subtle" padding="none" className="skeleton-shimmer">
                <div className="aspect-[16/9]" />
                <div className="space-y-2 p-3.5">
                  <div className="h-4 w-3/4 rounded bg-gray-100 dark:bg-gray-700" />
                  <div className="h-3 w-1/2 rounded bg-gray-100 dark:bg-gray-700" />
                </div>
              </Card>
            ))}
          </div>
        ) : error ? (
          <ErrorState onRetry={() => refetch()} />
        ) : viewMode === 'map' ? (
          <MatchesMapView matches={matches} />
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
      <div className="h-24" />
    </div>
  );
}
