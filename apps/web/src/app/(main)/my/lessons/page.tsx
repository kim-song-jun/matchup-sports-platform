'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, Clock, MapPin, Users, Pencil, Trash2, AlertTriangle, BookOpen, Star, Info } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import { useLessons } from '@/hooks/use-api';

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
  },
];

const sportLabel: Record<string, string> = {
  futsal: '풋살', basketball: '농구', badminton: '배드민턴', ice_hockey: '아이스하키',
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat('ko-KR').format(n) + '원';
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
  }));
  const [localLessons, setLocalLessons] = useState(mockMyLessons);
  const lessons = apiLessons ?? localLessons;
  const setLessons = setLocalLessons;
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  if (!isAuthenticated) {
    return (
      <div className="px-5 lg:px-0 pt-[var(--safe-area-top)] lg:pt-0 text-center py-20">
        <p className="text-[15px] font-medium text-gray-700">로그인이 필요합니다</p>
        <Link href="/login" className="mt-4 inline-block rounded-lg bg-blue-500 px-6 py-2.5 text-[14px] font-semibold text-white">로그인</Link>
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
      <header className="lg:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50">
        <button aria-label="뒤로 가기" onClick={() => router.back()} className="rounded-lg p-2 -ml-2 hover:bg-gray-100 active:scale-[0.98] transition-all min-w-[44px] min-h-[44px] flex items-center justify-center">
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <h1 className="text-[22px] font-bold text-gray-900">내가 등록한 강좌</h1>
      </header>
      <div className="hidden lg:block mb-6 px-5 lg:px-0 pt-4">
        <h2 className="text-[22px] font-bold text-gray-900">내가 등록한 강좌</h2>
        <p className="text-[14px] text-gray-400 mt-1">등록한 강좌를 관리하세요</p>
      </div>

      {usingMock && (
        <div className="mx-5 lg:mx-0 mb-3 flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-100 px-4 py-2.5">
          <Info size={16} className="text-amber-500 shrink-0" />
          <span className="text-[13px] text-amber-700">API 연동 전 샘플 데이터가 표시되고 있습니다</span>
        </div>
      )}

      <div className="px-5 lg:px-0 space-y-3 pb-8">
        {lessons.length === 0 ? (
          <div className="rounded-2xl bg-gray-50 p-16 text-center">
            <BookOpen size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-[15px] font-medium text-gray-600">등록한 강좌가 없어요</p>
            <p className="text-[13px] text-gray-400 mt-1">강좌를 등록해보세요</p>
          </div>
        ) : lessons.map((lesson) => (
          <div key={lesson.id} className="rounded-2xl bg-white border border-gray-100 p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-500">
                  {sportLabel[lesson.sportType]}
                </span>
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                  lesson.status === 'active' ? 'bg-green-50 text-green-600' :
                  lesson.status === 'cancelled' ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-600'
                }`}>
                  {lesson.status === 'active' ? '진행중' : lesson.status === 'cancelled' ? '취소됨' : '마감'}
                </span>
              </div>
              <span className="text-[14px] font-bold text-gray-900">{formatCurrency(lesson.price)}</span>
            </div>

            <Link href={`/lessons/${lesson.id}`}>
              <h3 className="text-[15px] font-semibold text-gray-900 hover:text-blue-500 transition-colors truncate">{lesson.title}</h3>
            </Link>

            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-1.5 text-[13px] text-gray-500">
                <Calendar size={13} /><span>{lesson.schedule}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[13px] text-gray-500">
                <MapPin size={13} /><span>{lesson.venue}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-[13px] text-gray-500">
                  <Users size={13} /><span>{lesson.currentStudents}/{lesson.maxStudents}명</span>
                </div>
                <div className="flex items-center gap-1 text-amber-500">
                  <Star size={13} fill="currentColor" />
                  <span className="text-[13px] font-semibold">{lesson.rating}</span>
                  <span className="text-[12px] text-gray-400">({lesson.reviewCount})</span>
                </div>
              </div>
            </div>

            {lesson.status === 'active' && (
              <div className="mt-3 flex gap-2">
                <Link
                  href={`/lessons/${lesson.id}/edit`}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-gray-50 py-2.5 text-[13px] font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <Pencil size={14} />
                  수정
                </Link>
                <Link
                  href={`/lessons/${lesson.id}`}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-blue-50 py-2.5 text-[13px] font-semibold text-blue-600 hover:bg-blue-100 transition-colors"
                >
                  <BookOpen size={14} />
                  수강생목록
                </Link>
                <button
                  onClick={() => setDeleteTarget(lesson.id)}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-red-50 py-2.5 text-[13px] font-semibold text-red-500 hover:bg-red-100 transition-colors"
                >
                  <Trash2 size={14} />
                  취소
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 mx-auto mb-4">
              <AlertTriangle size={24} className="text-red-500" />
            </div>
            <h3 className="text-[16px] font-bold text-gray-900 text-center">강좌를 취소하시겠어요?</h3>
            <p className="text-[14px] text-gray-500 text-center mt-2">취소하면 수강생들에게 알림이 발송돼요.</p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 rounded-xl bg-gray-100 py-3 text-[14px] font-semibold text-gray-700 hover:bg-gray-200 transition-colors">돌아가기</button>
              <button onClick={() => handleDelete(deleteTarget)} className="flex-1 rounded-xl bg-red-500 py-3 text-[14px] font-semibold text-white hover:bg-red-600 transition-colors">취소하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
