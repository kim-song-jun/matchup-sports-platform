import React from 'react';
import Link from 'next/link';
import { Clock, MapPin, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { SafeImage } from '@/components/ui/safe-image';
import { sportLabel, sportCardAccent, lessonTypeLabel, ticketTypeLabel } from '@/lib/constants';
import { formatCurrency, formatMatchDate, friendlyLevel } from '@/lib/utils';
import { getSportImage } from '@/lib/sport-image';
import { cn } from '@/lib/utils';
import type { Lesson, LessonTicketPlan } from '@/types/api';

/** Returns a ticket summary string from ticketPlans or falls back to lesson.fee. */
function ticketSummary(lesson: Lesson): string {
  const plans = lesson.ticketPlans?.filter((p: LessonTicketPlan) => p.isActive);
  if (!plans || plans.length === 0) return formatCurrency(lesson.fee);
  if (plans.length === 1) {
    const p = plans[0];
    const typeStr = ticketTypeLabel[p.type] || p.type;
    return `${typeStr} ${formatCurrency(p.price)}`;
  }
  // Multiple active plans — show lowest price as starting point
  const lowest = Math.min(...plans.map((p: LessonTicketPlan) => p.price));
  return `수강권 ${plans.length}종 · ${formatCurrency(lowest)}부터`;
}

export interface LessonCardProps {
  lesson: Lesson;
  className?: string;
}

export const LessonCard = React.memo(function LessonCard({ lesson, className }: LessonCardProps) {
  const filled = lesson.currentParticipants / lesson.maxParticipants;
  const isAlmostFull = filled >= 0.7 && filled < 1;
  const isFull = filled >= 1;
  const remaining = lesson.maxParticipants - lesson.currentParticipants;
  const accent = sportCardAccent[lesson.sportType];
  const dotColor = accent?.dot || 'bg-gray-400';
  const lessonImage = getSportImage(lesson.sportType, lesson.imageUrls?.[0] ?? lesson.imageUrl, lesson.id);
  const fallbackLessonImage = getSportImage(lesson.sportType, undefined, lesson.id);

  // Determine next session date: prefer upcomingSchedules if available
  const nextDate = lesson.upcomingSchedules?.[0]?.sessionDate ?? lesson.lessonDate;
  const nextTime = lesson.upcomingSchedules?.[0]?.startTime ?? lesson.startTime;

  return (
    <Link href={`/lessons/${lesson.id}`} className="block" data-testid="lesson-card">
      <Card
        variant="default"
        padding="none"
        interactive
        className={cn('group overflow-hidden active:scale-[0.98] transition-[border-color,transform] duration-150', className)}
      >
        {/* Image — 16:9 top banner */}
        <div className="relative aspect-[16/9] bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <SafeImage
            src={lessonImage}
            fallbackSrc={fallbackLessonImage}
            alt={`${sportLabel[lesson.sportType] ?? lesson.sportType} 강좌 - ${lesson.title}`}
            fill
            className="object-cover group-hover:scale-[1.02] transition-transform duration-300"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
          {/* Gradient overlay for readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

          {/* Top-left: sport dot + name */}
          <div className="absolute top-3 left-3.5 flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${dotColor} ring-[1.5px] ring-white/60`} aria-hidden="true" />
            <span className="text-2xs font-medium text-white/90 drop-shadow-sm">
              {sportLabel[lesson.sportType]}
            </span>
          </div>

          {/* Top-right: lesson type badge */}
          <div className="absolute top-3 right-3">
            <span className="text-2xs font-medium text-white bg-gray-900/60 rounded-md px-1.5 py-0.5 leading-none">
              {lessonTypeLabel[lesson.type] || lesson.type}
            </span>
          </div>

          {/* Bottom-left: price */}
          <div className="absolute bottom-3 left-3.5">
            <span className="rounded-md bg-gray-900/70 px-1.5 py-0.5 text-2xs font-medium leading-none text-white drop-shadow-sm">
              {formatCurrency(lesson.fee)}
            </span>
          </div>

          {/* Bottom-right: participant fill status */}
          <div className="absolute bottom-3 right-3">
            {isFull ? (
              <span className="text-2xs font-medium text-white bg-gray-900/70 rounded-md px-1.5 py-0.5 leading-none">
                마감
              </span>
            ) : isAlmostFull ? (
              <span className="text-2xs font-medium text-white bg-blue-600/80 rounded-md px-1.5 py-0.5 leading-none">
                <Clock size={10} className="inline -mt-px mr-0.5" aria-hidden="true" />
                {remaining}자리 남음
              </span>
            ) : (
              <span className="text-2xs font-medium text-white bg-gray-900/60 rounded-md px-1.5 py-0.5 leading-none">
                <Users size={10} className="inline -mt-px mr-0.5" aria-hidden="true" />
                {lesson.currentParticipants}/{lesson.maxParticipants}
              </span>
            )}
          </div>
        </div>

        {/* Text content */}
        <div className="px-3.5 py-3">
          {/* Title */}
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate leading-snug">
            {lesson.title}
          </h3>

          {/* Meta row: date · venue · level */}
          <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            <Clock size={11} className="opacity-40 shrink-0" aria-hidden="true" />
            <span className="shrink-0">{formatMatchDate(nextDate)} {nextTime}</span>
            {lesson.venueName && (
              <>
                <span className="opacity-30 shrink-0" aria-hidden="true">·</span>
                <MapPin size={11} className="shrink-0 opacity-40" aria-hidden="true" />
                <span className="truncate">{lesson.venueName}</span>
              </>
            )}
            <span className="opacity-30 shrink-0" aria-hidden="true">·</span>
            <span className="shrink-0">{friendlyLevel(lesson.levelMin, lesson.levelMax)}</span>
          </div>

          {/* Ticket info + coach */}
          <div className="flex items-center justify-between mt-1.5 gap-2">
            <span className="text-xs text-blue-500 dark:text-blue-400 font-medium truncate">
              {ticketSummary(lesson)}
            </span>
            {lesson.coachName && (
              <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 truncate max-w-[7rem]">
                {lesson.coachName} 코치
              </span>
            )}
          </div>

          {(lesson.team || lesson.venue) && (
            <div className="mt-2 flex items-center gap-1.5 text-2xs text-gray-500 dark:text-gray-400">
              {lesson.team && (
                <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5">
                  팀: {lesson.team.name}
                </span>
              )}
              {lesson.venue && (
                <span className="flex items-center gap-0.5 rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5">
                  <MapPin size={10} className="shrink-0" aria-hidden="true" />
                  {lesson.venue.name}
                </span>
              )}
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
});
