'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ArrowLeft, ChevronRight, Calendar, MapPin, Users, CreditCard, Star, Trophy, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import { SportIconMap } from '@/components/icons/sport-icons';

const sportLabel: Record<string, string> = {
  futsal: '풋살', basketball: '농구', badminton: '배드민턴',
  ice_hockey: '아이스하키', figure_skating: '피겨', short_track: '쇼트트랙',
};
const levelLabel: Record<number, string> = { 1: '입문', 2: '초급', 3: '중급', 4: '상급', 5: '고수' };
const statusLabel: Record<string, string> = {
  recruiting: '모집중', full: '마감', in_progress: '진행중', completed: '완료', cancelled: '취소',
};
const statusColor: Record<string, string> = {
  recruiting: 'bg-emerald-50 text-emerald-600',
  full: 'bg-amber-50 text-amber-600',
  in_progress: 'bg-blue-50 text-blue-600',
  completed: 'bg-gray-100 text-gray-500',
  cancelled: 'bg-red-50 text-red-500',
};
const statusOptions = ['recruiting', 'full', 'in_progress', 'completed', 'cancelled'];

const paymentStatusLabel: Record<string, string> = {
  completed: '결제완료', pending: '대기', refunded: '환불', failed: '실패',
};
const paymentStatusColor: Record<string, string> = {
  completed: 'bg-emerald-50 text-emerald-600',
  pending: 'bg-amber-50 text-amber-600',
  refunded: 'bg-red-50 text-red-500',
  failed: 'bg-gray-100 text-gray-400',
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${weekdays[d.getDay()]})`;
}
function formatCurrency(n: number) {
  return new Intl.NumberFormat('ko-KR').format(n) + '원';
}

export default function AdminMatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const matchId = params.id as string;
  const [statusChanging, setStatusChanging] = useState(false);

  const { data: match, isLoading } = useQuery({
    queryKey: ['admin', 'match', matchId],
    queryFn: async () => {
      const res = await api.get(`/matches/${matchId}`);
      return (res as any).data;
    },
    enabled: !!matchId,
  });

  const statusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      setStatusChanging(true);
      await api.patch(`/admin/matches/${matchId}/status`, { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'match', matchId] });
      setStatusChanging(false);
    },
    onError: () => {
      setStatusChanging(false);
    },
  });

  if (isLoading) {
    return (
      <div className="animate-fade-in">
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-48 bg-gray-100 rounded-lg" />
          <div className="h-48 bg-gray-100 rounded-2xl" />
          <div className="h-64 bg-gray-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="animate-fade-in text-center py-20">
        <AlertCircle size={32} className="mx-auto text-gray-300 mb-3" />
        <p className="text-[15px] text-gray-500">매치를 찾을 수 없습니다</p>
        <Link href="/admin/matches" className="text-blue-500 text-[13px] mt-2 inline-block">목록으로</Link>
      </div>
    );
  }

  const SportIcon = SportIconMap[match.sportType];
  const filledPercent = (match.currentPlayers / match.maxPlayers) * 100;

  return (
    <div className="animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[13px] text-gray-400 mb-6">
        <Link href="/admin/matches" className="hover:text-gray-600 transition-colors">매치 관리</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700">매치 상세</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* Left column */}
        <div className="space-y-4">
          {/* Match info card */}
          <div className="rounded-2xl bg-white border border-gray-100 p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                {SportIcon && (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
                    <SportIcon size={24} />
                  </div>
                )}
                <div>
                  <h2 className="text-[20px] font-bold text-gray-900">{match.title?.replace(/[\u{1F300}-\u{1FAFF}]/gu, '').trim()}</h2>
                  <span className="text-[13px] text-gray-400">{sportLabel[match.sportType]} · ID: {match.id?.slice(0, 8)}</span>
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold ${statusColor[match.status] || 'bg-gray-100'}`}>
                {statusLabel[match.status] || match.status}
              </span>
            </div>

            {match.description && (
              <p className="text-[14px] text-gray-600 leading-relaxed mb-4">{match.description}</p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-gray-50 p-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <Calendar size={16} className="text-gray-400" />
                  <span className="text-[12px] text-gray-400">일시</span>
                </div>
                <p className="text-[15px] font-semibold text-gray-900">{formatDate(match.matchDate)}</p>
                <p className="text-[12px] text-gray-400 mt-0.5">{match.startTime} ~ {match.endTime}</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <MapPin size={16} className="text-gray-400" />
                  <span className="text-[12px] text-gray-400">장소</span>
                </div>
                <p className="text-[15px] font-semibold text-gray-900">{match.venue?.name || '장소 미정'}</p>
                {match.venue?.address && <p className="text-[12px] text-gray-400 mt-0.5 truncate">{match.venue.address}</p>}
              </div>
              <div className="rounded-xl bg-gray-50 p-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <Users size={16} className="text-gray-400" />
                  <span className="text-[12px] text-gray-400">인원</span>
                </div>
                <p className="text-[15px] font-semibold text-gray-900">{match.currentPlayers}/{match.maxPlayers}명</p>
                <div className="mt-2 h-[3px] rounded-full bg-gray-200 overflow-hidden">
                  <div className={`h-full rounded-full ${filledPercent >= 70 ? 'bg-red-400' : 'bg-blue-400'}`} style={{ width: `${filledPercent}%` }} />
                </div>
              </div>
              <div className="rounded-xl bg-gray-50 p-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <CreditCard size={16} className="text-gray-400" />
                  <span className="text-[12px] text-gray-400">참가비</span>
                </div>
                <p className="text-[15px] font-semibold text-gray-900">{formatCurrency(match.fee)}</p>
                <p className="text-[12px] text-gray-400 mt-0.5">{levelLabel[match.levelMin]}~{levelLabel[match.levelMax]}</p>
              </div>
            </div>
          </div>

          {/* Host info */}
          {match.host && (
            <div className="rounded-2xl bg-white border border-gray-100 p-5">
              <h3 className="text-[14px] font-semibold text-gray-900 mb-3">호스트</h3>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-[14px] font-bold text-blue-500">
                  {match.host.nickname?.charAt(0)}
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-gray-900">{match.host.nickname}</p>
                  <div className="flex items-center gap-1 text-[12px] text-amber-500">
                    <Star size={12} fill="currentColor" />
                    <span>{match.host.mannerScore?.toFixed(1)}</span>
                    <span className="text-gray-300 mx-1">·</span>
                    <span className="text-gray-400">{match.host.totalMatches}경기</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Participants */}
          <div className="rounded-2xl bg-white border border-gray-100 p-5">
            <h3 className="text-[14px] font-semibold text-gray-900 mb-3">참가자 ({match.participants?.length || 0}명)</h3>
            {match.participants && match.participants.length > 0 ? (
              <div className="space-y-2">
                {match.participants.map((p: any) => (
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
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      paymentStatusColor[p.paymentStatus] || 'bg-gray-100 text-gray-400'
                    }`}>
                      {paymentStatusLabel[p.paymentStatus] || p.paymentStatus || '확인중'}
                    </span>
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
                value={match.status}
                onChange={(e) => statusMutation.mutate(e.target.value)}
                disabled={statusChanging}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-[14px] text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all disabled:opacity-50"
              >
                {statusOptions.map((s) => (
                  <option key={s} value={s}>{statusLabel[s]}</option>
                ))}
              </select>
              {statusMutation.isSuccess && (
                <p className="flex items-center gap-1 text-[12px] text-emerald-500 mt-1.5">
                  <CheckCircle size={12} />
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

            {/* Match summary */}
            <div className="space-y-3 border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-gray-400">매치 ID</span>
                <span className="text-gray-700 font-mono text-[12px]">{match.id?.slice(0, 12)}...</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-gray-400">생성일</span>
                <span className="text-gray-700">{match.createdAt ? new Date(match.createdAt).toLocaleDateString('ko-KR') : '-'}</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-gray-400">총 수입</span>
                <span className="text-gray-900 font-semibold">{formatCurrency((match.currentPlayers || 0) * (match.fee || 0))}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
