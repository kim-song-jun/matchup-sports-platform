'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Plus, Search, GraduationCap, Clock, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLessons } from '@/hooks/use-api';
import { useDebounce } from '@/hooks/use-debounce';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { SafeImage } from '@/components/ui/safe-image';
import { sportLabel, sportCardAccent, lessonTypeLabel, ticketTypeLabel } from '@/lib/constants';
import { formatCurrency, formatMatchDate, friendlyLevel } from '@/lib/utils';
import { getSportImage } from '@/lib/sport-image';
import type { Lesson, LessonTicketPlan } from '@/types/api';

const typeFilterKeys = [
  { key: '', labelKey: 'typeAll' as const },
  { key: 'group_lesson', labelKey: 'typeGroupLesson' as const },
  { key: 'practice_match', labelKey: 'typePracticeMatch' as const },
  { key: 'free_practice', labelKey: 'typeFreePractice' as const },
];

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

const LessonCard = React.memo(function LessonCard({ lesson }: { lesson: Lesson }) {
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
    <Link href={`/lessons/${lesson.id}`} className="block">
      <div className="group rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden hover:border-gray-200 dark:hover:border-gray-700 active:scale-[0.98] transition-[border-color,transform] duration-150">

        {/* Image — 16:9 top banner */}
        <div className="relative aspect-[16/9] bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <SafeImage
            src={lessonImage}
            fallbackSrc={fallbackLessonImage}
            alt=""
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
            loading="lazy"
          />
          {/* Gradient overlay for overlay readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

          {/* Top-left: sport dot + name */}
          <div className="absolute top-3 left-3.5 flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${dotColor} ring-[1.5px] ring-white/60`} />
            <span className="text-2xs font-semibold text-white/90 drop-shadow-sm">
              {sportLabel[lesson.sportType]}
            </span>
          </div>

          {/* Top-right: lesson type badge */}
          <div className="absolute top-3 right-3">
            <span className="text-2xs font-bold text-white bg-white/20 backdrop-blur-sm rounded-md px-1.5 py-0.5 leading-none">
              {lessonTypeLabel[lesson.type] || lesson.type}
            </span>
          </div>

          {/* Bottom-left: price */}
          <div className="absolute bottom-3 left-3.5">
            <span className="text-sm font-bold text-white drop-shadow-sm">
              {formatCurrency(lesson.fee)}
            </span>
          </div>

          {/* Bottom-right: participant fill status */}
          <div className="absolute bottom-3 right-3">
            {isFull ? (
              <span className="text-2xs font-bold text-white/70 bg-white/15 backdrop-blur-sm rounded-md px-2 py-1 leading-none">
                마감
              </span>
            ) : isAlmostFull ? (
              <span className="text-2xs font-bold text-amber-300 bg-amber-500/20 backdrop-blur-sm rounded-md px-2 py-1 leading-none">
                {remaining}자리 남음
              </span>
            ) : (
              <span className="text-2xs font-semibold text-white/80 bg-white/15 backdrop-blur-sm rounded-md px-2 py-1 leading-none">
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
        </div>
      </div>
    </Link>
  );
});

/** Skeleton card matching new vertical card shape. */
function LessonCardSkeleton() {
  return (
    <div className="rounded-2xl bg-gray-50 dark:bg-gray-800 skeleton-shimmer overflow-hidden">
      <div className="aspect-[16/9]" />
      <div className="px-3.5 py-3 space-y-2">
        <div className="h-4 w-3/4 rounded bg-gray-100 dark:bg-gray-700" />
        <div className="h-3 w-1/2 rounded bg-gray-100 dark:bg-gray-700" />
        <div className="h-3 w-2/5 rounded bg-gray-100 dark:bg-gray-700" />
      </div>
    </div>
  );
}

export default function LessonsPage() {
  const t = useTranslations('lessons');
  const te = useTranslations('empty');
  const [activeType, setActiveType] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const params: Record<string, string> = {};
  if (activeType) params.type = activeType;

  const { data, isLoading, error, refetch } = useLessons(Object.keys(params).length > 0 ? params : undefined);

  const allLessons = data?.items ?? [];
  const lessons = useMemo(() => {
    if (!debouncedSearch) return allLessons;
    return allLessons.filter((lesson: Lesson) =>
      lesson.title?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      lesson.coachName?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      lesson.venueName?.toLowerCase().includes(debouncedSearch.toLowerCase())
    );
  }, [allLessons, debouncedSearch]);

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
      {/* Page header */}
      <header className="px-5 @3xl:px-0 pt-4 pb-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('title')}</h1>
        <Link
          href="/lessons/new"
          className="flex items-center gap-1.5 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-600 active:bg-blue-700 transition-colors min-h-[44px]"
        >
          <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
          {t('createLesson')}
        </Link>
      </header>

      {/* Search */}
      <div className="px-5 @3xl:px-0 mb-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" size={16} aria-hidden="true" />
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl bg-gray-50 dark:bg-gray-800 py-3 pl-10 pr-4 text-base text-gray-900 dark:text-gray-100 placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white dark:focus:bg-gray-900 transition-colors"
          />
        </div>
      </div>

      {/* Type filter chips */}
      <div className="px-5 @3xl:px-0 mb-4 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {typeFilterKeys.map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveType(f.key)}
            className={`shrink-0 min-h-[44px] rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              activeType === f.key
                ? 'bg-blue-500 text-white dark:bg-blue-500 dark:text-white'
                : 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            {t(f.labelKey)}
          </button>
        ))}
      </div>

      {/* Result count */}
      {!isLoading && lessons.length > 0 && (
        <div className="px-5 @3xl:px-0 mb-3">
          <p className="text-sm text-gray-500">{t('lessonCount', { count: lessons.length })}</p>
        </div>
      )}

      {/* Lesson list */}
      <div className="px-5 @3xl:px-0">
        {isLoading ? (
          <div className="flex flex-col gap-3 @3xl:grid @3xl:grid-cols-2">
            {[1, 2, 3].map((i) => (
              <LessonCardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <ErrorState onRetry={() => refetch()} />
        ) : lessons.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title={te('noLessons')}
            description={te('noLessonsDesc')}
            action={{ label: t('createLesson'), href: '/lessons/new' }}
          />
        ) : (
          <div className="flex flex-col gap-3 @3xl:grid @3xl:grid-cols-2 stagger-children">
            {lessons.map((lesson: Lesson) => (
              <LessonCard key={lesson.id} lesson={lesson} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
