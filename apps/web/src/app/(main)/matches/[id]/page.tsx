'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, MapPin, Users, Star, Clock, CreditCard, Share2, ChevronRight } from 'lucide-react';
import { useMatch } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { useToast } from '@/components/ui/toast';
import { SportIconMap } from '@/components/icons/sport-icons';
import { api } from '@/lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckoutModal } from '@/components/payment/checkout-modal';

const sportLabel: Record<string, string> = {
  futsal: '풋살', basketball: '농구', badminton: '배드민턴',
  ice_hockey: '아이스하키', figure_skating: '피겨', short_track: '쇼트트랙',
};
const levelLabel: Record<number, string> = { 1: '입문', 2: '초급', 3: '중급', 4: '상급', 5: '고수' };

function formatMatchDate(dateStr: string): string {
  const d = new Date(dateStr);
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${weekdays[d.getDay()]})`;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('ko-KR').format(n) + '원';
}

export default function MatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();
  const matchId = params.id as string;
  const { data: match, isLoading } = useMatch(matchId);
  const [showCheckout, setShowCheckout] = useState(false);

  const joinMutation = useMutation({
    mutationFn: () => api.post(`/matches/${matchId}/join`) as Promise<any>,
    onSuccess: () => {
      toast('success', '매치에 참가했습니다!');
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
    },
    onError: (err: any) => {
      toast('error', err?.response?.data?.message || '참가에 실패했습니다');
    },
  });

  const leaveMutation = useMutation({
    mutationFn: () => api.delete(`/matches/${matchId}/leave`) as Promise<any>,
    onSuccess: () => {
      toast('info', '매치에서 탈퇴했습니다');
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
    },
    onError: (err: any) => {
      toast('error', err?.response?.data?.message || '탈퇴에 실패했습니다');
    },
  });

  if (isLoading) {
    return (
      <div className="px-5 lg:px-0 pt-[var(--safe-area-top)] lg:pt-0">
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-32 bg-gray-100 rounded-lg" />
          <div className="h-48 bg-gray-100 rounded-2xl" />
          <div className="h-32 bg-gray-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="px-5 lg:px-0 pt-[var(--safe-area-top)] lg:pt-0 text-center py-20">
        <p className="text-gray-500">매치를 찾을 수 없습니다</p>
        <Link href="/matches" className="text-blue-500 text-sm mt-2 inline-block">목록으로 돌아가기</Link>
      </div>
    );
  }

  const SportIcon = SportIconMap[match.sportType];
  const filledPercent = (match.currentPlayers / match.maxPlayers) * 100;
  const isAlmostFull = filledPercent >= 70;
  const isHost = user?.id === match.hostId;
  const isParticipant = match.participants?.some((p: any) => p.userId === user?.id);
  const isFull = match.currentPlayers >= match.maxPlayers;

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0 animate-fade-in">
      {/* Mobile header */}
      <header className="lg:hidden flex items-center gap-3 px-5 py-3 sticky top-0 bg-white/95 backdrop-blur-sm z-10 border-b border-gray-50">
        <button onClick={() => router.back()} className="rounded-lg p-1.5 -ml-1.5 hover:bg-gray-100 transition-colors">
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <h1 className="text-[16px] font-semibold text-gray-900 truncate flex-1">{match.title?.replace(/[\u{1F300}-\u{1FAFF}]/gu, '').trim()}</h1>
        <button className="rounded-lg p-1.5 hover:bg-gray-100 transition-colors">
          <Share2 size={18} className="text-gray-500" />
        </button>
      </header>

      {/* Desktop breadcrumb */}
      <div className="hidden lg:flex items-center gap-2 text-[13px] text-gray-400 mb-6">
        <Link href="/matches" className="hover:text-gray-600 transition-colors">매치 찾기</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700">{match.title?.replace(/[\u{1F300}-\u{1FAFF}]/gu, '').trim()}</span>
      </div>

      <div className="lg:grid lg:grid-cols-[1fr_380px] lg:gap-8">
        {/* Left: match info */}
        <div className="px-5 lg:px-0">
          {/* Title card */}
          <div className="rounded-2xl bg-white border border-gray-100 p-5 lg:p-6">
            <div className="flex items-start gap-3">
              {SportIcon && (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
                  <SportIcon size={24} />
                </div>
              )}
              <div>
                <span className="text-[12px] font-medium text-blue-500">{sportLabel[match.sportType]}</span>
                <h2 className="text-[20px] font-bold text-gray-900 mt-0.5 leading-tight">
                  {match.title?.replace(/[\u{1F300}-\u{1FAFF}]/gu, '').trim()}
                </h2>
                <p className="text-[13px] text-gray-400 mt-1">
                  호스트: {match.host?.nickname}
                  <Star size={12} className="inline ml-1 text-amber-400" fill="currentColor" />
                  <span className="ml-0.5">{match.host?.mannerScore?.toFixed(1)}</span>
                </p>
              </div>
            </div>

            {match.description && (
              <p className="mt-4 text-[14px] text-gray-600 leading-relaxed">{match.description}</p>
            )}
          </div>

          {/* Info grid */}
          <div className="mt-3 grid grid-cols-2 gap-3 lg:gap-5">
            <InfoCard icon={<Calendar size={18} />} label="일시" value={`${formatMatchDate(match.matchDate)}`} sub={`${match.startTime} ~ ${match.endTime}`} />
            <InfoCard icon={<MapPin size={18} />} label="장소" value={match.venue?.name} sub={match.venue?.address?.slice(0, 20)} />
            <InfoCard icon={<Users size={18} />} label="인원" value={`${match.currentPlayers} / ${match.maxPlayers}명`} sub={isAlmostFull ? '마감 임박' : '모집중'} highlight={isAlmostFull} />
            <InfoCard icon={<CreditCard size={18} />} label="참가비" value={formatCurrency(match.fee)} sub={`${levelLabel[match.levelMin]}~${levelLabel[match.levelMax]}`} />
          </div>

          {/* Venue card */}
          {match.venue && (
            <div className="mt-3 rounded-2xl bg-white border border-gray-100 p-4">
              <h3 className="text-[14px] font-semibold text-gray-900 mb-2">시설 정보</h3>
              <div className="flex items-center gap-3">
                <div className="h-16 w-16 rounded-xl bg-gray-100 flex items-center justify-center">
                  <MapPin size={24} className="text-gray-300" />
                </div>
                <div>
                  <p className="text-[14px] font-medium text-gray-800">{match.venue.name}</p>
                  <p className="text-[12px] text-gray-400 mt-0.5">{match.venue.address}</p>
                  {match.venue.rating > 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      <Star size={12} className="text-amber-400" fill="currentColor" />
                      <span className="text-[12px] text-gray-600">{match.venue.rating.toFixed(1)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar: participants + action */}
        <div className="px-5 lg:px-0 mt-4 lg:mt-0 detail-sidebar">
          <div className="sidebar-sticky space-y-3">
          {/* Action button */}
          <div className="rounded-2xl bg-white border border-gray-100 p-4">
            {/* Progress */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] text-gray-500">참가 현황</span>
              <span className={`text-[13px] font-semibold ${isAlmostFull ? 'text-red-500' : 'text-blue-500'}`}>
                {match.currentPlayers}/{match.maxPlayers}명
              </span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-4">
              <div className={`h-full rounded-full transition-all duration-700 ${isAlmostFull ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${filledPercent}%` }} />
            </div>

            {!isAuthenticated ? (
              <Link href="/login" className="block w-full text-center rounded-xl bg-gray-900 py-3.5 text-[15px] font-semibold text-white hover:bg-gray-800 transition-colors">
                로그인 후 참가하기
              </Link>
            ) : isHost ? (
              <button disabled className="w-full rounded-xl bg-gray-100 py-3.5 text-[15px] font-semibold text-gray-400 cursor-not-allowed">
                내가 만든 매치
              </button>
            ) : isParticipant ? (
              <button
                onClick={() => leaveMutation.mutate()}
                disabled={leaveMutation.isPending}
                className="w-full rounded-xl border-2 border-red-100 bg-red-50 py-3.5 text-[15px] font-semibold text-red-500 hover:bg-red-100 transition-colors disabled:opacity-50"
              >
                {leaveMutation.isPending ? '처리중...' : '참가 취소하기'}
              </button>
            ) : isFull ? (
              <button disabled className="w-full rounded-xl bg-gray-100 py-3.5 text-[15px] font-semibold text-gray-400 cursor-not-allowed">
                마감되었습니다
              </button>
            ) : (
              <button
                onClick={() => match.fee > 0 ? setShowCheckout(true) : joinMutation.mutate()}
                disabled={joinMutation.isPending}
                className="w-full rounded-xl bg-blue-500 py-3.5 text-[15px] font-semibold text-white hover:bg-blue-600 active:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {joinMutation.isPending ? '처리중...' : `참가하기 · ${formatCurrency(match.fee)}`}
              </button>
            )}

            {/* 캘린더 추가 */}
            <button
              onClick={() => {
                const startDate = new Date(match.matchDate);
                const [sh, sm] = match.startTime.split(':');
                startDate.setHours(+sh, +sm);
                const [eh, em] = match.endTime.split(':');
                const endDate = new Date(match.matchDate);
                endDate.setHours(+eh, +em);
                const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
                const url = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(match.title)}&dates=${fmt(startDate)}/${fmt(endDate)}&location=${encodeURIComponent(match.venue?.name || '')}&details=${encodeURIComponent(match.description || '')}`;
                window.open(url, '_blank');
              }}
              className="w-full mt-2 rounded-xl border border-gray-200 py-2.5 text-[13px] font-medium text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
            >
              <Calendar size={14} />
              캘린더에 추가
            </button>
          </div>

          {/* Participants */}
          <div className="rounded-2xl bg-white border border-gray-100 p-4">
            <h3 className="text-[14px] font-semibold text-gray-900 mb-3">
              참가자 ({match.participants?.length || 0})
            </h3>
            <div className="space-y-2.5">
              {match.participants?.map((p: any) => (
                <div key={p.id} className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[13px] font-bold text-gray-500">
                    {p.user?.nickname?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-gray-800 truncate">
                      {p.user?.nickname}
                      {p.userId === match.hostId && (
                        <span className="ml-1.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-500">호스트</span>
                      )}
                    </p>
                  </div>
                  <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${
                    p.status === 'confirmed' ? 'bg-green-50 text-green-500' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {p.status === 'confirmed' ? '확정' : '대기'}
                  </span>
                </div>
              ))}
            </div>
          </div>
          </div>
        </div>
      </div>

      <div className="h-8" />

      {/* 결제 모달 */}
      {showCheckout && match && (
        <CheckoutModal
          isOpen={showCheckout}
          onClose={() => setShowCheckout(false)}
          amount={match.fee}
          itemName={match.title}
          orderId={`match-${matchId}-${Date.now()}`}
          onSuccess={() => {
            joinMutation.mutate();
            setShowCheckout(false);
          }}
          onError={() => {
            toast('error', '결제에 실패했습니다');
            setShowCheckout(false);
          }}
        />
      )}
    </div>
  );
}

function InfoCard({ icon, label, value, sub, highlight }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl bg-white border border-gray-100 p-3.5">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-gray-400">{icon}</span>
        <span className="text-[12px] text-gray-500">{label}</span>
      </div>
      <p className={`text-[15px] font-semibold ${highlight ? 'text-red-500' : 'text-gray-900'}`}>{value}</p>
      {sub && <p className={`text-[12px] mt-0.5 ${highlight ? 'text-red-400' : 'text-gray-400'}`}>{sub}</p>}
    </div>
  );
}
