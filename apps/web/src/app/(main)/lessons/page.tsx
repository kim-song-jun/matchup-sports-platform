'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Plus, Search, GraduationCap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { MobilePageTopZone } from '@/components/layout/mobile-page-top-zone';
import { useLessons } from '@/hooks/use-api';
import { useDebounce } from '@/hooks/use-debounce';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { LessonCard } from '@/components/lesson/lesson-card';
import type { Lesson } from '@/types/api';

const typeFilterKeys = [
  { key: '', labelKey: 'typeAll' as const },
  { key: 'group_lesson', labelKey: 'typeGroupLesson' as const },
  { key: 'practice_match', labelKey: 'typePracticeMatch' as const },
  { key: 'free_practice', labelKey: 'typeFreePractice' as const },
];

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
      <MobilePageTopZone
        surface="plain"
        eyebrow="레슨 · 연습"
        title={t('title')}
        subtitle="개인 레슨부터 연습 매치까지, 나에게 맞는 훈련 기회를 찾아보세요."
        action={(
          <Link
            href="/lessons/new"
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500 text-white transition-colors hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500"
            aria-label={t('createLesson')}
          >
            <Plus size={18} aria-hidden="true" />
          </Link>
        )}
      />

      {/* Search */}
      <div className="px-5 @3xl:px-0 mb-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" size={16} aria-hidden="true" />
          <label htmlFor="lessons-search" className="sr-only">강좌 검색</label>
          <Input
            id="lessons-search"
            type="text"
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Type filter chips */}
      <div className="px-5 @3xl:px-0 mb-4 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {typeFilterKeys.map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveType(f.key)}
            className={`shrink-0 min-h-[44px] rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              activeType === f.key
                ? 'bg-blue-500 text-white dark:bg-blue-500 dark:text-white'
                : 'border border-gray-100 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
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
      <div className="h-24" />
    </div>
  );
}
