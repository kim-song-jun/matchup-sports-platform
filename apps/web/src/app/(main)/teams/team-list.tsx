'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useTeams } from '@/hooks/use-api';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Users as UsersIcon } from 'lucide-react';
import { sportLabel, sportCardAccent } from '@/lib/constants';
import { getTeamImage } from '@/lib/sport-image';
import type { SportTeam } from '@/types/api';

const TeamCard = React.memo(function TeamCard({ team }: { team: SportTeam }) {
  const t = useTranslations('teams');
  const tl = useTranslations('levels');

  return (
    <Link href={`/teams/${team.id}`}>
      <div className="soft-panel group overflow-hidden rounded-[24px] transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:bg-white/85 dark:hover:bg-slate-900/80">
        <div className="flex">
          <div className="relative w-28 shrink-0 overflow-hidden bg-gray-100 dark:bg-gray-800">
            <Image src={getTeamImage(team.sportType, team.coverImageUrl)} alt={team.name} fill className="object-cover" sizes="112px" unoptimized />
          </div>
          <div className="flex flex-1 min-w-0 flex-col justify-center p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-base font-bold text-gray-900 dark:text-gray-100">{team.name}</h3>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {sportLabel[team.sportType] || team.sportType} · {tl(String(team.level) as any)}
                </p>
              </div>
              {team.isRecruiting && (
                <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200">
                  {t('recruiting')}
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700 dark:bg-blue-400/10 dark:text-blue-200">
                {t('memberCount', { count: team.memberCount })}
              </span>
              {team.city && <span>{team.city}{team.district ? ` · ${team.district}` : ''}</span>}
            </div>
            {team.description && <p className="mt-2 line-clamp-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{team.description}</p>}
          </div>
        </div>
      </div>
    </Link>
  );
});

export function TeamList() {
  const te = useTranslations('empty');
  const { data, isLoading, error, refetch } = useTeams();
  const teams = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 @3xl:grid @3xl:grid-cols-2">
        {[1, 2].map(i => <div key={i} className="h-[112px] rounded-[24px] bg-gray-100/70 dark:bg-gray-800 skeleton-shimmer" />)}
      </div>
    );
  }

  if (error) {
    return <ErrorState onRetry={() => refetch()} />;
  }

  if (teams.length === 0) {
    return (
      <EmptyState
        icon={UsersIcon}
        title={te('noTeams')}
        description={te('noTeamsDesc')}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 @3xl:grid @3xl:grid-cols-2 stagger-children">
      {teams.map((team: SportTeam) => (
        <TeamCard key={team.id} team={team} />
      ))}
    </div>
  );
}
