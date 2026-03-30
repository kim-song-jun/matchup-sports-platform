'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Package, Search, ShoppingBag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useListings } from '@/hooks/use-api';
import { useDebounce } from '@/hooks/use-debounce';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { sportLabel, sportCardAccent } from '@/lib/constants';
import { formatCurrency } from '@/lib/utils';
import type { MarketplaceListing } from '@/types/api';

const matchesListingKeyword = (item: MarketplaceListing, keywords: string[]) => {
  const haystack = `${item.category || ''} ${item.title || ''}`.toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
};

const categoryFilters = [
  { labelKey: 'categoryAll' as const, match: () => true },
  { labelKey: 'categoryFutsalShoes' as const, match: (item: MarketplaceListing) => matchesListingKeyword(item, ['풋살화', '축구화']) },
  { labelKey: 'categoryHockeyGear' as const, match: (item: MarketplaceListing) => matchesListingKeyword(item, ['하키장비']) },
  { labelKey: 'categoryBasketballShoes' as const, match: (item: MarketplaceListing) => matchesListingKeyword(item, ['농구화']) },
  { labelKey: 'categoryRacket' as const, match: (item: MarketplaceListing) => matchesListingKeyword(item, ['라켓']) },
  { labelKey: 'categoryUniform' as const, match: (item: MarketplaceListing) => matchesListingKeyword(item, ['유니폼']) },
  { labelKey: 'categoryProtective' as const, match: (item: MarketplaceListing) => matchesListingKeyword(item, ['보호장비', '보호', '장갑']) },
] as const;

const conditionKeyMap: Record<string, string> = {
  new: 'conditionNew',
  like_new: 'conditionLikeNew',
  good: 'conditionGood',
  fair: 'conditionFair',
  poor: 'conditionPoor',
};

const surfaceCard =
  'rounded-[28px] border border-slate-200/70 bg-white/90 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-black/20';

const softCard =
  'rounded-[24px] border border-slate-200/60 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/78 dark:shadow-black/10';

export default function MarketplacePage() {
  const t = useTranslations('marketplace');
  const te = useTranslations('empty');
  const [activeCategoryKey, setActiveCategoryKey] = useState('categoryAll');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const { data, isLoading, error, refetch } = useListings();
  const allListings = data?.items ?? [];
  const activeCategoryFilter = categoryFilters.find((c) => c.labelKey === activeCategoryKey);
  const categoryFiltered = activeCategoryFilter && activeCategoryKey !== 'categoryAll'
    ? allListings.filter(activeCategoryFilter.match)
    : allListings;
  const listings = debouncedSearch
    ? categoryFiltered.filter((item: MarketplaceListing) =>
        item.title?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        sportLabel[item.sportType]?.includes(debouncedSearch),
      )
    : categoryFiltered;

  const marketStats = [
    { label: '매물', value: allListings.length },
    { label: '카테고리', value: categoryFilters.length - 1 },
    { label: '종목', value: new Set(allListings.map((item) => item.sportType)).size },
  ];

  return (
    <div className="pt-[var(--safe-area-top)]">
      <section className="px-5 @3xl:px-0 pt-4">
        <div className={`${surfaceCard} overflow-hidden p-6 sm:p-7`}>
          <div className="flex flex-col gap-5 @3xl:flex-row @3xl:items-end @3xl:justify-between">
            <div className="max-w-2xl">
              <div className="eyebrow-chip">
                <ShoppingBag size={14} />
                MatchUp Market
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                장비와 용품도 신뢰 있게 고릅니다.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
                필요한 장비를 종목별로 빠르게 찾고 상태, 가격, 용도를 한 번에 비교할 수 있도록 정리했습니다.
              </p>
            </div>
            <Link
              href="/marketplace/new"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-950/20 dark:bg-white dark:text-slate-950"
            >
              <Plus size={14} strokeWidth={2.5} />
              {t('createListing')}
            </Link>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {marketStats.map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{stat.label}</p>
                <p className="mt-2 text-2xl font-black tracking-tight text-slate-950 dark:text-white">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 @3xl:px-0 mt-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-surface py-3.5 pl-11 pr-4 text-base outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      </section>

      <section className="px-5 @3xl:px-0 mt-4">
        <div className="segmented-control scrollbar-hide overflow-x-auto pb-1">
          {categoryFilters.map((cat) => (
            <button
              key={cat.labelKey}
              onClick={() => setActiveCategoryKey(cat.labelKey)}
              className={`segmented-pill shrink-0 ${activeCategoryKey === cat.labelKey ? 'is-active' : ''}`}
            >
              {t(cat.labelKey)}
            </button>
          ))}
        </div>
      </section>

      <section className="px-5 @3xl:px-0 mt-4">
        {isLoading ? (
          <div className="grid gap-3 @3xl:grid-cols-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-[140px] rounded-[24px] bg-slate-100/80 dark:bg-slate-900/70 skeleton-shimmer" />
            ))}
          </div>
        ) : error ? (
          <ErrorState onRetry={() => refetch()} />
        ) : listings.length === 0 ? (
          <EmptyState icon={Package} title={te('noListings')} description={te('noListingsDesc')} />
        ) : (
          <div className="grid gap-3 @3xl:grid-cols-2 stagger-children">
            {listings.map((item: MarketplaceListing) => (
              <Link
                key={item.id}
                href={`/marketplace/${item.id}`}
                className={`${softCard} block p-4 transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(15,23,42,0.08)] dark:hover:bg-slate-900`}
              >
                <div className="flex gap-3.5">
                  <div className="flex h-[100px] w-[100px] shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-br from-slate-100 to-slate-50 text-slate-300 dark:from-slate-900 dark:to-slate-950">
                    <ShoppingBag size={22} />
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col py-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="truncate text-md font-semibold text-slate-950 dark:text-white">{item.title}</h3>
                      <span className="shrink-0 rounded-full border border-slate-200/70 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                        {item.listingType === 'rent' ? t('typeRent') : t('typeSell')}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className={`${sportCardAccent[item.sportType]?.badge || 'bg-gray-100 text-gray-500'} rounded-full px-2 py-0.5 text-xs font-normal`}>
                        {sportLabel[item.sportType] || t('other')}
                      </span>
                      <span className="truncate">
                        {item.locationDistrict || item.locationCity || t('locationUndecided')} · {conditionKeyMap[item.condition] ? t(conditionKeyMap[item.condition] as any) : item.condition}
                      </span>
                    </div>

                    <div className="mt-3 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Price</p>
                        <p className="mt-1 text-lg font-black tracking-tight text-slate-950 dark:text-white">{formatCurrency(item.price)}</p>
                      </div>
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {t('likes', { count: item.likeCount })} · {t('views', { count: item.viewCount })}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
