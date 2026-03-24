'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Heart, Eye, Package, Search, ShoppingBag } from 'lucide-react';
import { useListings } from '@/hooks/use-api';
import { SportIconMap } from '@/components/icons/sport-icons';
import type { MarketplaceListing } from '@/types/api';

const sportLabel: Record<string, string> = {
  futsal: '풋살', basketball: '농구', badminton: '배드민턴',
  ice_hockey: '아이스하키', figure_skating: '피겨', short_track: '쇼트트랙',
};

const conditionLabel: Record<string, string> = {
  new: '새 상품', like_new: '거의 새 것', good: '양호', fair: '사용감', poor: '하자',
};

const conditionStyle: Record<string, string> = {
  new: 'bg-blue-50 text-blue-600 font-semibold',
  like_new: 'bg-blue-50 text-blue-500',
  good: 'bg-gray-100 text-gray-600',
  fair: 'bg-gray-100 text-gray-500',
  poor: 'bg-gray-100 text-gray-400',
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat('ko-KR').format(n) + '원';
}

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
  const { data, isLoading } = useListings();
  const allListings = data?.items ?? [];
  const activeCategoryFilter = categoryFilters.find((c) => c.label === activeCategory);
  const categoryFiltered = activeCategoryFilter && activeCategory !== '전체'
    ? allListings.filter(activeCategoryFilter.match)
    : allListings;
  const listings = searchQuery
    ? categoryFiltered.filter((item: MarketplaceListing) =>
        item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sportLabel[item.sportType]?.includes(searchQuery)
      )
    : categoryFiltered;

  return (
    <div className="pt-[var(--safe-area-top)]">
      <header className="flex items-center justify-between px-5 lg:px-0 pt-4 pb-3">
        <h1 className="text-[22px] font-bold text-gray-900 dark:text-white">장터</h1>
        <Link href="/marketplace/new" className="flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-gray-800 active:bg-gray-700 transition-colors">
          <Plus size={16} strokeWidth={2.5} />
          글쓰기
        </Link>
      </header>

      {/* 검색 바 */}
      <div className="px-5 lg:px-0 mb-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="상품명, 종목 검색"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl bg-gray-50 dark:bg-gray-800 py-3 pl-10 pr-4 text-[14px] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
          />
        </div>
      </div>

      {/* 카테고리 칩 */}
      <div className="px-5 lg:px-0 mb-4 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {categoryFilters.map((cat) => (
          <button
            key={cat.label}
            onClick={() => setActiveCategory(cat.label)}
            className={`shrink-0 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-all ${
              activeCategory === cat.label
                ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                : 'bg-white text-gray-600 border border-gray-200 active:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* 리스트 */}
      <div className="px-5 lg:px-0">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map(i => (
              <div key={i} className="h-[100px] animate-pulse rounded-2xl bg-gray-50" />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="rounded-2xl bg-gray-50 p-16 text-center">
            <Package size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-[15px] font-medium text-gray-600">아직 등록된 매물이 없어요</p>
            <p className="text-[13px] text-gray-400 mt-1">첫 번째 판매자가 되어보세요!</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {listings.map((item: MarketplaceListing) => {
              const SportIcon = SportIconMap[item.sportType];
              return (
                <Link key={item.id} href={`/marketplace/${item.id}`} className="block py-4 first:pt-0 last:pb-0">
                  <div className="flex gap-3.5">
                    {/* Thumbnail */}
                    <div className="flex h-[100px] w-[100px] shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-300">
                      {SportIcon ? <SportIcon size={24} /> : <ShoppingBag size={24} />}
                    </div>

                    {/* Content */}
                    <div className="flex flex-1 flex-col min-w-0 py-0.5">
                      <h3 className="text-[15px] font-medium text-gray-900 dark:text-gray-100 truncate">{item.title}</h3>

                      {/* 지역 · 시간 */}
                      <p className="text-[13px] text-gray-400 mt-1">
                        {item.locationDistrict || item.locationCity || '지역 미정'}
                      </p>

                      {/* 가격 (강조) */}
                      <p className="text-[18px] font-bold text-gray-900 dark:text-gray-100 mt-1.5">{formatCurrency(item.price)}</p>

                      {/* 하단: 배지 + 통계 */}
                      <div className="flex items-center justify-between mt-auto pt-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${conditionStyle[item.condition]}`}>
                            {conditionLabel[item.condition]}
                          </span>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${item.listingType === 'rent' ? 'text-green-600 bg-green-50' : 'text-orange-600 bg-orange-50'}`}>
                            {item.listingType === 'rent' ? '대여' : '판매'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5 text-gray-400 text-[11px]">
                          <span className="flex items-center gap-0.5">
                            <Eye size={12} />
                            {item.viewCount}
                          </span>
                          <span className="flex items-center gap-0.5">
                            <Heart size={12} />
                            {item.likeCount}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="h-6" />
    </div>
  );
}
