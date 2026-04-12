'use client';

import React from 'react';
import Link from 'next/link';
import { Clock, MapPin, Users, TrendingUp, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { SafeImage } from '@/components/ui/safe-image';
import { sportLabel, sportCardAccent } from '@/lib/constants';
import { formatCurrency, formatMatchDate, getTimeBadge, friendlyLevel } from '@/lib/utils';
import { getSportImage } from '@/lib/sport-image';
import type { Match, RecommendationReason } from '@/types/api';
import { cn } from '@/lib/utils';

const REASON_ICON_MAP: Record<string, React.ElementType> = {
  level: TrendingUp,
  distance: MapPin,
  popularity: Users,
  urgency: Clock,
  new: Sparkles,
};

export interface MatchCardProps {
  match: Match;
  className?: string;
}

export const MatchCard = React.memo(function MatchCard({ match, className }: MatchCardProps) {
  const filled = match.currentPlayers / match.maxPlayers;
  const isFull = match.status === 'full' || filled >= 1;
  const isAlmostFull = !isFull && filled >= 0.7;
  const timeBadge = getTimeBadge(match.matchDate);
  const accent = sportCardAccent[match.sportType];
  const dotColor = accent?.dot || 'bg-gray-400';
  const remaining = match.maxPlayers - match.currentPlayers;
  const matchImage = getSportImage(match.sportType, match.imageUrl, match.id);
  const fallbackMatchImage = getSportImage(match.sportType, undefined, match.id);

  return (
    <Link href={`/matches/${match.id}`} className={cn('block', className)} data-testid="match-card">
      <Card
        variant="default"
        padding="none"
        interactive
        className="group overflow-hidden transition-[border-color,transform] duration-150 hover:border-gray-200 active:scale-[0.98] dark:hover:border-gray-700"
      >
        <div className="relative aspect-[16/9] overflow-hidden bg-gray-100 dark:bg-gray-800">
          <SafeImage
            src={matchImage}
            fallbackSrc={fallbackMatchImage}
            alt={`${sportLabel[match.sportType]} 매치 - ${match.title}`}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" />

          <div className="absolute left-3.5 top-3.5 flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${dotColor} ring-[1.5px] ring-white/60`} aria-hidden="true" />
            <span className="text-2xs font-semibold text-white/90">{sportLabel[match.sportType]}</span>
            {timeBadge && (
              <span className="rounded-md bg-gray-900/70 px-1.5 py-0.5 text-2xs font-bold leading-none text-white">
                {timeBadge.text}
              </span>
            )}
          </div>

          <div className="absolute bottom-3 left-3.5">
            <span className="text-sm font-bold text-white">{formatCurrency(match.fee)}</span>
          </div>

          <div className="absolute bottom-3 right-3">
            {isFull ? (
              <span className="rounded-md bg-gray-900/70 px-2 py-1 text-2xs font-bold leading-none text-white/70">
                마감
              </span>
            ) : isAlmostFull ? (
              <span className="rounded-md bg-amber-600/80 px-2 py-1 text-2xs font-bold leading-none text-white">
                {remaining}자리 남음
              </span>
            ) : (
              <span className="rounded-md bg-gray-900/70 px-2 py-1 text-2xs font-semibold leading-none text-white/80">
                <Users size={10} className="mr-0.5 inline -mt-px" aria-hidden="true" />
                {match.currentPlayers}/{match.maxPlayers}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-2 px-3.5 py-3.5">
          <h3 className="truncate text-sm font-semibold leading-snug text-gray-900 dark:text-gray-100">
            {match.title}
          </h3>

          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <Clock size={11} className="shrink-0 opacity-40" aria-hidden="true" />
            <span className="shrink-0">{formatMatchDate(match.matchDate)} {match.startTime}</span>
            {match.venue?.name && (
              <>
                <span className="shrink-0 opacity-30">·</span>
                <span className="truncate">{match.venue.name}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <MapPin size={11} className="shrink-0 opacity-40" aria-hidden="true" />
            <span className="truncate">
              {match.venue?.district
                ? `${match.venue.city} ${match.venue.district}`
                : match.venue?.city || '지역 미정'}
            </span>
            <span className="shrink-0 opacity-30">·</span>
            <span className="shrink-0">{friendlyLevel(match.levelMin, match.levelMax)}</span>
          </div>

          {match.reasons && match.reasons.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {match.reasons.slice(0, 2).map((reason: RecommendationReason) => {
                const ReasonIcon = REASON_ICON_MAP[reason.type];
                return (
                  <span
                    key={reason.type}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-600 dark:bg-blue-950/30 dark:text-blue-300"
                  >
                    <ReasonIcon size={10} aria-hidden="true" />
                    {reason.label}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
});
