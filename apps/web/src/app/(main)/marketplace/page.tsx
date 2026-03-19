'use client';

import Link from 'next/link';
import { Plus, Heart, Eye, Package } from 'lucide-react';
import { useListings } from '@/hooks/use-api';
import { SportIconMap } from '@/components/icons/sport-icons';

const sportLabel: Record<string, string> = {
  futsal: '풋살', basketball: '농구', badminton: '배드민턴',
  ice_hockey: '아이스하키', figure_skating: '피겨', short_track: '쇼트트랙',
};

const conditionLabel: Record<string, string> = {
  new: '새 상품', like_new: '거의 새 것', good: '양호', fair: '사용감', poor: '하자',
};

const conditionStyle: Record<string, string> = {
  new: 'text-emerald-600 bg-emerald-50',
  like_new: 'text-blue-600 bg-blue-50',
  good: 'text-gray-600 bg-gray-100',
  fair: 'text-amber-600 bg-amber-50',
  poor: 'text-red-600 bg-red-50',
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat('ko-KR').format(n) + '원';
}

export default function MarketplacePage() {
  const { data, isLoading } = useListings();
  const listings = data?.items ?? [];

  return (
    <div className="pt-[var(--safe-area-top)]">
      <header className="flex items-center justify-between px-5 lg:px-0 pt-4 pb-3">
        <h1 className="text-[22px] font-bold text-gray-900">장터</h1>
        <Link href="/marketplace/new" className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-[13px] font-semibold text-white active:bg-gray-800 transition-colors">
          <Plus size={16} strokeWidth={2.5} />
          글쓰기
        </Link>
      </header>

      {/* 카테고리 칩 */}
      <div className="px-5 lg:px-0 mb-4 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {['전체', '풋살화', '하키장비', '농구화', '라켓', '유니폼', '보호장비'].map((cat, i) => (
          <button
            key={cat}
            className={`shrink-0 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-all ${
              i === 0 ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200 active:bg-gray-50'
            }`}
          >
            {cat}
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
            {listings.map((item: any) => {
              const SportIcon = SportIconMap[item.sportType];
              return (
                <Link key={item.id} href={`/marketplace/${item.id}`} className="block py-4 first:pt-0 last:pb-0">
                  <div className="flex gap-3.5">
                    {/* Thumbnail */}
                    <div className="flex h-[110px] w-[110px] shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-300">
                      {SportIcon ? <SportIcon size={36} /> : <Package size={36} />}
                    </div>

                    {/* Content */}
                    <div className="flex flex-1 flex-col min-w-0 py-0.5">
                      <h3 className="text-[15px] font-medium text-gray-900 truncate">{item.title}</h3>

                      {/* 지역 · 시간 */}
                      <p className="text-[13px] text-gray-400 mt-1">
                        {item.locationDistrict || item.locationCity || '지역 미정'}
                      </p>

                      {/* 가격 (강조) */}
                      <p className="text-[16px] font-bold text-gray-900 mt-1.5">{formatCurrency(item.price)}</p>

                      {/* 하단: 배지 + 통계 */}
                      <div className="flex items-center justify-between mt-auto pt-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${conditionStyle[item.condition]}`}>
                            {conditionLabel[item.condition]}
                          </span>
                          {item.listingType === 'rent' && (
                            <span className="rounded px-1.5 py-0.5 text-[10px] font-medium text-violet-600 bg-violet-50">대여</span>
                          )}
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
