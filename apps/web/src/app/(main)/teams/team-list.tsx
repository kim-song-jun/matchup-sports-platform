'use client';

import { useTeams, useMyTeams } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { TeamCard } from '@/components/teams/team-card';
import { Users as UsersIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { SportTeam, MyTeam } from '@/types/api';

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
