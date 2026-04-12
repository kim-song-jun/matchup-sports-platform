'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ChevronRight, Calendar, MapPin, Users, CreditCard, User, GraduationCap, AlertCircle, CheckCircle, Ticket } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { Select } from '@/components/ui/select';
import { SportIconMap } from '@/components/icons/sport-icons';
import { useLesson } from '@/hooks/use-api';
import type { LessonParticipant } from '@/types/api';
import { sportLabel, levelLabel, ticketTypeLabel } from '@/lib/constants';
import { formatFullDate, formatCurrency, formatDateCompact } from '@/lib/utils';
import type { TicketType, TicketStatus } from '@/types/api';

// ── Ticket mock data scoped to this lesson ───────────────────────────────────

interface MockLessonTicket {
  id: string;
  ticketType: TicketType;
  buyerName: string;
  status: TicketStatus;
  usedSessions: number;
  totalSessions: number | null;
  purchasedAt: string;
}

const LESSON_MOCK_TICKETS: MockLessonTicket[] = [
  { id: 'lt-001', ticketType: 'multi',     buyerName: '김민준', status: 'active',    usedSessions: 4, totalSessions: 10, purchasedAt: '2026-03-01' },
  { id: 'lt-002', ticketType: 'single',    buyerName: '이서연', status: 'exhausted', usedSessions: 1, totalSessions: 1,  purchasedAt: '2026-03-05' },
  { id: 'lt-003', ticketType: 'unlimited', buyerName: '박지호', status: 'active',    usedSessions: 7, totalSessions: null, purchasedAt: '2026-03-10' },
  { id: 'lt-004', ticketType: 'multi',     buyerName: '최수아', status: 'expired',   usedSessions: 6, totalSessions: 10, purchasedAt: '2026-01-15' },
];

const lessonTicketStatusLabel: Record<TicketStatus, string> = {
  active: '활성', expired: '만료', exhausted: '소진', refunded: '환불', cancelled: '취소',
};
const lessonTicketStatusColor: Record<TicketStatus, string> = {
  active:    'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
  expired:   'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  exhausted: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  refunded:  'bg-rose-50 text-rose-500 dark:bg-rose-900/30 dark:text-rose-400',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
};
const lessonTicketTypeColor: Record<TicketType, string> = {
  single:    'bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400',
  multi:     'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  unlimited: 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
};

const typeLabel: Record<string, string> = {
  group_lesson: '그룹 레슨', practice_match: '연습 경기', free_practice: '자유 연습', clinic: '클리닉',
};
const typeColor: Record<string, string> = {
  group_lesson: 'bg-blue-50 text-blue-500', practice_match: 'bg-gray-100 text-gray-700',
  free_practice: 'bg-gray-100 text-gray-700', clinic: 'bg-blue-50 text-blue-500',
};
const statusLabel: Record<string, string> = { open: '진행중', closed: '마감', completed: '완료', cancelled: '취소' };
const statusColor: Record<string, string> = {
  open: 'bg-blue-50 text-blue-500', closed: 'bg-gray-100 text-gray-500',
  completed: 'bg-green-50 text-green-500', cancelled: 'bg-red-50 text-red-500',
};
const statusOptions = ['open', 'closed', 'completed', 'cancelled'];

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
      queryClient.invalidateQueries({ queryKey: ['admin', 'lessons'] });
      queryClient.invalidateQueries({ queryKey: ['lessons', lessonId] });
      toast('success', '상태가 변경되었어요');
      setStatusChanging(false);
    },
    onError: () => {
      toast('error', '상태 변경에 실패했어요. 다시 시도해주세요');
      setStatusChanging(false);
    },
  });

  if (isLoading) {
    return (
      <div className="animate-fade-in">
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-48 bg-gray-100 dark:bg-gray-800 rounded-lg" />
          <div className="h-48 bg-gray-100 dark:bg-gray-800 rounded-2xl" />
          <div className="h-32 bg-gray-100 dark:bg-gray-800 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="animate-fade-in">
        <EmptyState
          icon={GraduationCap}
          title="강좌를 찾을 수 없어요"
          description="삭제되었거나 존재하지 않는 강좌예요"
          action={{ label: '목록으로', href: '/admin/lessons' }}
        />
      </div>
    );
  }

  const SportIcon = SportIconMap[lesson.sportType];
  const filledPercent = (lesson.currentParticipants / lesson.maxParticipants) * 100;

  return (
    <div className="animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href="/admin/lessons" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">강좌 관리</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700 dark:text-gray-300">강좌 상세</span>
      </div>

      <div className="grid grid-cols-1 @3xl:grid-cols-[1fr_360px] gap-6">
        {/* Left column */}
        <div className="space-y-4">
          {/* Lesson info card */}
          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                {SportIcon && (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-500">
                    <SportIcon size={24} />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${typeColor[lesson.type] || 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>
                      {typeLabel[lesson.type] || lesson.type}
                    </span>
                    <span className="text-xs text-gray-400">{sportLabel[lesson.sportType]}</span>
                  </div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">{lesson.title}</h2>
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusColor[lesson.status] || 'bg-gray-100 dark:bg-gray-700'}`}>
                {statusLabel[lesson.status] || lesson.status}
              </span>
            </div>

            {lesson.description && (
              <p className="text-base text-gray-600 dark:text-gray-300 leading-relaxed mb-4">{lesson.description}</p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-gray-50 dark:bg-gray-700/50 p-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <Calendar size={16} className="text-gray-400" />
                  <span className="text-xs text-gray-400">일시</span>
                </div>
                <p className="text-md font-semibold text-gray-900 dark:text-white">{formatFullDate(lesson.lessonDate)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{lesson.startTime} ~ {lesson.endTime}</p>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-700/50 p-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <MapPin size={16} className="text-gray-400" />
                  <span className="text-xs text-gray-400">장소</span>
                </div>
                <p className="text-md font-semibold text-gray-900 dark:text-white">{lesson.venueName || '장소 미정'}</p>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-700/50 p-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <Users size={16} className="text-gray-400" />
                  <span className="text-xs text-gray-400">인원</span>
                </div>
                <p className="text-md font-semibold text-gray-900 dark:text-white">{lesson.currentParticipants}/{lesson.maxParticipants}명</p>
                <div className="mt-2 h-[3px] rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${filledPercent}%` }} />
                </div>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-700/50 p-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <CreditCard size={16} className="text-gray-400" />
                  <span className="text-xs text-gray-400">수강료</span>
                </div>
                <p className="text-md font-semibold text-gray-900 dark:text-white">{formatCurrency(lesson.fee)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{levelLabel[lesson.levelMin]}~{levelLabel[lesson.levelMax]}</p>
              </div>
            </div>
          </div>

          {/* Coach card */}
          {lesson.coachName && (
            <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">코치 정보</h3>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                  <User size={24} />
                </div>
                <div>
                  <p className="text-md font-semibold text-gray-900 dark:text-white">{lesson.coachName}</p>
                  {lesson.coachBio && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{lesson.coachBio}</p>}
                </div>
              </div>
            </div>
          )}

          {/* Participants */}
          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">참가자 ({lesson.currentParticipants || 0}명)</h3>
            {lesson.participants && lesson.participants.length > 0 ? (
              <div className="space-y-2">
                {lesson.participants.map((p: LessonParticipant) => (
                  <div key={p.id || p.userId} className="flex items-center justify-between rounded-xl bg-gray-50 dark:bg-gray-700/50 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900/30 text-xs font-bold text-blue-500">
                        {p.user?.nickname?.charAt(0) || p.nickname?.charAt(0) || '?'}
                      </div>
                      <div>
                        <p className="text-base font-medium text-gray-900 dark:text-white">{p.user?.nickname || p.nickname || '알 수 없음'}</p>
                        <p className="text-xs text-gray-400">{p.joinedAt ? new Date(p.joinedAt).toLocaleDateString('ko-KR') : ''}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Users}
                title="아직 참가자가 없어요"
                description="수강 신청이 들어오면 여기에 표시돼요"
                size="sm"
              />
            )}
          </div>

          {/* Issued tickets */}
          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Ticket size={18} className="text-gray-400" aria-hidden="true" />
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">발급 수강권</h3>
              <span className="ml-auto rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-semibold text-gray-500 dark:text-gray-400">
                {LESSON_MOCK_TICKETS.length}건
              </span>
            </div>

            {LESSON_MOCK_TICKETS.length > 0 ? (
              <div className="overflow-x-auto -mx-5 px-5">
                <table className="w-full min-w-[480px] text-left">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-700">
                      <th className="pb-2.5 pr-4 text-xs font-medium text-gray-400 uppercase">구매자</th>
                      <th className="pb-2.5 pr-4 text-xs font-medium text-gray-400 uppercase">유형</th>
                      <th className="pb-2.5 pr-4 text-xs font-medium text-gray-400 uppercase">상태</th>
                      <th className="pb-2.5 pr-4 text-xs font-medium text-gray-400 uppercase">사용현황</th>
                      <th className="pb-2.5 text-xs font-medium text-gray-400 uppercase">구매일</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                    {LESSON_MOCK_TICKETS.map((t) => (
                      <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        {/* Buyer */}
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-bold text-gray-500 dark:text-gray-400">
                              {t.buyerName.charAt(0)}
                            </div>
                            <span className="text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">{t.buyerName}</span>
                          </div>
                        </td>

                        {/* Type */}
                        <td className="py-3 pr-4">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${lessonTicketTypeColor[t.ticketType]}`}>
                            {ticketTypeLabel[t.ticketType]}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3 pr-4">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${lessonTicketStatusColor[t.status]}`}>
                            {lessonTicketStatusLabel[t.status]}
                          </span>
                        </td>

                        {/* Usage */}
                        <td className="py-3 pr-4">
                          <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                            {t.totalSessions === null
                              ? `${t.usedSessions}회 사용`
                              : `${t.usedSessions} / ${t.totalSessions}회`}
                          </p>
                          {t.totalSessions !== null && (
                            <div className="mt-1 h-[3px] w-16 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-blue-500"
                                style={{ width: `${Math.min(100, (t.usedSessions / t.totalSessions) * 100)}%` }}
                              />
                            </div>
                          )}
                        </td>

                        {/* Purchased at */}
                        <td className="py-3 text-sm text-gray-400 whitespace-nowrap">
                          {formatDateCompact(t.purchasedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={Ticket}
                title="발급된 수강권이 없어요"
                description="수강권이 구매되면 여기에 표시돼요"
                size="sm"
              />
            )}
          </div>
        </div>

        {/* Right column - Admin controls */}
        <div className="space-y-4">
          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 sticky top-6">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">관리</h3>

            {/* Status change */}
            <div className="mb-4">
              <label htmlFor="admin-lesson-status" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">상태 변경</label>
              <Select
                id="admin-lesson-status"
                value={lesson.status}
                onChange={(e) => statusMutation.mutate(e.target.value)}
                disabled={statusChanging}
              >
                {statusOptions.map((s) => (
                  <option key={s} value={s}>{statusLabel[s]}</option>
                ))}
              </Select>
              {statusMutation.isSuccess && (
                <p className="flex items-center gap-1 text-xs text-green-500 mt-1.5">
                  <CheckCircle size={12} className="text-green-500" />
                  상태가 변경되었어요
                </p>
              )}
              {statusMutation.isError && (
                <p className="flex items-center gap-1 text-xs text-red-500 mt-1.5">
                  <AlertCircle size={12} />
                  상태 변경에 실패했어요. 다시 시도해주세요
                </p>
              )}
            </div>

            {/* Lesson summary */}
            <div className="space-y-3 border-t border-gray-100 dark:border-gray-700 pt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">강좌 ID</span>
                <span className="text-gray-700 dark:text-gray-300 font-mono text-xs">{lesson.id?.slice(0, 12)}...</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">등록일</span>
                <span className="text-gray-700 dark:text-gray-300">{lesson.createdAt ? new Date(lesson.createdAt).toLocaleDateString('ko-KR') : '-'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">총 수입</span>
                <span className="text-gray-900 dark:text-white font-semibold">{formatCurrency((lesson.currentParticipants || 0) * (lesson.fee || 0))}</span>
              </div>
              {lesson.host && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">등록자</span>
                  <span className="text-gray-700 dark:text-gray-300">{lesson.host.nickname}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
