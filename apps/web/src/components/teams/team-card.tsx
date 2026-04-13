'use client';

import React from 'react';
import Link from 'next/link';
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
    <Link href={`/teams/${team.id}`}>
      <Card
        variant="default"
        padding="none"
        interactive
        className={cn(
          'flex h-24 overflow-hidden transition-[transform] duration-150 active:scale-[0.98]',
          className,
        )}
      >
        {/* Square cover image */}
        <div className="relative w-24 shrink-0 overflow-hidden bg-gray-100 dark:bg-gray-800">
          <SafeImage
            src={teamCoverImage}
            fallbackSrc={fallbackTeamCoverImage}
            alt={team.name}
            fill
            className="object-cover"
            sizes="96px"
          />
          <div className="absolute bottom-1.5 left-1.5 rounded-xl bg-white p-0.5 shadow-[0_1px_2px_rgba(0,0,0,0.08)] dark:bg-gray-800">
            <div className="relative h-7 w-7">
              <SafeImage
                src={teamLogo}
                fallbackSrc={fallbackTeamLogo}
                alt={`${team.name} logo`}
                fill
                className="rounded-lg object-cover"
                sizes="28px"
              />
            </div>
          </div>
        </div>

        {/* Text content */}
        <div className="flex min-w-0 flex-1 flex-col justify-center bg-white px-3.5 py-3 dark:bg-gray-800">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">{team.name}</h3>
            {team.isRecruiting && (
              <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                {t('recruiting')}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            {(team.sportTypes ?? [team.sportType]).slice(0, 2).map((st) => (
              <span
                key={st}
                className={`${sportCardAccent[st]?.badge || 'bg-gray-100 text-gray-500'} rounded-full px-2 py-0.5 text-xs font-normal shrink-0`}
              >
                {sportLabel[st] || st}
              </span>
            ))}
            {(team.sportTypes?.length ?? 1) > 2 && (
              <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-2xs font-medium text-gray-500 dark:text-gray-400 shrink-0">
                +{(team.sportTypes?.length ?? 1) - 2}
              </span>
            )}
            <span>{tl(String(team.level) as Parameters<typeof tl>[0])} · {t('memberCount', { count: team.memberCount })}</span>
          </div>
          {team.description && (
            <p className="mt-1 line-clamp-1 text-xs text-gray-500 dark:text-gray-400">{team.description}</p>
          )}
          {(team.city || team.district) && (
            <p className="mt-0.5 text-2xs text-gray-400 dark:text-gray-500">{team.district || team.city}</p>
          )}
        </div>
      </Card>
    </Link>
  );
});
