'use client';

import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-gray-100 dark:border-gray-800 py-6 mt-4">
      <div className="px-5 text-center">
        <p className="text-xs text-gray-500">© 2026 TeamMeet. All rights reserved.</p>
        <div className="flex items-center justify-center gap-3 mt-2 text-xs text-gray-500">
          <Link href="/settings/terms" className="min-h-[44px] inline-flex items-center hover:text-gray-600">이용약관</Link>
          <span>·</span>
          <Link href="/settings/privacy" className="min-h-[44px] inline-flex items-center hover:text-gray-600">개인정보처리방침</Link>
        </div>
      </div>
    </footer>
  );
}
