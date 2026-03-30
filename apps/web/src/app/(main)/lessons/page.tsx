'use client';

import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Plus, Search, GraduationCap, BookOpen, Users, Target } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLessons } from '@/hooks/use-api';
import { useDebounce } from '@/hooks/use-debounce';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { sportLabel, sportCardAccent, lessonTypeLabel as typeLabel } from '@/lib/constants';
import { formatCurrency, formatDate } from '@/lib/utils';
import { getSportImage } from '@/lib/sport-image';
import type { Lesson } from '@/types/api';

const typeFilterKeys = [
  { key: '', labelKey: 'typeAll' as const },
  { key: 'group_lesson', labelKey: 'typeGroupLesson' as const },
  { key: 'practice_match', labelKey: 'typePracticeMatch' as const },
  { key: 'free_practice', labelKey: 'typeFreePractice' as const },
];

const surfaceCard =
  'rounded-[28px] border border-slate-200/70 bg-white/90 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-black/20';

const softCard =
  'rounded-[24px] border border-slate-200/60 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/78 dark:shadow-black/10';

const LessonCard = React.memo(function LessonCard({ lesson }: { lesson: Lesson }) {
  return (
    <Link href={`/lessons/${lesson.id}`}>
      <div className={`${softCard} group flex flex-col overflow-hidden transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(15,23,42,0.08)] dark:hover:bg-slate-900 sm:flex-row`}>
        <div className="relative h-36 w-full shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-900 sm:h-auto sm:w-28">
          <Image
            src={getSportImage(lesson.sportType, lesson.imageUrl)}
            alt={lesson.title}
            fill
            className="object-cover"
            sizes="(min-width: 640px) 112px, 100vw"
            unoptimized
          />
        </div>
        <div className="flex-1 min-w-0 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">LESSON</p>
              <h3 className="mt-1 text-base font-semibold text-slate-950 truncate dark:text-white">{lesson.title}</h3>
            </div>
            <span className="shrink-0 rounded-full border border-slate-200/70 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              {typeLabel[lesson.type] || lesson.type}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span className={`${sportCardAccent[lesson.sportType]?.badge || 'bg-gray-100 text-gray-500'} rounded-full px-2 py-0.5 text-xs font-normal`}>
              {sportLabel[lesson.sportType]}
            </span>
            {lesson.coachName && ` · 코치 ${lesson.coachName}`}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/70">
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">일정</p>
              <p className="mt-1 font-medium text-slate-700 dark:text-slate-200">{formatDate(lesson.lessonDate)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/70">
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">참가</p>
              <p className="mt-1 font-medium text-slate-700 dark:text-slate-200">{lesson.currentParticipants}/{lesson.maxParticipants}</p>
            </div>
            <div className="col-span-2 rounded-2xl border border-slate-200/70 bg-slate-50/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/70 sm:col-span-1">
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">비용</p>
              <p className="mt-1 font-semibold text-slate-950 dark:text-white">{formatCurrency(lesson.fee)}</p>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
});

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
  const lessonStats = [
    { label: '레슨', value: allLessons.length, icon: BookOpen },
    { label: '활성 코치', value: new Set(allLessons.map((lesson) => lesson.coachName).filter(Boolean)).size, icon: Users },
    { label: '추천 유형', value: typeFilterKeys.length - 1, icon: Target },
  ];

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
      <section className="px-5 @3xl:px-0 pt-4">
        <div className={`${surfaceCard} overflow-hidden p-6 sm:p-7`}>
          <div className="flex flex-col gap-5 @3xl:flex-row @3xl:items-end @3xl:justify-between">
            <div className="max-w-2xl">
              <div className="eyebrow-chip">
                <BookOpen size={14} />
                MatchUp Lessons
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                배우는 경험도 매칭처럼 정리합니다.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
                레슨, 프랙티스 매치, 자유 연습을 한 화면에서 탐색하고 코치 정보와 일정, 비용을 빠르게 비교할 수 있습니다.
              </p>
            </div>
            <Link
              href="/lessons/new"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-950/20 dark:bg-white dark:text-slate-950"
            >
              <Plus size={14} strokeWidth={2.5} />
              {t('createLesson')}
            </Link>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {lessonStats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    <Icon size={14} />
                    {stat.label}
                  </div>
                  <p className="mt-2 text-2xl font-black tracking-tight text-slate-950 dark:text-white">{stat.value}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-5 @3xl:px-0 mt-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-surface py-3.5 pl-11 pr-4 text-base outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      </section>

      <section className="px-5 @3xl:px-0 mt-4">
        <div className="segmented-control scrollbar-hide overflow-x-auto pb-1">
          {typeFilterKeys.map((f) => (
            <button
              key={f.key}
              onClick={() => setActiveType(f.key)}
              className={`segmented-pill shrink-0 ${activeType === f.key ? 'is-active' : ''}`}
            >
              {t(f.labelKey)}
            </button>
          ))}
        </div>
      </section>

      <section className="px-5 @3xl:px-0 mt-4">
        {isLoading ? (
          <div className="grid gap-3 @3xl:grid-cols-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-[128px] rounded-[24px] bg-slate-100/80 dark:bg-slate-900/70 skeleton-shimmer" />
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
          <div className="grid gap-3 @3xl:grid-cols-2 stagger-children">
            {lessons.map((lesson: Lesson) => (
              <LessonCard key={lesson.id} lesson={lesson} />
            ))}
          </div>
        )}
      </section>

    </div>
  );
}
