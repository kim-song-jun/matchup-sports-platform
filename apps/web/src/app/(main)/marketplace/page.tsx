'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Plus, Package, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { MobilePageTopZone } from '@/components/layout/mobile-page-top-zone';
import { useListings } from '@/hooks/use-api';
import { useDebounce } from '@/hooks/use-debounce';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { MarketplaceListingCard } from '@/components/marketplace/marketplace-listing-card';
import { useAuthStore } from '@/stores/auth-store';
import { sportLabel } from '@/lib/constants';
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

type ListingTypeFilter = 'all' | 'sell' | 'rent' | 'group_buy';

const listingTypeFilters: { key: ListingTypeFilter; labelKey: 'typeAll' | 'typeSell' | 'typeRent' | 'typeGroupBuy' }[] = [
  { key: 'all', labelKey: 'typeAll' },
  { key: 'sell', labelKey: 'typeSell' },
  { key: 'rent', labelKey: 'typeRent' },
  { key: 'group_buy', labelKey: 'typeGroupBuy' },
];

export default function MarketplacePage() {
  const t = useTranslations('marketplace');
  const te = useTranslations('empty');
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated } = useAuthStore();
  const [activeCategoryKey, setActiveCategoryKey] = useState('categoryAll');
  const [activeListingType, setActiveListingType] = useState<ListingTypeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const { data, isLoading, error, refetch } = useListings();
  const allListings = data?.items ?? [];
  const activeCategoryFilter = categoryFilterKeys.find((c) => c.labelKey === activeCategoryKey);
  const categoryFiltered = activeCategoryFilter && activeCategoryKey !== 'categoryAll'
    ? allListings.filter(activeCategoryFilter.match)
    : allListings;
  const listingTypeFiltered = activeListingType === 'all'
    ? categoryFiltered
    : categoryFiltered.filter((item: MarketplaceListing) => item.listingType === activeListingType);
  const listings = debouncedSearch
    ? listingTypeFiltered.filter((item: MarketplaceListing) =>
        item.title?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        sportLabel[item.sportType]?.includes(debouncedSearch)
      )
    : listingTypeFiltered;

  return (
    <div className="pt-[var(--safe-area-top)]">
      <MobilePageTopZone
        surface="plain"
        eyebrow="장비 거래"
        title={t('title')}
        subtitle="동호인끼리 믿고 거래할 수 있는 스포츠 장터예요."
        action={(
          <button
            type="button"
            onClick={() => {
              if (!isAuthenticated) {
                router.push('/login?redirect=' + encodeURIComponent(pathname));
                return;
              }
              router.push('/marketplace/new');
            }}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500 text-white transition-colors hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500"
            aria-label={t('createListing')}
          >
            <Plus size={18} aria-hidden="true" />
          </button>
        )}
      />

      {/* 검색 바 */}
      <div className="px-5 @3xl:px-0 mb-2">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <label htmlFor="marketplace-search" className="sr-only">장터 검색</label>
          <Input
            id="marketplace-search"
            type="text"
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 text-base shadow-sm"
          />
        </div>
      </div>

      {/* 거래 유형 칩 */}
      <div className="px-5 @3xl:px-0 mb-2 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {listingTypeFilters.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={activeListingType === f.key}
            onClick={() => setActiveListingType(f.key)}
            className={`shrink-0 min-h-[44px] rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              activeListingType === f.key
                ? 'bg-blue-500 text-white dark:bg-blue-500 dark:text-white'
                : 'border border-gray-100 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            {t(f.labelKey)}
          </button>
        ))}
      </div>

      {/* 카테고리 칩 */}
      <div className="px-5 @3xl:px-0 mb-4 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {categoryFilterKeys.map((cat) => (
          <button
            key={cat.labelKey}
            type="button"
            aria-pressed={activeCategoryKey === cat.labelKey}
            onClick={() => setActiveCategoryKey(cat.labelKey)}
            className={`shrink-0 min-h-[44px] rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              activeCategoryKey === cat.labelKey
                ? 'bg-blue-500 text-white dark:bg-blue-500 dark:text-white'
                : 'border border-gray-100 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
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
              <MarketplaceListingCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
