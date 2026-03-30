'use client';

import { useState, useEffect } from 'react';
import type { ComponentType } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, Clock, MapPin, Users, Pencil, Trash2, AlertTriangle, BookOpen, Star, Info, ListChecks, GraduationCap, Plus } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import { useLessons } from '@/hooks/use-api';
import { sportLabel } from '@/lib/constants';
import { formatCurrency } from '@/lib/utils';

const surfaceCard =
  'rounded-[28px] border border-slate-200/70 bg-white/90 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-black/20';

const softCard =
  'rounded-[24px] border border-slate-200/60 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/78 dark:shadow-black/10';

const mockMyLessons = [
  {
    id: 'lesson-1',
    title: '초보자를 위한 풋살 기초 클래스',
    sportType: 'futsal',
    schedule: '매주 토요일 10:00~12:00',
    venue: '강남 풋살파크',
    price: 30000,
    maxStudents: 8,
    currentStudents: 5,
    status: 'active',
    rating: 4.8,
    reviewCount: 12,
    nextDate: '2026-03-28',
    curriculum: [
      '기본 패스 & 트래핑 자세 교정',
      '2:1 / 3:2 미니 게임 전술 훈련',
      '경기 영상 분석 & 피드백',
    ],
  },
  {
    id: 'lesson-2',
    title: '농구 슈팅 마스터 클래스',
    sportType: 'basketball',
    schedule: '매주 수요일 19:00~21:00',
    venue: '잠실 실내체육관',
    price: 25000,
    maxStudents: 6,
    currentStudents: 6,
    status: 'active',
    rating: 4.6,
    reviewCount: 8,
    nextDate: '2026-04-01',
    curriculum: [
      '레이업 & 미드레인지 슈팅 폼 교정',
      '3점슛 릴리즈 포인트 훈련',
      '실전 픽앤롤 상황 슈팅 드릴',
    ],
  },
];

function getDayLabel(dateStr: string) {
  return ['일', '월', '화', '수', '목', '금', '토'][new Date(dateStr).getDay()];
}

function daysUntil(dateStr: string) {
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return '오늘';
  if (diff === 1) return '내일';
  if (diff < 0) return '지남';
  return `${diff}일 후`;
}

export default function MyLessonsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { isAuthenticated } = useAuthStore();
  const { data: apiData } = useLessons();
  const usingMock = !apiData?.items;
  const apiLessons = apiData?.items?.map((lesson) => ({
    id: lesson.id,
    title: lesson.title,
    sportType: lesson.sportType,
    schedule: `${lesson.lessonDate} ${lesson.startTime}~${lesson.endTime}`,
    venue: lesson.venueName || '',
    price: lesson.fee,
    maxStudents: lesson.maxParticipants,
    currentStudents: lesson.currentParticipants,
    status: lesson.status === 'active' ? 'active' : lesson.status,
    rating: 0,
    reviewCount: 0,
    nextDate: lesson.lessonDate || '',
    curriculum: [] as string[],
  }));
  const [localLessons, setLocalLessons] = useState(mockMyLessons);
  const lessons = apiLessons ?? (process.env.NODE_ENV === 'development' ? localLessons : []);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!deleteTarget) return;

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDeleteTarget(null);
    };

    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [deleteTarget]);

  if (!isAuthenticated) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <EmptyState
          icon={GraduationCap}
          title="로그인 후 등록 강좌를 관리할 수 있어요"
          description="개설한 강좌의 일정, 수강생, 가격 흐름을 이 화면에서 확인합니다."
          action={{ label: '로그인', href: '/login' }}
        />
      </div>
    );
  }

  const handleDelete = async (id: string) => {
    try {
      await api.patch(`/lessons/${id}`, { status: 'cancelled' });
      setLocalLessons((previous) => previous.map((lesson) => (lesson.id === id ? { ...lesson, status: 'cancelled' } : lesson)));
      toast('success', '강좌가 취소되었어요');
    } catch {
      toast('error', '취소하지 못했어요. 다시 시도해주세요');
    }

    setDeleteTarget(null);
  };

  const averageRating = lessons.length
    ? (lessons.reduce((sum, lesson) => sum + lesson.rating, 0) / lessons.length).toFixed(1)
    : '0.0';

  const summary = [
    { label: '운영 강좌', value: `${lessons.length}개` },
    { label: '활성 강좌', value: `${lessons.filter((lesson) => lesson.status === 'active').length}개` },
    { label: '평균 평점', value: averageRating },
  ];

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
      <section className="px-5 @3xl:px-0 pt-4">
        <div className={`${surfaceCard} overflow-hidden p-6 sm:p-7`}>
          <div className="flex flex-col gap-5 @3xl:flex-row @3xl:items-end @3xl:justify-between">
            <div className="max-w-2xl">
              <div className="eyebrow-chip">
                <GraduationCap size={14} />
                MatchUp Lesson Management
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                강좌 운영 정보도 과하지 않게 정리합니다.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
                다음 수업 일정, 현재 수강생, 커리큘럼 요약과 편집 액션을 하나의 관리 화면으로 묶었습니다.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => router.back()}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-slate-200/70 bg-white/70 px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-white dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                <ArrowLeft size={14} />
                이전 화면
              </button>
              <Link
                href="/lessons/new"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-950/20 dark:bg-white dark:text-slate-950"
              >
                <Plus size={14} />
                강좌 열기
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {summary.map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{item.label}</p>
                <p className="mt-2 text-2xl font-black tracking-tight text-slate-950 dark:text-white">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {usingMock && (
        <section className="px-5 @3xl:px-0 mt-4">
          <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/30 dark:bg-amber-400/10 dark:text-amber-200">
            <div className="flex items-center gap-2">
              <Info size={15} className="shrink-0" />
              API 연동 전 샘플 데이터가 표시되고 있습니다.
            </div>
          </div>
        </section>
      )}

      <section className="px-5 @3xl:px-0 mt-4 pb-8">
        {lessons.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="등록한 강좌가 없어요"
            description="가르칠 준비가 되셨다면 첫 강좌를 열어보세요."
            action={{ label: '강좌 열기', href: '/lessons/new' }}
          />
        ) : (
          <div className="space-y-4 stagger-children">
            {lessons.map((lesson) => {
              const fillPercent = lesson.maxStudents ? Math.round((lesson.currentStudents / lesson.maxStudents) * 100) : 0;
              const isFull = lesson.currentStudents >= lesson.maxStudents;
              const statusText =
                lesson.status === 'active' ? '진행중' : lesson.status === 'cancelled' ? '취소됨' : '마감';

              return (
                <div key={lesson.id} className={`${softCard} overflow-hidden`}>
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {sportLabel[lesson.sportType]}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            lesson.status === 'active'
                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-200'
                              : lesson.status === 'cancelled'
                                ? 'bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-200'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {statusText}
                        </span>
                      </div>
                      <span className="text-sm font-bold text-slate-950 dark:text-white">{formatCurrency(lesson.price)}</span>
                    </div>

                    <Link href={`/lessons/${lesson.id}`}>
                      <h3 className="mt-3 text-lg font-bold text-slate-950 transition-colors hover:text-blue-600 dark:text-white dark:hover:text-blue-300">
                        {lesson.title}
                      </h3>
                    </Link>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      <LessonInfo icon={Calendar} label="일정" value={lesson.schedule} />
                      <LessonInfo icon={MapPin} label="장소" value={lesson.venue} />
                      <LessonInfo icon={Users} label="수강생" value={`${lesson.currentStudents}/${lesson.maxStudents}명`} />
                      <LessonInfo icon={Star} label="평점" value={`${lesson.rating} (${lesson.reviewCount})`} />
                    </div>

                    {lesson.status === 'active' && lesson.nextDate && (
                      <div className="mt-4 rounded-[20px] bg-blue-50 px-4 py-3 dark:bg-blue-400/10">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-semibold text-blue-700 dark:text-blue-200">다음 수업</span>
                          <span className="text-blue-600 dark:text-blue-300">
                            {lesson.nextDate} ({getDayLabel(lesson.nextDate)})
                          </span>
                          <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-slate-950/50 dark:text-blue-200">
                            {daysUntil(lesson.nextDate)}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="mt-4">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="text-sm text-slate-500 dark:text-slate-400">모집 현황</span>
                        <span className={`text-sm font-semibold ${isFull ? 'text-rose-600 dark:text-rose-300' : 'text-slate-700 dark:text-slate-200'}`}>
                          {fillPercent}% {isFull ? '마감' : '진행중'}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className={`h-full rounded-full ${isFull ? 'bg-rose-400' : 'bg-blue-500'}`}
                          style={{ width: `${fillPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {lesson.curriculum.length > 0 && (
                    <div className="border-t border-slate-200/70 bg-slate-50/80 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/70">
                      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                        <ListChecks size={12} />
                        커리큘럼 요약
                      </div>
                      <ul className="space-y-2">
                        {lesson.curriculum.map((item, index) => (
                          <li key={item} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-semibold text-blue-700 dark:bg-blue-400/10 dark:text-blue-200">
                              {index + 1}
                            </span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {lesson.status === 'active' && (
                    <div className="border-t border-slate-200/70 px-5 py-4 dark:border-slate-800">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/lessons/${lesson.id}/edit`}
                          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full border border-slate-200/70 bg-white/70 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-white dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-900"
                        >
                          <Pencil size={14} />
                          수정
                        </Link>
                        <Link
                          href={`/lessons/${lesson.id}`}
                          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-400/10 dark:text-blue-200 dark:hover:bg-blue-400/15"
                        >
                          <BookOpen size={14} />
                          수강생 목록
                        </Link>
                        <button
                          onClick={() => setDeleteTarget(lesson.id)}
                          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-100 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-300 dark:hover:bg-rose-950/30"
                        >
                          <Trash2 size={14} />
                          취소
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5">
          <div className="w-full max-w-sm rounded-[28px] bg-white p-6 shadow-xl dark:bg-slate-950">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 dark:bg-rose-400/10">
              <AlertTriangle size={24} className="text-rose-500" />
            </div>
            <h3 className="text-center text-lg font-bold text-slate-950 dark:text-white">강좌를 취소하시겠어요?</h3>
            <p className="mt-2 text-center text-sm leading-6 text-slate-500 dark:text-slate-400">
              취소하면 수강생들에게 알림이 발송되며, 이후 일정은 복구되지 않습니다.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-full bg-slate-100 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                돌아가기
              </button>
              <button
                onClick={() => handleDelete(deleteTarget)}
                className="flex-1 rounded-full bg-rose-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-rose-600"
              >
                취소하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LessonInfo({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[20px] border border-slate-200/70 bg-slate-50/80 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/70">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
        <Icon size={12} />
        {label}
      </div>
      <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">{value}</p>
    </div>
  );
}
