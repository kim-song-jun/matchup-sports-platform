'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, Clock, MapPin, Users, Pencil, Trash2, AlertTriangle, BookOpen, Star, Info, ChevronRight, ListChecks, GraduationCap } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import { useLessons } from '@/hooks/use-api';
import { sportLabel } from '@/lib/constants';
import { formatCurrency } from '@/lib/utils';

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
  const router = useRouter();
  const { toast } = useToast();
  const { isAuthenticated } = useAuthStore();
  const { data: apiData } = useLessons();
  const usingMock = !apiData?.items;
  const apiLessons = apiData?.items?.map((l) => ({
    id: l.id,
    title: l.title,
    sportType: l.sportType,
    schedule: `${l.lessonDate} ${l.startTime}~${l.endTime}`,
    venue: l.venueName || '',
    price: l.fee,
    maxStudents: l.maxParticipants,
    currentStudents: l.currentParticipants,
    status: l.status === 'active' ? 'active' : l.status,
    rating: 0,
    reviewCount: 0,
    nextDate: l.lessonDate || '',
    curriculum: [] as string[],
  }));
  const [localLessons, setLocalLessons] = useState(mockMyLessons);
  const lessons = apiLessons ?? (process.env.NODE_ENV === 'development' ? localLessons : []);
  const setLessons = setLocalLessons;
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!deleteTarget) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setDeleteTarget(null); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [deleteTarget]);

  if (!isAuthenticated) {
    return (
      <div className="px-5 lg:px-0 pt-[var(--safe-area-top)] lg:pt-0 text-center py-20">
        <p className="text-md font-medium text-gray-700 dark:text-gray-200">로그인이 필요합니다</p>
        <Link href="/login" className="mt-4 inline-block rounded-xl bg-blue-500 px-6 py-2.5 text-base font-bold text-white">로그인</Link>
      </div>
    );
  }

  const handleDelete = async (id: string) => {
    try {
      await api.patch(`/lessons/${id}`, { status: 'cancelled' });
      setLessons(prev => prev.map(l => l.id === id ? { ...l, status: 'cancelled' } : l));
      toast('success', '강좌가 취소되었어요');
    } catch {
      toast('error', '취소하지 못했어요. 다시 시도해주세요');
    }
    setDeleteTarget(null);
  };

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0 animate-fade-in">
      <header className="lg:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50 dark:border-gray-800">
        <button aria-label="뒤로 가기" onClick={() => router.back()} className="rounded-xl p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-[0.98] transition-[colors,transform] min-w-[44px] min-h-[44px] flex items-center justify-center">
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">내가 등록한 강좌</h1>
      </header>
      <div className="hidden lg:block mb-6 px-5 lg:px-0 pt-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">내가 등록한 강좌</h2>
        <p className="text-base text-gray-500 dark:text-gray-400 mt-1">등록한 강좌를 관리하세요</p>
      </div>

      {usingMock && (
        <div className="mx-5 lg:mx-0 mb-3 flex items-center gap-2 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 px-4 py-2.5">
          <Info size={16} className="text-gray-500 dark:text-gray-400 shrink-0" />
          <span className="text-sm text-gray-500 dark:text-gray-400">API 연동 전 샘플 데이터가 표시되고 있습니다</span>
        </div>
      )}

      <div className="px-5 lg:px-0 space-y-4 pb-8 stagger-children">
        {lessons.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="등록한 강좌가 없어요"
            description="가르칠 준비가 되셨다면 강좌를 열어보세요"
          />
        ) : lessons.map((lesson) => {
          const fillPercent = Math.round((lesson.currentStudents / lesson.maxStudents) * 100);
          const isFull = lesson.currentStudents >= lesson.maxStudents;
          return (
            <div key={lesson.id} className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 overflow-hidden hover:border-gray-200 transition-colors">
              {/* Card header */}
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-gray-100 dark:bg-gray-700 px-2.5 py-1 text-xs font-semibold text-gray-500">
                      {sportLabel[lesson.sportType]}
                    </span>
                    <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                      lesson.status === 'active' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-500' :
                      lesson.status === 'cancelled' ? 'bg-red-50 dark:bg-red-900/30 text-red-500' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                    }`}>
                      {lesson.status === 'active' ? '진행중' : lesson.status === 'cancelled' ? '취소됨' : '마감'}
                    </span>
                  </div>
                  <span className="text-md font-bold text-gray-900 dark:text-white">{formatCurrency(lesson.price)}</span>
                </div>

                <Link href={`/lessons/${lesson.id}`}>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white hover:text-blue-500 transition-colors truncate">{lesson.title}</h3>
                </Link>

                {/* Info rows */}
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                    <Calendar size={13} className="shrink-0" /><span>{lesson.schedule}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                    <MapPin size={13} className="shrink-0" /><span>{lesson.venue}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-amber-500">
                      <Star size={13} fill="currentColor" />
                      <span className="text-sm font-semibold">{lesson.rating}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">({lesson.reviewCount})</span>
                    </div>
                  </div>
                </div>

                {/* Next lesson date */}
                {lesson.status === 'active' && lesson.nextDate && (
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
                      <Users size={13} />
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
                    <ListChecks size={13} className="text-gray-500" />
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

              {/* Action buttons */}
              {lesson.status === 'active' && (
                <div className="border-t border-gray-50 dark:border-gray-800 px-5 py-3 flex gap-2">
                  <Link
                    href={`/lessons/${lesson.id}/edit`}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-gray-50 dark:bg-gray-800/50 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <Pencil size={14} />
                    수정
                  </Link>
                  <Link
                    href={`/lessons/${lesson.id}`}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-blue-50 dark:bg-blue-900/30 py-2.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                  >
                    <BookOpen size={14} />
                    수강생목록
                  </Link>
                  <button
                    onClick={() => setDeleteTarget(lesson.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-red-50 dark:bg-red-900/30 py-2.5 text-sm font-semibold text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
                  >
                    <Trash2 size={14} />
                    취소
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5" onClick={() => setDeleteTarget(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="delete-lesson-modal-title" className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-800 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/30 mx-auto mb-4">
              <AlertTriangle size={24} className="text-red-500" />
            </div>
            <h3 id="delete-lesson-modal-title" className="text-lg font-bold text-gray-900 dark:text-white text-center">강좌를 취소하시겠어요?</h3>
            <p className="text-base text-gray-500 dark:text-gray-400 text-center mt-2">취소하면 수강생들에게 알림이 발송돼요.</p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 rounded-xl bg-gray-100 dark:bg-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 transition-colors">돌아가기</button>
              <button onClick={() => handleDelete(deleteTarget)} className="flex-1 rounded-xl bg-red-500 py-3 text-base font-semibold text-white hover:bg-red-600 transition-colors">취소하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
