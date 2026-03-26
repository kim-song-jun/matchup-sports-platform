'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Package, Search, ShoppingBag } from 'lucide-react';
import { useListings } from '@/hooks/use-api';
import { useDebounce } from '@/hooks/use-debounce';
import { ErrorState } from '@/components/ui/error-state';
import { sportLabel } from '@/lib/constants';
import { formatCurrency } from '@/lib/utils';
import type { MarketplaceListing } from '@/types/api';

const conditionLabel: Record<string, string> = {
  new: '새 상품', like_new: '거의 새 것', good: '양호', fair: '사용감', poor: '하자',
};

const categoryFilters: { label: string; match: (item: MarketplaceListing) => boolean }[] = [
  { label: '전체', match: () => true },
  { label: '풋살화', match: (item) => item.sportType === 'futsal' },
  { label: '하키장비', match: (item) => item.sportType === 'ice_hockey' },
  { label: '농구화', match: (item) => item.sportType === 'basketball' },
  { label: '라켓', match: (item) => item.sportType === 'badminton' },
  { label: '유니폼', match: (item) => item.title?.toLowerCase().includes('유니폼') },
  { label: '보호장비', match: (item) => item.title?.toLowerCase().includes('보호') || item.title?.toLowerCase().includes('장갑') },
];

export default function MarketplacePage() {
  const [activeCategory, setActiveCategory] = useState('전체');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const { data, isLoading, error, refetch } = useListings();
  const allListings = data?.items ?? [];
  const activeCategoryFilter = categoryFilters.find((c) => c.label === activeCategory);
  const categoryFiltered = activeCategoryFilter && activeCategory !== '전체'
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
      <header className="flex items-center justify-between px-5 lg:px-0 pt-4 pb-3">
        <h1 className="text-[22px] font-bold text-gray-900 dark:text-white">장터</h1>
        <Link href="/marketplace/new" className="flex items-center gap-1.5 rounded-xl bg-blue-500 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-blue-600 active:bg-gray-700 transition-colors">
          <Plus size={16} strokeWidth={2.5} />
          글쓰기
        </Link>
      </header>

      {/* 검색 바 */}
      <div className="px-5 lg:px-0 mb-2">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input
            type="text"
            placeholder="상품명, 종목 검색"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl bg-gray-50 dark:bg-gray-800 py-3 pl-10 pr-4 text-[14px] text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border focus:border-blue-200 dark:focus:bg-gray-900 dark:focus:border-blue-600 transition-all"
          />
        </div>
      </div>

      {/* 카테고리 칩 */}
      <div className="px-5 lg:px-0 mb-4 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {categoryFilters.map((cat) => (
          <button
            key={cat.label}
            onClick={() => setActiveCategory(cat.label)}
            className={`shrink-0 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors ${
              activeCategory === cat.label
                ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                : 'bg-gray-50 text-gray-500 hover:bg-gray-100 active:bg-gray-150 dark:bg-gray-800 dark:text-gray-500 dark:hover:bg-gray-700'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* 리스트 */}
      <div className="px-5 lg:px-0">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="h-[100px] rounded-xl bg-gray-100 dark:bg-gray-800 skeleton-shimmer" />
            ))}
          </div>
        ) : error ? (
          <ErrorState onRetry={() => refetch()} />
        ) : listings.length === 0 ? (
          <div className="rounded-xl bg-gray-50 p-16 text-center">
            <Package size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-[14px] text-gray-500">매물이 없어요</p>
            <p className="text-[13px] text-gray-500 mt-1">첫 번째 판매자가 되어보세요!</p>
          </div>
        ) : (
          <div className="space-y-2 stagger-children">
            {listings.map((item: MarketplaceListing) => (
                <Link key={item.id} href={`/marketplace/${item.id}`} className="block rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 active:scale-[0.98] hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                  <div className="flex gap-3.5">
                    {/* Thumbnail */}
                    <div className="flex h-[80px] w-[80px] shrink-0 items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-300">
                      <ShoppingBag size={20} />
                    </div>

                    {/* Content */}
                    <div className="flex flex-1 flex-col min-w-0 py-0.5">
                      <h3 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100 truncate">{item.title}</h3>

                      {/* meta: 지역 · 종목 · 상태 */}
                      <p className="text-[13px] text-gray-500 mt-1 truncate">
                        {item.locationDistrict || item.locationCity || '지역 미정'} · {sportLabel[item.sportType] || '기타'} · {conditionLabel[item.condition]}
                      </p>

                      {/* 가격 */}
                      <p className="text-[17px] font-bold text-gray-900 dark:text-gray-100 mt-1.5">{formatCurrency(item.price)}</p>

                      {/* 하단: 타입 + 통계 */}
                      <div className="flex items-center justify-between mt-auto pt-1">
                        <span className={`text-[12px] font-medium ${item.listingType === 'rent' ? 'text-gray-500 dark:text-gray-500' : 'text-gray-500 dark:text-gray-500'}`}>
                          {item.listingType === 'rent' ? '대여' : '판매'}
                        </span>
                        <span className="text-[12px] text-gray-300 dark:text-gray-500">
                          관심 {item.likeCount} · 조회 {item.viewCount}
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
