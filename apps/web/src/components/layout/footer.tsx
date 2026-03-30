'use client';

import Link from 'next/link';

export function Footer() {
  return (
    <footer className="mt-10 pt-6">
      <div className="surface-divider" />
      <div className="flex flex-col gap-4 px-1 pt-5 text-sm sm:flex-row sm:items-center sm:justify-between">
        <Link href="/home" className="flex items-center gap-3">
          <div className="brand-mark h-9 w-9 rounded-[14px]"><span>M</span></div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">MatchUp</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">매칭 · 신뢰 · 프로필</p>
          </div>
        </Link>
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span>© 2026 MatchUp. All rights reserved.</span>
          <Link href="/settings/terms" className="min-h-[44px] inline-flex items-center transition-colors hover:text-gray-900 dark:hover:text-white">이용약관</Link>
          <Link href="/settings/privacy" className="min-h-[44px] inline-flex items-center transition-colors hover:text-gray-900 dark:hover:text-white">개인정보처리방침</Link>
        </div>
      </div>
    </footer>
  );
}
