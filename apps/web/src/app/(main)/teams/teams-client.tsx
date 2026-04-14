'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { MobilePageTopZone } from '@/components/layout/mobile-page-top-zone';
import { TeamList } from './team-list';

export function TeamsPage() {
  const t = useTranslations('teams');

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
      <MobilePageTopZone
        surface="plain"
        eyebrow="팀 허브"
        title={t('title')}
        subtitle={t('subtitle')}
        action={(
          <Link href="/teams/new" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-blue-500 px-3.5 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-600">
            <Plus size={14} strokeWidth={2.5} />
            {t('createTeam')}
          </Link>
        )}
      />

      <div className="px-5 @3xl:px-0 pb-24">
        <TeamList />
      </div>
    </div>
  );
}
