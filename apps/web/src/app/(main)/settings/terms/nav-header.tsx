'use client';

import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { MobileGlassHeader } from '@/components/layout/mobile-glass-header';

export function TermsNavHeader() {
  const router = useRouter();

  return (
    <>
      <MobileGlassHeader title="이용약관" showBack />
      {/* Desktop breadcrumb */}
      <div className="hidden @3xl:flex items-center gap-2 mb-6 text-sm text-gray-500">
        <button onClick={() => router.push('/settings')} className="hover:text-gray-600 dark:hover:text-gray-400">설정</button>
        <ChevronRight size={14} />
        <span className="text-gray-900 dark:text-white font-medium">이용약관</span>
      </div>
    </>
  );
}
