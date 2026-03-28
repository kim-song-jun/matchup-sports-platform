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

const categoryFilterKeys = [
  { labelKey: 'categoryAll' as const, match: () => true },
  { labelKey: 'categoryFutsalShoes' as const, match: (item: MarketplaceListing) => item.sportType === 'futsal' },
  { labelKey: 'categoryHockeyGear' as const, match: (item: MarketplaceListing) => item.sportType === 'ice_hockey' },
  { labelKey: 'categoryBasketballShoes' as const, match: (item: MarketplaceListing) => item.sportType === 'basketball' },
  { labelKey: 'categoryRacket' as const, match: (item: MarketplaceListing) => item.sportType === 'badminton' },
  { labelKey: 'categoryUniform' as const, match: (item: MarketplaceListing) => item.title?.toLowerCase().includes('유니폼') },
  { labelKey: 'categoryProtective' as const, match: (item: MarketplaceListing) => item.title?.toLowerCase().includes('보호') || item.title?.toLowerCase().includes('장갑') },
];

const conditionKeyMap: Record<string, string> = {
  new: 'conditionNew',
  like_new: 'conditionLikeNew',
  good: 'conditionGood',
  fair: 'conditionFair',
  poor: 'conditionPoor',
};

export default function MarketplacePage() {
  const t = useTranslations('marketplace');
  const te = useTranslations('empty');
  const [activeCategoryKey, setActiveCategoryKey] = useState('categoryAll');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const { data, isLoading, error, refetch } = useListings();
  const allListings = data?.items ?? [];
  const activeCategoryFilter = categoryFilterKeys.find((c) => c.labelKey === activeCategoryKey);
  const categoryFiltered = activeCategoryFilter && activeCategoryKey !== 'categoryAll'
    ? allListings.filter(activeCategoryFilter.match)
    : allListings;
  const listings = debouncedSearch
    ? categoryFiltered.filter((item: MarketplaceListing) =>
        item.title?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        sportLabel[item.sportType]?.includes(debouncedSearch)
      )
    : categoryFiltered;

  return (
    <div className="pt-[var(--safe-area-top)]">
      <header className="flex items-center justify-between px-5 @3xl:px-0 pt-4 pb-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('title')}</h1>
        <Link href="/marketplace/new" className="flex items-center gap-1.5 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-600 active:bg-gray-700 transition-colors">
          <Plus size={14} strokeWidth={2.5} />
          {t('createListing')}
        </Link>
      </header>

      {/* 검색 바 */}
      <div className="px-5 @3xl:px-0 mb-2">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl bg-gray-50 dark:bg-gray-800 py-3 pl-10 pr-4 text-base text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border focus:border-blue-200 dark:focus:bg-gray-900 dark:focus:border-blue-600 transition-colors"
          />
        </div>
      </div>

      {/* 카테고리 칩 */}
      <div className="px-5 @3xl:px-0 mb-4 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {categoryFilterKeys.map((cat) => (
          <button
            key={cat.labelKey}
            onClick={() => setActiveCategoryKey(cat.labelKey)}
            className={`shrink-0 min-h-[44px] rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              activeCategoryKey === cat.labelKey
                ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                : 'bg-gray-50 text-gray-500 hover:bg-gray-100 active:bg-gray-150 dark:bg-gray-800 dark:text-gray-500 dark:hover:bg-gray-700'
            }`}
          >
            {t(cat.labelKey)}
          </button>
        ))}
      </div>

      {/* 리스트 */}
      <div className="px-5 @3xl:px-0">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="h-[100px] rounded-xl bg-gray-100 dark:bg-gray-800 skeleton-shimmer" />
            ))}
          </div>
        ) : error ? (
          <ErrorState onRetry={() => refetch()} />
        ) : listings.length === 0 ? (
          <EmptyState
            icon={Package}
            title={te('noListings')}
            description={te('noListingsDesc')}
          />
        ) : (
          <div className="space-y-3 @3xl:grid @3xl:grid-cols-2 @3xl:gap-3 @3xl:space-y-0 stagger-children">
            {listings.map((item: MarketplaceListing) => (
                <Link key={item.id} href={`/marketplace/${item.id}`} className="block rounded-xl bg-white dark:bg-gray-800 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 active:scale-[0.98] hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <div className="flex gap-3.5">
                    {/* Thumbnail */}
                    <div className="flex h-[100px] w-[100px] shrink-0 items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-300">
                      <ShoppingBag size={20} />
                    </div>

                    {/* Content */}
                    <div className="flex flex-1 flex-col min-w-0 py-0.5">
                      <h3 className="text-md font-semibold text-gray-900 dark:text-gray-100 truncate">{item.title}</h3>

                      {/* meta: 지역 · 종목 · 상태 */}
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`${sportCardAccent[item.sportType]?.badge || 'bg-gray-100 text-gray-500'} rounded-full px-2 py-0.5 text-xs font-normal`}>
                          {sportLabel[item.sportType] || t('other')}
                        </span>
                        <span className="text-sm text-gray-500 truncate">
                          {item.locationDistrict || item.locationCity || t('locationUndecided')} · {conditionKeyMap[item.condition] ? t(conditionKeyMap[item.condition] as any) : item.condition}
                        </span>
                      </div>

                      {/* 가격 */}
                      <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-1.5">{formatCurrency(item.price)}</p>

                      {/* 하단: 타입 + 통계 */}
                      <div className="flex items-center justify-between mt-auto pt-1">
                        <span className="rounded-full px-2 py-0.5 text-xs font-normal bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                          {item.listingType === 'rent' ? t('typeRent') : t('typeSell')}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {t('likes', { count: item.likeCount })} · {t('views', { count: item.viewCount })}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
