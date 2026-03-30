'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { TeamList } from './team-list';

export default function TeamsPage() {
  const t = useTranslations('teams');

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
      <header className="page-hero px-5 py-5 @3xl:px-6 @3xl:py-6">
        <div className="flex items-start justify-between gap-4">
          <div className="max-w-[32rem]">
            <div className="eyebrow-chip">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              Team operations
            </div>
            <h1 className="mt-4 text-2xl font-black tracking-tight text-gray-900 dark:text-white sm:text-3xl">
              {t('title')}
            </h1>
            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
              {t('subtitle')}
            </p>
          </div>
          <Link
            href="/teams/new"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-gray-900 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
          >
            <Plus size={14} strokeWidth={2.5} />
            {t('createTeam')}
          </Link>
        </div>
      </header>

      <div className="px-5 @3xl:px-0 pt-4">
        <div className="flex items-center justify-between gap-3 rounded-[24px] border border-gray-200/70 bg-white/80 px-4 py-3 text-sm text-gray-600 shadow-[0_12px_30px_rgba(15,23,42,0.05)] backdrop-blur-xl dark:border-gray-800 dark:bg-slate-950/70 dark:text-gray-300">
          <p>팀 단위 매칭과 모집 현황을 한 화면에서 확인할 수 있습니다.</p>
          <Link href="/teams/new" className="text-sm font-semibold text-blue-600 transition-colors hover:text-blue-500 dark:text-blue-300">
            새 팀 만들기
          </Link>
        </div>
      </div>

      <div className="px-5 @3xl:px-0 pt-4">
        <TeamList />
      </div>
    </div>
  );
}
