'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { TeamList } from './team-list';

export function TeamsPage() {
  const t = useTranslations('teams');

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
      <header className="flex items-center justify-between px-5 @3xl:px-0 pt-4 pb-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('subtitle')}</p>
        </div>
        <Link href="/teams/new" className="flex items-center gap-1.5 rounded-xl bg-gray-900 dark:bg-white px-4 py-2.5 text-sm font-bold text-white dark:text-gray-900 transition-colors">
          <Plus size={14} strokeWidth={2.5} />
          {t('createTeam')}
        </Link>
      </header>

      <div className="px-5 @3xl:px-0">
        <TeamList />
      </div>
    </div>
  );
}
