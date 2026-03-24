'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ChevronRight, Calendar, MapPin, Users, CreditCard, User, GraduationCap, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { SportIconMap } from '@/components/icons/sport-icons';
import { useLesson } from '@/hooks/use-api';
import type { LessonParticipant } from '@/types/api';

const sportLabel: Record<string, string> = {
  futsal: '풋살', basketball: '농구', badminton: '배드민턴',
  ice_hockey: '아이스하키', figure_skating: '피겨', short_track: '쇼트트랙',
};
const typeLabel: Record<string, string> = {
  group_lesson: '그룹 레슨', practice_match: '연습 경기', free_practice: '자유 연습', clinic: '클리닉',
};
const typeColor: Record<string, string> = {
  group_lesson: 'bg-blue-50 text-blue-500', practice_match: 'bg-gray-100 text-gray-700',
  free_practice: 'bg-gray-100 text-gray-700', clinic: 'bg-blue-50 text-blue-500',
};
const levelLabel: Record<number, string> = { 1: '입문', 2: '초급', 3: '중급', 4: '상급', 5: '고수' };

const statusLabel: Record<string, string> = { open: '진행중', closed: '마감', completed: '완료', cancelled: '취소' };
const statusColor: Record<string, string> = {
  open: 'bg-blue-50 text-blue-500', closed: 'bg-gray-100 text-gray-500',
  completed: 'bg-green-50 text-green-500', cancelled: 'bg-red-50 text-red-500',
};
const statusOptions = ['open', 'closed', 'completed', 'cancelled'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${weekdays[d.getDay()]})`;
}
function formatCurrency(n: number) { return n === 0 ? '무료' : new Intl.NumberFormat('ko-KR').format(n) + '원'; }

export default function AdminLessonDetailPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const lessonId = params.id as string;
  const { toast } = useToast();
  const [statusChanging, setStatusChanging] = useState(false);

  const { data: lesson, isLoading } = useLesson(lessonId);

  const statusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      setStatusChanging(true);
      await api.patch(`/admin/lessons/${lessonId}/status`, { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'lesson', lessonId] });
      toast('success', '상태가 변경되었습니다');
      setStatusChanging(false);
    },
    onError: () => {
      toast('error', '실패했어요. 다시 시도해주세요');
      setStatusChanging(false);
    },
  });

  if (isLoading) {
    return (
      <div className="animate-fade-in">
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-48 bg-gray-100 rounded-lg" />
          <div className="h-48 bg-gray-100 rounded-2xl" />
          <div className="h-32 bg-gray-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="animate-fade-in text-center py-20">
        <GraduationCap size={32} className="mx-auto text-gray-300 mb-3" />
        <p className="text-[15px] text-gray-500">강좌를 찾을 수 없습니다</p>
        <Link href="/admin/lessons" className="text-blue-500 text-[13px] mt-2 inline-block">목록으로</Link>
      </div>
    );
  }

  const SportIcon = SportIconMap[lesson.sportType];
  const filledPercent = (lesson.currentParticipants / lesson.maxParticipants) * 100;

  return (
    <div className="animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[13px] text-gray-400 mb-6">
        <Link href="/admin/lessons" className="hover:text-gray-600 transition-colors">강좌 관리</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700">강좌 상세</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* Left column */}
        <div className="space-y-4">
          {/* Lesson info card */}
          <div className="rounded-2xl bg-white border border-gray-100 p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                {SportIcon && (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
                    <SportIcon size={24} />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${typeColor[lesson.type] || 'bg-gray-100 text-gray-500'}`}>
                      {typeLabel[lesson.type] || lesson.type}
                    </span>
                    <span className="text-[12px] text-gray-400">{sportLabel[lesson.sportType]}</span>
                  </div>
                  <h2 className="text-[20px] font-bold text-gray-900">{lesson.title}</h2>
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold ${statusColor[lesson.status] || 'bg-gray-100'}`}>
                {statusLabel[lesson.status] || lesson.status}
              </span>
            </div>

            {lesson.description && (
              <p className="text-[14px] text-gray-600 leading-relaxed mb-4">{lesson.description}</p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-gray-50 p-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <Calendar size={16} className="text-gray-400" />
                  <span className="text-[12px] text-gray-400">일시</span>
                </div>
                <p className="text-[15px] font-semibold text-gray-900">{formatDate(lesson.lessonDate)}</p>
                <p className="text-[12px] text-gray-400 mt-0.5">{lesson.startTime} ~ {lesson.endTime}</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <MapPin size={16} className="text-gray-400" />
                  <span className="text-[12px] text-gray-400">장소</span>
                </div>
                <p className="text-[15px] font-semibold text-gray-900">{lesson.venueName || '장소 미정'}</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <Users size={16} className="text-gray-400" />
                  <span className="text-[12px] text-gray-400">인원</span>
                </div>
                <p className="text-[15px] font-semibold text-gray-900">{lesson.currentParticipants}/{lesson.maxParticipants}명</p>
                <div className="mt-2 h-[3px] rounded-full bg-gray-200 overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${filledPercent}%` }} />
                </div>
              </div>
              <div className="rounded-xl bg-gray-50 p-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <CreditCard size={16} className="text-gray-400" />
                  <span className="text-[12px] text-gray-400">수강료</span>
                </div>
                <p className="text-[15px] font-semibold text-gray-900">{formatCurrency(lesson.fee)}</p>
                <p className="text-[12px] text-gray-400 mt-0.5">{levelLabel[lesson.levelMin]}~{levelLabel[lesson.levelMax]}</p>
              </div>
            </div>
          </div>

          {/* Coach card */}
          {lesson.coachName && (
            <div className="rounded-2xl bg-white border border-gray-100 p-5">
              <h3 className="text-[14px] font-semibold text-gray-900 mb-3">코치 정보</h3>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                  <User size={22} />
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-gray-900">{lesson.coachName}</p>
                  {lesson.coachBio && <p className="text-[13px] text-gray-500 mt-0.5">{lesson.coachBio}</p>}
                </div>
              </div>
            </div>
          )}

          {/* Participants */}
          <div className="rounded-2xl bg-white border border-gray-100 p-5">
            <h3 className="text-[14px] font-semibold text-gray-900 mb-3">참가자 ({lesson.currentParticipants || 0}명)</h3>
            {lesson.participants && lesson.participants.length > 0 ? (
              <div className="space-y-2">
                {lesson.participants.map((p: LessonParticipant) => (
                  <div key={p.id || p.userId} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-[12px] font-bold text-blue-500">
                        {p.user?.nickname?.charAt(0) || p.nickname?.charAt(0) || '?'}
                      </div>
                      <div>
                        <p className="text-[14px] font-medium text-gray-900">{p.user?.nickname || p.nickname || '알 수 없음'}</p>
                        <p className="text-[11px] text-gray-400">{p.joinedAt ? new Date(p.joinedAt).toLocaleDateString('ko-KR') : ''}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl bg-gray-50 p-8 text-center">
                <Users size={24} className="mx-auto text-gray-300 mb-2" />
                <p className="text-[13px] text-gray-400">아직 참가자가 없습니다</p>
              </div>
            )}
          </div>
        </div>

        {/* Right column - Admin controls */}
        <div className="space-y-4">
          <div className="rounded-2xl bg-white border border-gray-100 p-5 sticky top-6">
            <h3 className="text-[14px] font-semibold text-gray-900 mb-4">관리</h3>

            {/* Status change */}
            <div className="mb-4">
              <label className="block text-[12px] font-medium text-gray-500 mb-1.5">상태 변경</label>
              <select
                value={lesson.status}
                onChange={(e) => statusMutation.mutate(e.target.value)}
                disabled={statusChanging}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-[14px] text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all disabled:opacity-50"
              >
                {statusOptions.map((s) => (
                  <option key={s} value={s}>{statusLabel[s]}</option>
                ))}
              </select>
              {statusMutation.isSuccess && (
                <p className="flex items-center gap-1 text-[12px] text-green-500 mt-1.5">
                  <CheckCircle size={12} className="text-green-500" />
                  상태가 변경되었습니다
                </p>
              )}
              {statusMutation.isError && (
                <p className="flex items-center gap-1 text-[12px] text-red-500 mt-1.5">
                  <AlertCircle size={12} />
                  상태 변경에 실패했습니다
                </p>
              )}
            </div>

            {/* Lesson summary */}
            <div className="space-y-3 border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-gray-400">강좌 ID</span>
                <span className="text-gray-700 font-mono text-[12px]">{lesson.id?.slice(0, 12)}...</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-gray-400">등록일</span>
                <span className="text-gray-700">{lesson.createdAt ? new Date(lesson.createdAt).toLocaleDateString('ko-KR') : '-'}</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-gray-400">총 수입</span>
                <span className="text-gray-900 font-semibold">{formatCurrency((lesson.currentParticipants || 0) * (lesson.fee || 0))}</span>
              </div>
              {lesson.host && (
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-gray-400">등록자</span>
                  <span className="text-gray-700">{lesson.host.nickname}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
