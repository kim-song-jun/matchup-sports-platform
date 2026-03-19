'use client';

import { Plus } from 'lucide-react';

export default function MarketplacePage() {
  return (
    <div className="px-5 pt-[var(--safe-area-top)]">
      <header className="flex items-center justify-between py-4">
        <h1 className="text-xl font-bold">스포츠 장터</h1>
        <button className="flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white">
          <Plus size={16} />
          판매하기
        </button>
      </header>

      {/* 카테고리 */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {['전체', '스케이트', '하키장비', '농구화', '풋살화', '유니폼'].map((cat) => (
          <button
            key={cat}
            className="shrink-0 rounded-full border border-border bg-white px-4 py-1.5 text-sm font-medium transition-colors hover:border-primary hover:text-primary"
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="text-center py-20 text-text-secondary">
        <p className="text-lg">🛍️</p>
        <p className="mt-2 text-sm">아직 등록된 매물이 없어요</p>
        <p className="text-xs">첫 번째 판매자가 되어보세요!</p>
      </div>
    </div>
  );
}
