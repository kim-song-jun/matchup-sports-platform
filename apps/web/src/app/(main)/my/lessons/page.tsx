'use client';

import Link from 'next/link';
import { Calendar, Clock, MapPin, Users, ListChecks, GraduationCap } from 'lucide-react';
import { MobileGlassHeader } from '@/components/layout/mobile-glass-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { useLessons, useMe } from '@/hooks/use-api';
import { sportLabel } from '@/lib/constants';
import { formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';

function getDayLabel(dateStr: string) {
  return ['일','월','화','수','목','금','토'][new Date(dateStr).getDay()];
}

function daysUntil(dateStr: string) {
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return '오늘';
  if (diff === 1) return '내일';
  if (diff < 0) return '지남';
  return `${diff}일 후`;
}

export default function MyLessonsPage() {
  useRequireAuth();
  const { user, isAuthenticated } = useAuthStore();
  const {
    data: me,
    isLoading: isMeLoading,
    isError: isMeError,
    refetch: refetchMe,
  } = useMe();
  const {
    data: apiData,
    isLoading,
    isError,
    refetch,
  } = useLessons();
  const ownerId = user?.id || me?.id || null;
  const isOwnerPending = isAuthenticated && !ownerId && isMeLoading;
  const isOwnerUnavailable = isAuthenticated && !ownerId && isMeError;
  const apiLessons = apiData?.items
    ?.filter((lesson) => ownerId ? lesson.hostId === ownerId && lesson.status === 'open' : false)
    .map((l) => ({
    id: l.id,
    title: l.title,
    sportType: l.sportType,
    schedule: `${l.lessonDate} ${l.startTime}~${l.endTime}`,
    venue: l.venueName || '',
    price: l.fee,
    maxStudents: l.maxParticipants,
    currentStudents: l.currentParticipants,
    status: l.status,
    nextDate: l.lessonDate || '',
    curriculum: [] as string[],
  }));
  const lessons = apiLessons ?? [];

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      <MobileGlassHeader title="내가 등록한 강좌" showBack />
      <div className="hidden @3xl:block mb-4 px-5 @3xl:px-0 pt-4">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">내가 등록한 강좌</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">등록한 강좌를 관리하세요</p>
      </div>

      <div className="px-5 @3xl:px-0 mt-4 space-y-3 pb-8 stagger-children">
        {isLoading || isOwnerPending ? (
          Array.from({ length: 2 }).map((_, index) => (
            <div
              key={`my-lesson-skeleton-${index}`}
              className="overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="animate-pulse space-y-3">
                <div className="flex items-center justify-between">
                  <div className="h-5 w-28 rounded-full bg-gray-100 dark:bg-gray-700" />
                  <div className="h-5 w-16 rounded-full bg-gray-100 dark:bg-gray-700" />
                </div>
                <div className="h-7 w-4/5 rounded-xl bg-gray-100 dark:bg-gray-700" />
                <div className="space-y-2">
                  <div className="h-4 w-2/3 rounded-lg bg-gray-100 dark:bg-gray-700" />
                  <div className="h-4 w-1/2 rounded-lg bg-gray-100 dark:bg-gray-700" />
                  <div className="h-10 w-full rounded-xl bg-gray-100 dark:bg-gray-700" />
                </div>
              </div>
            </div>
          ))
        ) : isError ? (
          <ErrorState
            message="등록한 강좌를 불러오지 못했어요"
            onRetry={() => { void refetch(); }}
          />
        ) : isOwnerUnavailable ? (
          <ErrorState
            message="내 강좌 소유 정보를 확인하지 못했어요"
            onRetry={() => {
              void refetchMe();
              void refetch();
            }}
          />
        ) : lessons.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="공개 중인 내 강좌가 없어요"
            description="강좌를 만들었더라도 아직 공개되지 않았거나 모집이 종료됐을 수 있어요"
          />
        ) : lessons.map((lesson) => {
          const fillPercent = Math.round((lesson.currentStudents / lesson.maxStudents) * 100);
          const isFull = lesson.currentStudents >= lesson.maxStudents;
          const statusConfig =
            lesson.status === 'open'
              ? { label: '공개중', className: 'bg-blue-50 dark:bg-blue-900/30 text-blue-500' }
              : lesson.status === 'cancelled'
                ? { label: '취소됨', className: 'bg-red-50 dark:bg-red-900/30 text-red-500' }
                : lesson.status === 'completed'
                  ? { label: '완료', className: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300' }
                  : { label: '마감', className: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300' };
          return (
            <div key={lesson.id} className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 overflow-hidden hover:border-gray-200 transition-colors">
              {/* Card header */}
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-gray-100 dark:bg-gray-700 px-2.5 py-1 text-xs font-semibold text-gray-500">
                      {sportLabel[lesson.sportType]}
                    </span>
                    <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${statusConfig.className}`}>
                      {statusConfig.label}
                    </span>
                  </div>
                  <span className="text-md font-bold text-gray-900 dark:text-white">{formatCurrency(lesson.price)}</span>
                </div>

                <Link href={`/lessons/${lesson.id}`}>
                  <h3 className="text-sm font-semibold text-gray-900 transition-colors hover:text-blue-500 truncate dark:text-white">{lesson.title}</h3>
                </Link>

                {/* Info rows */}
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                    <Calendar size={12} className="shrink-0" /><span>{lesson.schedule}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                    <MapPin size={12} className="shrink-0" /><span>{lesson.venue}</span>
                  </div>
                </div>

                {/* Next lesson date */}
                {lesson.status === 'open' && lesson.nextDate && (
                  <div className="mt-3 flex items-center gap-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 px-3 py-2">
                    <Clock size={14} className="text-blue-400" />
                    <span className="text-sm text-blue-600 font-medium">다음 수업</span>
                    <span className="text-sm text-blue-700 font-semibold ml-auto">
                      {lesson.nextDate} ({getDayLabel(lesson.nextDate)})
                    </span>
                    <span className="text-xs text-blue-400">{daysUntil(lesson.nextDate)}</span>
                  </div>
                )}

                {/* Progress bar */}
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                      <Users size={12} />
                      <span>수강생</span>
                    </div>
                    <span className={`text-sm font-semibold ${isFull ? 'text-red-500' : 'text-gray-700 dark:text-gray-200'}`}>
                      {lesson.currentStudents}/{lesson.maxStudents}명
                      {isFull && <span className="ml-1 text-xs text-red-400">마감</span>}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-[width,colors] ${isFull ? 'bg-red-400' : 'bg-blue-400'}`}
                      style={{ width: `${fillPercent}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Curriculum section */}
              {lesson.curriculum && lesson.curriculum.length > 0 && (
                <div className="border-t border-gray-50 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50 px-5 py-3.5">
                  <div className="flex items-center gap-1.5 mb-2">
                    <ListChecks size={12} className="text-gray-500" />
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">커리큘럼 요약</span>
                  </div>
                  <ul className="space-y-1.5">
                    {lesson.curriculum.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                        <span className="shrink-0 mt-0.5 w-[18px] h-[18px] rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-500 flex items-center justify-center text-2xs font-bold">
                          {idx + 1}
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="border-t border-gray-50 dark:border-gray-800 px-5 py-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  상세 페이지에서 공개 정보만 확인할 수 있어요.
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="h-24" />
    </div>
  );
}
