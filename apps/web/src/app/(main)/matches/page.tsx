'use client';

import { Search } from 'lucide-react';

export default function MatchesPage() {
  return (
    <div className="px-5 pt-[var(--safe-area-top)]">
      <header className="py-4">
        <h1 className="text-xl font-bold">매치 찾기</h1>
      </header>

      {/* 검색바 */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={18} />
        <input
          type="text"
          placeholder="지역, 종목으로 검색..."
          className="w-full rounded-xl border border-border bg-background py-3 pl-10 pr-4 text-sm outline-none focus:border-primary"
        />
      </div>

      {/* 필터 칩 */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {['전체', '풋살', '농구', '배드민턴', '아이스하키'].map((sport) => (
          <button
            key={sport}
            className="shrink-0 rounded-full border border-border bg-white px-4 py-1.5 text-sm font-medium transition-colors hover:border-primary hover:text-primary"
          >
            {sport}
          </button>
        ))}
      </div>

      {/* 매치 리스트 */}
      <div className="text-center py-20 text-text-secondary">
        <p className="text-lg">🔍</p>
        <p className="mt-2 text-sm">주변 매치를 찾아보세요</p>
        <p className="text-xs">위치 권한을 허용하면 가까운 매치를 추천해드려요</p>
      </div>
    </div>
  );
}
