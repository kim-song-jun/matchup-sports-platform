'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronRight } from 'lucide-react';

export function TermsNavHeader() {
  const router = useRouter();

  return (
    <>
      <header className="page-hero px-5 py-5 @3xl:px-6 @3xl:py-6">
        <div className="flex items-start gap-4">
          <button
            onClick={() => router.push('/settings')}
            aria-label="뒤로 가기"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl border border-gray-200/70 bg-white/70 p-2 text-gray-700 transition-colors hover:bg-white dark:border-gray-800 dark:bg-slate-950/60 dark:text-gray-300 dark:hover:bg-slate-900"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <div className="eyebrow-chip">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              Legal note
            </div>
            <h1 className="mt-4 text-2xl font-black tracking-tight text-gray-900 dark:text-white sm:text-3xl">이용약관</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-300">
              약관은 기능보다 우선하는 기준 문서로 두고, 읽는 흐름이 끊기지 않도록 조용한 밀도로 정리합니다.
            </p>
          </div>
        </div>
      </header>

      <div className="hidden @3xl:flex items-center gap-2 mb-6 px-6 text-sm text-gray-500 dark:text-gray-400">
        <button onClick={() => router.push('/settings')} className="hover:text-gray-600 dark:hover:text-gray-300">설정</button>
        <ChevronRight size={14} />
        <span className="font-medium text-gray-900 dark:text-white">이용약관</span>
      </div>
    </>
  );
}
