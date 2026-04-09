'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useTeams, useMyTeams } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { SafeImage } from '@/components/ui/safe-image';
import { Users as UsersIcon } from 'lucide-react';
import { sportLabel, sportCardAccent } from '@/lib/constants';
import { getTeamImage, getTeamLogo } from '@/lib/sport-image';
import type { SportTeam, MyTeam } from '@/types/api';

const TeamCard = React.memo(function TeamCard({ team }: { team: MyTeam | SportTeam }) {
  const t = useTranslations('teams');
  const tl = useTranslations('levels');
  const teamLogo = getTeamLogo(team.name, team.sportType, team.logoUrl, team.id);
  const fallbackTeamLogo = getTeamLogo(team.name, team.sportType, undefined, team.id);
  const teamCoverImage = getTeamImage(team.sportType, team.coverImageUrl ?? null, team.id);
  const fallbackTeamCoverImage = getTeamImage(team.sportType, undefined, team.id);

  return (
    <Link href={`/teams/${team.id}`}>
      <div className="rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden flex hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-[0.98] transition-colors">
        {/* 이미지 */}
        <div className="relative w-28 shrink-0 bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <SafeImage
            src={teamCoverImage}
            fallbackSrc={fallbackTeamCoverImage}
            alt={team.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          <div className="absolute bottom-2 left-2 rounded-2xl bg-white/92 p-1 shadow-[0_10px_30px_rgba(15,23,42,0.18)] backdrop-blur-sm">
            <SafeImage
              src={teamLogo}
              fallbackSrc={fallbackTeamLogo}
              alt={`${team.name} logo`}
              className="h-9 w-9 rounded-xl object-cover"
              loading="lazy"
            />
          </div>
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
            <span>{tl(String(team.level) as Parameters<typeof tl>[0])} · {t('memberCount', { count: team.memberCount })}</span>
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
  const myTeamList: MyTeam[] = myTeams ?? [];
  const myTeamIds = new Set(myTeamList.map((t) => t.id));
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
      {isAuthenticated && (
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white mb-3">내 팀</h2>
          {myTeamList.length === 0 ? (
            <EmptyState
              icon={UsersIcon}
              title="소속 팀이 없어요"
              description="팀을 만들거나 가입해보세요"
              size="sm"
              action={{ label: '팀 만들기', href: '/teams/new' }}
            />
          ) : (
            <div className="flex flex-col gap-3 @3xl:grid @3xl:grid-cols-2">
              {myTeamList.map((team) => (
                <TeamCard key={team.id} team={team} />
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        {isAuthenticated && (
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
