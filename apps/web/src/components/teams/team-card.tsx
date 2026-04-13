'use client';

import React from 'react';
import Link from 'next/link';
import { MapPin, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { SafeImage } from '@/components/ui/safe-image';
import { sportLabel, sportCardAccent } from '@/lib/constants';
import { getTeamImage, getTeamLogo } from '@/lib/sport-image';
import type { SportTeam, MyTeam } from '@/types/api';
import { cn } from '@/lib/utils';

export interface TeamCardProps {
  team: MyTeam | SportTeam;
  className?: string;
}

export const TeamCard = React.memo(function TeamCard({ team, className }: TeamCardProps) {
  const t = useTranslations('teams');
  const tl = useTranslations('levels');
  const teamLogo = getTeamLogo(team.name, team.sportType, team.logoUrl, team.id);
  const fallbackTeamLogo = getTeamLogo(team.name, team.sportType, undefined, team.id);
  const teamCoverImage = getTeamImage(team.sportType, team.coverImageUrl ?? null, team.id);
  const fallbackTeamCoverImage = getTeamImage(team.sportType, undefined, team.id);

  return (
    <Link href={`/teams/${team.id}`} data-testid="team-card">
      <Card
        variant="default"
        padding="none"
        interactive
        className={cn(
          'flex overflow-hidden transition-[transform] duration-150 active:scale-[0.98]',
          className,
        )}
      >
        {/* Cover image — 80×80 rounded */}
        <div className="relative m-3 h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800">
          <SafeImage
            src={teamCoverImage}
            fallbackSrc={fallbackTeamCoverImage}
            alt={team.name}
            fill
            className="object-cover"
            sizes="80px"
          />
          <div className="absolute bottom-1 left-1 rounded-lg bg-white p-0.5 shadow-[0_1px_2px_rgba(0,0,0,0.10)] dark:bg-gray-800">
            <div className="relative h-6 w-6">
              <SafeImage
                src={teamLogo}
                fallbackSrc={fallbackTeamLogo}
                alt={`${team.name} logo`}
                fill
                className="rounded-md object-cover"
                sizes="24px"
              />
            </div>
          </div>
        </div>

        {/* Text content */}
        <div className="flex min-w-0 flex-1 flex-col justify-center bg-white py-3 pr-3.5 dark:bg-gray-800">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-base font-bold text-gray-900 dark:text-gray-100">{team.name}</h3>
            {team.isRecruiting && (
              <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                {t('recruiting')}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            <span
              className={`${sportCardAccent[team.sportType]?.badge || 'bg-gray-100 text-gray-500'} rounded-full px-2 py-0.5 text-xs font-medium`}
            >
              {sportLabel[team.sportType] || team.sportType}
            </span>
            <span className="flex items-center gap-0.5 text-xs text-gray-500">
              <Users size={10} aria-hidden="true" />
              {tl(String(team.level) as Parameters<typeof tl>[0])} · {t('memberCount', { count: team.memberCount })}
            </span>
          </div>
          {team.city && (
            <p className="mt-1 flex items-center gap-0.5 text-xs text-gray-400 dark:text-gray-500">
              <MapPin size={10} className="shrink-0" aria-hidden="true" />
              {team.city} {team.district}
            </p>
          )}
        </div>
      </Card>
    </Link>
  );
});
