'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Plus, Search, GraduationCap } from 'lucide-react';
import { useLessons } from '@/hooks/use-api';
import { useDebounce } from '@/hooks/use-debounce';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { sportLabel, sportCardAccent, lessonTypeLabel as typeLabel } from '@/lib/constants';
import { formatCurrency, formatDate } from '@/lib/utils';
import { getSportImage } from '@/lib/sport-image';
import type { Lesson } from '@/types/api';

const typeFilters = [
  { key: '', label: '전체' },
  { key: 'group_lesson', label: '그룹 레슨' },
  { key: 'practice_match', label: '연습 경기' },
  { key: 'free_practice', label: '자유 연습' },
];

const LessonCard = React.memo(function LessonCard({ lesson }: { lesson: Lesson }) {
  return (
    <Link href={`/lessons/${lesson.id}`}>
      <div className="rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden flex hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-[0.98] transition-colors">
        {/* 이미지 */}
        <div className="w-28 shrink-0 bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <img src={getSportImage(lesson.sportType, lesson.imageUrl)} alt={lesson.title} className="w-full h-full object-cover" loading="lazy" />
        </div>
        {/* 텍스트 */}
        <div className="flex-1 bg-white dark:bg-gray-800 p-4 min-w-0 flex flex-col justify-center">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{lesson.title}</h3>
            <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{typeLabel[lesson.type] || lesson.type}</span>
          </div>
          <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
            <span className={`${sportCardAccent[lesson.sportType]?.badge || 'bg-gray-100 text-gray-500'} rounded-full px-2 py-0.5 text-xs font-medium`}>
              {sportLabel[lesson.sportType]}
            </span>
            {lesson.coachName && ` · 코치 ${lesson.coachName}`}
          </p>
          <div className="flex items-center gap-2 mt-1.5 text-xs">
            <span className="text-gray-500">{formatDate(lesson.lessonDate)} {lesson.startTime}</span>
            <span className="text-gray-300 dark:text-gray-600" aria-hidden="true">·</span>
            <span className="text-gray-700 dark:text-gray-300 font-medium">{lesson.currentParticipants}/{lesson.maxParticipants}명</span>
            <span className="text-gray-300 dark:text-gray-600" aria-hidden="true">·</span>
            <span className="text-gray-500">{formatCurrency(lesson.fee)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
});

export default function LessonsPage() {
  const [activeType, setActiveType] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const { toast } = useToast();
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
      <header className="px-5 @3xl:px-0 pt-4 pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">강좌</h1>
          <p className="text-sm text-gray-500 mt-0.5">레슨, 연습경기, 자유연습을 찾아보세요</p>
        </div>
        <Link href="/lessons/new"
          className="flex items-center gap-1.5 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-600 active:bg-blue-700 transition-colors">
          <Plus size={14} strokeWidth={2.5} />
          강좌 등록
        </Link>
      </header>

      {/* 검색 */}
      <div className="px-5 @3xl:px-0 mb-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
          <input type="text" placeholder="강좌명, 코치, 장소 검색" value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl bg-gray-50 dark:bg-gray-800 py-3 pl-10 pr-4 text-base text-gray-900 dark:text-gray-100 placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white dark:focus:bg-gray-900 transition-colors" />
        </div>
      </div>

      {/* 필터 칩 */}
      <div className="px-5 @3xl:px-0 mb-4 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {typeFilters.map((f) => (
          <button key={f.key} onClick={() => setActiveType(f.key)}
            className={`shrink-0 min-h-[44px] rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              activeType === f.key
                ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                : 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* 리스트 */}
      <div className="px-5 @3xl:px-0">
        {isLoading ? (
          <div className="flex flex-col gap-3 @3xl:grid @3xl:grid-cols-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-[92px] rounded-xl bg-gray-50 dark:bg-gray-800 skeleton-shimmer" />
            ))}
          </div>
        ) : error ? (
          <ErrorState onRetry={() => refetch()} />
        ) : lessons.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="아직 강좌가 없어요"
            description="곧 다양한 강좌가 올라올 거예요!"
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
