'use client';

import { useState } from 'react';
import Link from 'next/link';
import { GraduationCap, Swords, Dumbbell, Calendar, MapPin, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { SportIconMap } from '@/components/icons/sport-icons';

const typeFilters = [
  { key: '', label: '전체' },
  { key: 'group_lesson', label: '그룹 레슨', icon: GraduationCap },
  { key: 'practice_match', label: '연습 경기', icon: Swords },
  { key: 'free_practice', label: '자유 연습', icon: Dumbbell },
];

const sportLabel: Record<string, string> = {
  futsal: '풋살', basketball: '농구', badminton: '배드민턴',
  ice_hockey: '아이스하키', figure_skating: '피겨', short_track: '쇼트트랙',
};

const typeLabel: Record<string, string> = {
  group_lesson: '그룹 레슨', practice_match: '연습 경기',
  free_practice: '자유 연습', clinic: '클리닉',
};

const typeColor: Record<string, string> = {
  group_lesson: 'bg-violet-50 text-violet-500',
  practice_match: 'bg-emerald-50 text-emerald-500',
  free_practice: 'bg-amber-50 text-amber-500',
  clinic: 'bg-blue-50 text-blue-500',
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}/${d.getDate()} (${weekdays[d.getDay()]})`;
}

function formatCurrency(n: number) {
  return n === 0 ? '무료' : new Intl.NumberFormat('ko-KR').format(n) + '원';
}

export default function LessonsPage() {
  const [activeType, setActiveType] = useState('');
  const params: Record<string, string> = {};
  if (activeType) params.type = activeType;

  const { data, isLoading } = useQuery({
    queryKey: ['lessons', params],
    queryFn: async () => {
      const res = await api.get('/lessons', { params });
      return (res as any).data;
    },
  });

  const lessons = data?.items ?? [];

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0">
      <header className="px-5 lg:px-0 pt-4 pb-3">
        <h1 className="text-[22px] font-bold text-gray-900">강좌</h1>
        <p className="text-[13px] text-gray-400 mt-0.5">레슨, 연습경기, 자유연습을 찾아보세요</p>
      </header>

      {/* Type filter */}
      <div className="px-5 lg:px-0 mb-4 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {typeFilters.map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveType(f.key)}
            className={`shrink-0 flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-all ${
              activeType === f.key
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-600 border border-gray-200 active:bg-gray-50'
            }`}
          >
            {f.icon && <f.icon size={14} />}
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="px-5 lg:px-0">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-[140px] animate-pulse rounded-2xl bg-gray-50" />
            ))}
          </div>
        ) : lessons.length === 0 ? (
          <div className="rounded-2xl bg-gray-50 p-16 text-center">
            <GraduationCap size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-[15px] font-medium text-gray-600">등록된 강좌가 없어요</p>
            <p className="text-[13px] text-gray-400 mt-1">곧 다양한 강좌가 등록될 예정이에요</p>
          </div>
        ) : (
          <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
            {lessons.map((lesson: any) => {
              const SportIcon = SportIconMap[lesson.sportType];
              const filledPercent = (lesson.currentParticipants / lesson.maxParticipants) * 100;
              return (
                <Link key={lesson.id} href={`/lessons/${lesson.id}`} className="block rounded-2xl bg-white border border-gray-100 p-4 hover:shadow-[0_2px_16px_rgba(0,0,0,0.04)] transition-all">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5">
                      {SportIcon && (
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
                          <SportIcon size={20} />
                        </div>
                      )}
                      <div>
                        <h3 className="text-[15px] font-semibold text-gray-900">{lesson.title}</h3>
                        <span className="text-[12px] text-gray-400">{sportLabel[lesson.sportType]}</span>
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${typeColor[lesson.type] || 'bg-gray-100 text-gray-500'}`}>
                      {typeLabel[lesson.type]}
                    </span>
                  </div>

                  {lesson.coachName && (
                    <p className="text-[13px] text-gray-500 mb-2">코치: {lesson.coachName}</p>
                  )}

                  <div className="grid grid-cols-2 gap-y-1 text-[13px] text-gray-500">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={13} className="text-gray-300" />
                      {formatDate(lesson.lessonDate)} {lesson.startTime}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin size={13} className="text-gray-300" />
                      <span className="truncate">{lesson.venueName || '장소 미정'}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Users size={13} className="text-gray-300" />
                      {lesson.currentParticipants}/{lesson.maxParticipants}명
                    </div>
                    <div className="text-[14px] font-semibold text-gray-800">
                      {formatCurrency(lesson.fee)}
                    </div>
                  </div>

                  <div className="mt-3 h-[3px] rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full bg-violet-400 transition-all" style={{ width: `${filledPercent}%` }} />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="h-8" />
    </div>
  );
}
