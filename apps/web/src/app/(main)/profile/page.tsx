'use client';

import { Settings, ChevronRight } from 'lucide-react';
import Link from 'next/link';

export default function ProfilePage() {
  return (
    <div className="px-5 pt-[var(--safe-area-top)]">
      <header className="flex items-center justify-between py-4">
        <h1 className="text-xl font-bold">마이페이지</h1>
        <button className="rounded-full bg-background p-2">
          <Settings size={20} />
        </button>
      </header>

      {/* 프로필 카드 */}
      <div className="mb-6 rounded-2xl border border-border bg-white p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-2xl">
            👤
          </div>
          <div>
            <p className="text-sm text-text-secondary">로그인이 필요해요</p>
            <Link
              href="/login"
              className="mt-1 inline-block text-sm font-semibold text-primary"
            >
              로그인하기 →
            </Link>
          </div>
        </div>
      </div>

      {/* 메뉴 */}
      <div className="space-y-1">
        {[
          { label: '매치 히스토리', icon: '⚽' },
          { label: '내 평가', icon: '⭐' },
          { label: '결제 내역', icon: '💳' },
          { label: '내 장터', icon: '🛍️' },
          { label: '설정', icon: '⚙️' },
        ].map((item) => (
          <button
            key={item.label}
            className="flex w-full items-center justify-between rounded-xl px-4 py-3.5 transition-colors hover:bg-background"
          >
            <div className="flex items-center gap-3">
              <span>{item.icon}</span>
              <span className="text-sm font-medium">{item.label}</span>
            </div>
            <ChevronRight size={18} className="text-text-secondary" />
          </button>
        ))}
      </div>
    </div>
  );
}
