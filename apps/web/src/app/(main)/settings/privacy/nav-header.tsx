'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronRight } from 'lucide-react';

export function PrivacyNavHeader() {
  const router = useRouter();

  return (
    <>
      {/* Mobile header */}
      <header className="lg:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50">
        <button onClick={() => router.back()} aria-label="뒤로 가기" className="rounded-xl p-1.5 -ml-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 transition-colors">
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <h1 className="text-[16px] font-semibold text-gray-900">개인정보 처리방침</h1>
      </header>
      {/* Desktop breadcrumb */}
      <div className="hidden lg:flex items-center gap-2 mb-6 text-[13px] text-gray-500">
        <button onClick={() => router.push('/settings')} className="hover:text-gray-600">설정</button>
        <ChevronRight size={14} />
        <span className="text-gray-900 font-medium">개인정보 처리방침</span>
      </div>
    </>
  );
}
