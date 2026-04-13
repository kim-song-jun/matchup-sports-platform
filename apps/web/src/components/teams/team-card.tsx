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
          'flex gap-4 overflow-hidden transition-[transform] duration-150 active:scale-[0.98]',
          className,
        )}
      >
        {/* Cover image — 88×120 rectangular */}
        <div className="relative m-3 h-[88px] w-[120px] shrink-0 overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800">
          <SafeImage
            src={teamCoverImage}
            fallbackSrc={fallbackTeamCoverImage}
            alt={team.name}
            fill
            className="object-cover"
            sizes="120px"
          />
          <div className="absolute bottom-1 left-1 rounded-xl bg-white p-0.5 shadow-[0_1px_2px_rgba(0,0,0,0.10)] dark:bg-gray-800">
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
        <div className="flex min-w-0 flex-1 flex-col bg-white py-3 pr-3.5 dark:bg-gray-800">
          {/* 팀명 + 모집중 */}
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-md font-bold text-gray-900 dark:text-gray-100">{team.name}</h3>
            {team.isRecruiting && (
              <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-2xs font-medium text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                {t('recruiting')}
              </span>
            )}
          </div>

          {/* 종목 배지 + 지역 */}
          <div className="mt-1 flex items-center gap-1.5 min-w-0">
            <span className={`${sportCardAccent[team.sportType]?.badge || 'bg-gray-100 text-gray-500'} rounded-full px-1.5 py-0.5 text-2xs font-medium shrink-0`}>
              {sportLabel[team.sportType] || team.sportType}
            </span>
            {(team.city || team.district) && (
              <span className="flex items-center gap-0.5 text-2xs text-gray-400 dark:text-gray-500 min-w-0">
                <MapPin size={9} className="shrink-0" aria-hidden="true" />
                <span className="truncate">{team.district || team.city}</span>
              </span>
            )}
          </div>

          {/* 한줄 소개 */}
          <p className="mt-1.5 text-2xs text-gray-500 dark:text-gray-400 line-clamp-1 leading-relaxed">
            {team.description || '소개가 없는 팀이에요.'}
          </p>

          {/* 인원수 + 레벨 */}
          <div className="mt-auto pt-1.5 flex items-center gap-1 text-2xs text-gray-400 dark:text-gray-500">
            <Users size={9} className="shrink-0" aria-hidden="true" />
            <span className="font-medium text-gray-700 dark:text-gray-300">{t('memberCount', { count: team.memberCount })}</span>
            <span aria-hidden="true">·</span>
            <span>{tl(String(team.level) as Parameters<typeof tl>[0])}</span>
          </div>
        </div>
      </Card>
    </Link>
  );
});
