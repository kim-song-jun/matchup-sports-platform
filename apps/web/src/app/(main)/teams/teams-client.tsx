'use client';

import { useRouter, usePathname } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { MobilePageTopZone } from '@/components/layout/mobile-page-top-zone';
import { useAuthStore } from '@/stores/auth-store';
import { TeamList } from './team-list';

export function TeamsPage() {
  const t = useTranslations('teams');
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated } = useAuthStore();

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
      <MobilePageTopZone
        surface="plain"
        eyebrow="팀 허브"
        title={t('title')}
        subtitle={t('subtitle')}
        action={(
          <button
            type="button"
            onClick={() => {
              if (!isAuthenticated) {
                router.push('/login?redirect=' + encodeURIComponent(pathname));
                return;
              }
              router.push('/teams/new');
            }}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500 text-white transition-colors hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500"
            aria-label={t('createTeam')}
          >
            <Plus size={18} aria-hidden="true" />
          </button>
        )}
      />

      <div className="px-5 @3xl:px-0">
        <TeamList />
      </div>
      <div className="h-24" />
    </div>
  );
}
