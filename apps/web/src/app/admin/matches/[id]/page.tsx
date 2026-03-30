'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ArrowLeft, ChevronRight, Calendar, MapPin, Users, CreditCard, Star, Trophy, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { SportIconMap } from '@/components/icons/sport-icons';
import { useMatch } from '@/hooks/use-api';
import type { MatchParticipant } from '@/types/api';
import { sportLabel, levelLabel } from '@/lib/constants';
import { formatAmount, formatFullDate } from '@/lib/utils';

const statusLabel: Record<string, string> = {
  recruiting: '모집중', full: '마감', in_progress: '진행중', completed: '완료', cancelled: '취소',
};
const statusColor: Record<string, string> = {
  recruiting: 'bg-blue-50 text-blue-500',
  full: 'bg-gray-100 text-gray-500',
  in_progress: 'bg-blue-50 text-blue-500',
  completed: 'bg-gray-100 text-gray-500',
  cancelled: 'bg-red-50 text-red-500',
};
const statusOptions = ['recruiting', 'full', 'in_progress', 'completed', 'cancelled'];

const paymentStatusLabel: Record<string, string> = {
  completed: '결제완료', pending: '대기', refunded: '환불', failed: '실패',
};
const paymentStatusColor: Record<string, string> = {
  completed: 'bg-green-50 text-green-500',
  pending: 'bg-gray-100 text-gray-500',
  refunded: 'bg-red-50 text-red-500',
  failed: 'bg-gray-100 text-gray-400',
};

export default function AdminMatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const matchId = params.id as string;
  const { toast } = useToast();
  const [statusChanging, setStatusChanging] = useState(false);

  const { data: match, isLoading } = useMatch(matchId);

  const statusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      setStatusChanging(true);
      await api.patch(`/admin/matches/${matchId}/status`, { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'matches'] });
      queryClient.invalidateQueries({ queryKey: ['matches', matchId] });
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
          <div className="h-64 bg-gray-100 dark:bg-gray-800 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="animate-fade-in">
        <EmptyState
          icon={AlertCircle}
          title="매치를 찾을 수 없어요"
          description="삭제되었거나 존재하지 않는 매치예요"
          action={{ label: '목록으로', href: '/admin/matches' }}
        />
      </div>
    );
  }

  const SportIcon = SportIconMap[match.sportType];
  const filledPercent = (match.currentPlayers / match.maxPlayers) * 100;

  return (
    <div className="animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href="/admin/matches" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">매치 관리</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700 dark:text-gray-300">매치 상세</span>
      </div>

      <div className="grid grid-cols-1 @3xl:grid-cols-[1fr_360px] gap-6">
        {/* Left column */}
        <div className="space-y-4">
          {/* Match info card */}
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                {SportIcon && (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-500">
                    <SportIcon size={24} />
                  </div>
                )}
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">{match.title}</h2>
                  <span className="text-sm text-gray-400">{sportLabel[match.sportType]} · ID: {match.id?.slice(0, 8)}</span>
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusColor[match.status] || 'bg-gray-100 dark:bg-gray-700'}`}>
                {statusLabel[match.status] || match.status}
              </span>
            </div>

            {match.description && (
              <p className="text-base text-gray-600 dark:text-gray-300 leading-relaxed mb-4">{match.description}</p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-gray-50 dark:bg-gray-700/50 p-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <Calendar size={16} className="text-gray-400" />
                  <span className="text-xs text-gray-400">일시</span>
                </div>
                <p className="text-md font-semibold text-gray-900 dark:text-white">{formatFullDate(match.matchDate)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{match.startTime} ~ {match.endTime}</p>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-700/50 p-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <MapPin size={16} className="text-gray-400" />
                  <span className="text-xs text-gray-400">장소</span>
                </div>
                <p className="text-md font-semibold text-gray-900 dark:text-white">{match.venue?.name || '장소 미정'}</p>
                {match.venue?.address && <p className="text-xs text-gray-400 mt-0.5 truncate">{match.venue.address}</p>}
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-700/50 p-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <Users size={16} className="text-gray-400" />
                  <span className="text-xs text-gray-400">인원</span>
                </div>
                <p className="text-md font-semibold text-gray-900 dark:text-white">{match.currentPlayers}/{match.maxPlayers}명</p>
                <div className="mt-2 h-[3px] rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden">
                  <div className={`h-full rounded-full ${filledPercent >= 70 ? 'bg-red-400' : 'bg-blue-400'}`} style={{ width: `${filledPercent}%` }} />
                </div>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-700/50 p-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <CreditCard size={16} className="text-gray-400" />
                  <span className="text-xs text-gray-400">참가비</span>
                </div>
                <p className="text-md font-semibold text-gray-900 dark:text-white">{formatAmount(match.fee)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{levelLabel[match.levelMin]}~{levelLabel[match.levelMax]}</p>
              </div>
            </div>
          </div>

          {/* Host info */}
          {match.host && (
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">호스트</h3>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900/30 text-base font-bold text-blue-500">
                  {match.host.nickname?.charAt(0)}
                </div>
                <div>
                  <p className="text-base font-semibold text-gray-900 dark:text-white">{match.host.nickname}</p>
                  <div className="flex items-center gap-1 text-xs text-amber-500">
                    <Star size={12} fill="currentColor" />
                    <span>{match.host.mannerScore?.toFixed(1)}</span>
                    <span className="text-gray-300 dark:text-gray-600 mx-1">·</span>
                    <span className="text-gray-400">{match.host.totalMatches}경기</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Participants */}
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">참가자 ({match.participants?.length || 0}명)</h3>
            {match.participants && match.participants.length > 0 ? (
              <div className="space-y-2">
                {match.participants.map((p: MatchParticipant) => (
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
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      paymentStatusColor[p.paymentStatus] || 'bg-gray-100 dark:bg-gray-700 text-gray-400'
                    }`}>
                      {paymentStatusLabel[p.paymentStatus] || p.paymentStatus || '확인중'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Users}
                title="아직 참가자가 없어요"
                description="참가 신청이 들어오면 여기에 표시돼요"
                size="sm"
              />
            )}
          </div>
        </div>

        {/* Right column - Admin controls */}
        <div className="space-y-4">
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 sticky top-6">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">관리</h3>

            {/* Status change */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">상태 변경</label>
              <select
                value={match.status}
                onChange={(e) => statusMutation.mutate(e.target.value)}
                disabled={statusChanging}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-base text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-colors disabled:opacity-50"
              >
                {statusOptions.map((s) => (
                  <option key={s} value={s}>{statusLabel[s]}</option>
                ))}
              </select>
              {statusMutation.isSuccess && (
                <p className="flex items-center gap-1 text-xs text-green-500 mt-1.5">
                  <CheckCircle size={12} />
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

            {/* Match summary */}
            <div className="space-y-3 border-t border-gray-100 dark:border-gray-700 pt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">매치 ID</span>
                <span className="text-gray-700 dark:text-gray-300 font-mono text-xs">{match.id?.slice(0, 12)}...</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">생성일</span>
                <span className="text-gray-700 dark:text-gray-300">{match.createdAt ? new Date(match.createdAt).toLocaleDateString('ko-KR') : '-'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">총 수입</span>
                <span className="text-gray-900 dark:text-white font-semibold">{formatAmount((match.currentPlayers || 0) * (match.fee || 0))}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
