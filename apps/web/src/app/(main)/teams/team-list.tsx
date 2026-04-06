'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useTeams, useMyTeams } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
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
      <div className="rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden flex hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-[0.98] transition-colors">
        {/* 이미지 */}
        <div className="w-28 shrink-0 bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <img src={getTeamImage(team.sportType, team.coverImageUrl)} alt={team.name} className="w-full h-full object-cover" loading="lazy" />
        </div>
        {/* 텍스트 */}
        <div className="flex-1 bg-white dark:bg-gray-800 p-4 min-w-0 flex flex-col justify-center">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{team.name}</h3>
            {team.isRecruiting && <span className="shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 rounded-full px-2 py-0.5">{t('recruiting')}</span>}
          </div>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
            <span className={`${sportCardAccent[team.sportType]?.badge || 'bg-gray-100 text-gray-500'} rounded-full px-2 py-0.5 text-xs font-normal`}>
              {sportLabel[team.sportType] || team.sportType}
            </span>
            <span>{tl(String(team.level) as any)} · {t('memberCount', { count: team.memberCount })}</span>
          </p>
          {team.description && <p className="text-xs text-gray-500 mt-1 line-clamp-1">{team.description}</p>}
          {team.city && <p className="text-2xs text-gray-500 mt-0.5">{team.city} {team.district}</p>}
        </div>
      </div>
    </Link>
  );
});

export function TeamList() {
  const te = useTranslations('empty');
  const { isAuthenticated } = useAuthStore();
  const { data, isLoading, error, refetch } = useTeams();
  const { data: myTeams } = useMyTeams();

  const allTeams = data?.items ?? [];
  const myTeamList = myTeams ?? [];
  const myTeamIds = new Set(myTeamList.map((t: SportTeam) => t.id));
  const otherTeams = isAuthenticated ? allTeams.filter((t: SportTeam) => !myTeamIds.has(t.id)) : allTeams;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 @3xl:grid @3xl:grid-cols-2">
        {[1, 2].map(i => <div key={i} className="h-[92px] rounded-xl bg-gray-50 dark:bg-gray-800 skeleton-shimmer" />)}
      </div>
    );
  }

  if (error) {
    return <ErrorState onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-6">
      {isAuthenticated && myTeamList.length > 0 && (
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white mb-3">내 팀</h2>
          <div className="flex flex-col gap-3 @3xl:grid @3xl:grid-cols-2">
            {myTeamList.map((team: SportTeam) => (
              <TeamCard key={team.id} team={team} />
            ))}
          </div>
        </div>
      )}

      <div>
        {isAuthenticated && myTeamList.length > 0 && (
          <h2 className="text-base font-bold text-gray-900 dark:text-white mb-3">다른 팀</h2>
        )}
        {otherTeams.length === 0 && !isLoading ? (
          <EmptyState
            icon={UsersIcon}
            title={te('noTeams')}
            description={te('noTeamsDesc')}
          />
        ) : (
          <div className="flex flex-col gap-3 @3xl:grid @3xl:grid-cols-2 stagger-children">
            {otherTeams.map((team: SportTeam) => (
              <TeamCard key={team.id} team={team} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
