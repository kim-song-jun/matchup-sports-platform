'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, MapPin, Users, Star, Clock, CreditCard, Share2, ChevronRight, Pencil, Trophy } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useMatch } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { useToast } from '@/components/ui/toast';
import { SportIconMap } from '@/components/icons/sport-icons';
import type { MatchParticipant } from '@/types/api';
import { api } from '@/lib/api';
import { sportLabel, levelLabel, sportCardAccent } from '@/lib/constants';
import { formatFullDate, formatAmount } from '@/lib/utils';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
const CheckoutModal = dynamic(() => import('@/components/payment/checkout-modal').then(m => ({ default: m.CheckoutModal })), { ssr: false });

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
    mutationFn: () => api.post(`/matches/${matchId}/join`) as Promise<unknown>,
    onSuccess: () => {
      toast('success', '참가 완료! 경기에서 만나요');
      queryClient.invalidateQueries({ queryKey: ['matches', matchId] });
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast('error', axiosErr?.response?.data?.message || '참가에 실패했어요. 잠시 후 다시 시도해주세요');
    },
  });

  const leaveMutation = useMutation({
    mutationFn: () => api.delete(`/matches/${matchId}/leave`) as Promise<unknown>,
    onSuccess: () => {
      toast('info', '매치에서 탈퇴했어요');
      queryClient.invalidateQueries({ queryKey: ['matches', matchId] });
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast('error', axiosErr?.response?.data?.message || '탈퇴에 실패했어요. 다시 시도해주세요');
    },
  });

  if (isLoading) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
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
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <EmptyState
          icon={Trophy}
          title="매치를 찾을 수 없어요"
          description="삭제되었거나 존재하지 않는 매치예요"
          action={{ label: '목록으로', href: '/matches' }}
        />
      </div>
    );
  }

  const SportIcon = SportIconMap[match.sportType];
  const filledPercent = (match.currentPlayers / match.maxPlayers) * 100;
  const isAlmostFull = filledPercent >= 70;
  const isHost = user?.id === match.hostId;
  const isParticipant = match.participants?.some((p: MatchParticipant) => p.userId === user?.id);
  const isFull = match.currentPlayers >= match.maxPlayers;

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      {/* Mobile header */}
      <header className="@3xl:hidden flex items-center gap-3 px-5 py-3 sticky top-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm z-10 border-b border-gray-50 dark:border-gray-800">
        <button onClick={() => router.back()} aria-label="뒤로 가기" className="flex items-center justify-center min-h-11 min-w-11 rounded-xl -ml-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white truncate flex-1">{match.title}</h1>
        <button
          onClick={async () => {
            try {
              if (navigator.share) {
                await navigator.share({ title: match.title, url: window.location.href });
              } else {
                await navigator.clipboard.writeText(window.location.href);
                toast('success', '링크가 복사되었어요');
              }
            } catch { /* user cancelled share */ }
          }}
          aria-label="공유하기"
          className="flex items-center justify-center min-h-11 min-w-11 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <Share2 size={18} className="text-gray-500" />
        </button>
      </header>

      {/* Desktop breadcrumb */}
      <div className="hidden @3xl:flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/matches" className="hover:text-gray-600 transition-colors">매치 찾기</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700 dark:text-gray-300">{match.title}</span>
      </div>

      <div className="@3xl:grid @3xl:grid-cols-[1fr_380px] @3xl:gap-8">
        {/* Left: match info */}
        <div className="px-5 @3xl:px-0">
          {/* Title card */}
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 @3xl:p-6">
            <div className="flex items-start gap-3">
              {SportIcon && (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                  <SportIcon size={24} />
                </div>
              )}
              <div>
                <span className={`${sportCardAccent[match.sportType]?.badge || 'bg-gray-100 text-gray-500'} rounded-full px-2 py-0.5 text-xs font-medium`}>{sportLabel[match.sportType]}</span>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-0.5 leading-tight">
                  {match.title}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  호스트: {match.host?.nickname}
                  <Star size={12} className="inline ml-1 text-amber-400" fill="currentColor" />
                  <span className="ml-0.5">{match.host?.mannerScore?.toFixed(1)}</span>
                </p>
              </div>
            </div>

            {match.description && (
              <p className="mt-4 text-base text-gray-600 dark:text-gray-300 leading-relaxed">{match.description}</p>
            )}
          </div>

          {/* Info grid */}
          <div className="mt-4 grid grid-cols-2 gap-3 @3xl:gap-5">
            <InfoCard icon={<Calendar size={18} />} label="일시" value={`${formatFullDate(match.matchDate)}`} sub={`${match.startTime} ~ ${match.endTime}`} />
            <InfoCard icon={<MapPin size={18} />} label="장소" value={match.venue?.name || '미정'} sub={match.venue?.address?.slice(0, 20)} />
            <InfoCard icon={<Users size={18} />} label="인원" value={`${match.currentPlayers} / ${match.maxPlayers}명`} sub={isAlmostFull ? '마감 임박' : '모집중'} highlight={isAlmostFull} />
            <InfoCard icon={<CreditCard size={18} />} label="참가비" value={formatAmount(match.fee)} sub={`${levelLabel[match.levelMin]}~${levelLabel[match.levelMax]}`} />
          </div>

          {/* Venue card */}
          {match.venue && (
            <div className="mt-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">시설 정보</h3>
              <div className="flex items-center gap-3">
                <div className="h-16 w-16 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                  <MapPin size={24} className="text-gray-300 dark:text-gray-500" />
                </div>
                <div>
                  <p className="text-base font-medium text-gray-800 dark:text-gray-200">{match.venue.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{match.venue.address}</p>
                  {(match.venue.rating ?? 0) > 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      <Star size={12} className="text-amber-400" fill="currentColor" />
                      <span className="text-xs text-gray-600 dark:text-gray-300">{(match.venue.rating ?? 0).toFixed(1)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar: participants + action */}
        <div className="px-5 @3xl:px-0 mt-4 @3xl:mt-0 detail-sidebar">
          <div className="sidebar-sticky space-y-3">
          {/* Action button */}
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4">
            {/* Progress */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-500">참가 현황</span>
              <span className={`text-sm font-semibold ${isAlmostFull ? 'text-amber-500' : 'text-blue-500'}`}>
                {match.currentPlayers}/{match.maxPlayers}명
              </span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-4">
              <div className={`h-full w-full rounded-full transition-transform duration-300 origin-left ${isAlmostFull ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ transform: `scaleX(${filledPercent / 100})` }} />
            </div>

            {!isAuthenticated ? (
              <Link href="/login" className="block w-full text-center rounded-xl bg-blue-500 py-3.5 text-md font-semibold text-white hover:bg-blue-600 transition-colors">
                로그인 후 참가하기
              </Link>
            ) : isHost ? (
              <button disabled className="w-full rounded-xl bg-gray-100 py-3.5 text-md font-semibold text-gray-500 cursor-not-allowed">
                내가 만든 매치
              </button>
            ) : isParticipant ? (
              <button
                onClick={() => leaveMutation.mutate()}
                disabled={leaveMutation.isPending}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 py-3.5 text-md font-semibold text-red-500 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                {leaveMutation.isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
                    처리 중...
                  </span>
                ) : '참가 취소하기'}
              </button>
            ) : isFull ? (
              <button disabled className="w-full rounded-xl bg-gray-100 py-3.5 text-md font-semibold text-gray-500 cursor-not-allowed">
                마감되었습니다
              </button>
            ) : (
              <button
                onClick={() => match.fee > 0 ? setShowCheckout(true) : joinMutation.mutate()}
                disabled={joinMutation.isPending}
                className="w-full rounded-xl bg-blue-500 py-4 text-lg font-bold text-white hover:bg-blue-600 active:bg-blue-700 active:scale-[0.98] transition-[colors,transform] duration-200 disabled:opacity-50"
              >
                {joinMutation.isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    처리 중...
                  </span>
                ) : (
                  `참가하기 · ${formatAmount(match.fee)}`
                )}
              </button>
            )}

            {user?.id === match.hostId && (
              <Link href={`/matches/${matchId}/edit`} className="w-full flex items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-gray-600 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors mt-2">
                <Pencil size={14} />
                매치 수정
              </Link>
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
              className="w-full mt-2 rounded-xl border border-gray-200 dark:border-gray-600 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-1.5"
            >
              <Calendar size={14} />
              캘린더에 추가
            </button>
          </div>

          {/* Participants */}
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
              참가자 ({match.participants?.length || 0})
            </h3>
            <div className="space-y-2.5">
              {match.participants?.map((p: MatchParticipant) => (
                <div key={p.id} className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-sm font-bold text-gray-500 dark:text-gray-400">
                    {p.user?.nickname?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-medium text-gray-800 dark:text-gray-200 truncate">
                      {p.user?.nickname}
                      {p.userId === match.hostId && (
                        <span className="ml-1.5 rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400">호스트</span>
                      )}
                    </p>
                  </div>
                  <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${
                    p.status === 'confirmed' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
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
            toast('error', '결제에 실패했어요. 잠시 후 다시 시도해주세요');
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
    <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3.5">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-gray-400 dark:text-gray-500">{icon}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      </div>
      <p className={`text-md font-semibold ${highlight ? 'text-amber-500' : 'text-gray-900 dark:text-white'}`}>{value}</p>
      {sub && <p className={`text-xs mt-0.5 ${highlight ? 'text-amber-400' : 'text-gray-500 dark:text-gray-400'}`}>{sub}</p>}
    </div>
  );
}
