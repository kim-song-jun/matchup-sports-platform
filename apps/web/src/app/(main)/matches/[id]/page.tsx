'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, MapPin, Users, Star, Clock, CreditCard, Share2, ChevronRight, Pencil, Trophy, AlertTriangle, CheckCircle2, Camera } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { SafeImage } from '@/components/ui/safe-image';
import { MediaLightbox } from '@/components/ui/media-lightbox';
import { Modal } from '@/components/ui/modal';
import { useMatch, useUpdateMatch, useCancelMatch, useCloseMatch, useArriveMatch, queryKeys } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { useToast } from '@/components/ui/toast';
import { SportIconMap } from '@/components/icons/sport-icons';
import type { ApiResponse, MatchParticipant, Payment, Upload } from '@/types/api';
import { api } from '@/lib/api';
import { sportLabel, levelLabel, sportCardAccent } from '@/lib/constants';
import { getSportDetailImageSet, getVenueImageSet } from '@/lib/sport-image';
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
  const updateMatchMutation = useUpdateMatch();
  const cancelMutation = useCancelMatch(matchId);
  const closeMutation = useCloseMatch(matchId);
  const arriveMutation = useArriveMatch(matchId);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showArrivalModal, setShowArrivalModal] = useState(false);
  const [arrivalPhoto, setArrivalPhoto] = useState<File | null>(null);
  const [arrivalPhotoPreview, setArrivalPhotoPreview] = useState<string | null>(null);
  const [isArriving, setIsArriving] = useState(false);
  const [pendingParticipantId, setPendingParticipantId] = useState<string | null>(null);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [showMediaLightbox, setShowMediaLightbox] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const joinMutation = useMutation<MatchParticipant, unknown, { openCheckout: boolean }>({
    mutationFn: async () => {
      const res = await api.post(`/matches/${matchId}/join`);
      return (res as unknown as ApiResponse<MatchParticipant>).data;
    },
    onSuccess: (participant, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.matches.all });
      queryClient.invalidateQueries({ queryKey: ['matches', matchId] });

      if (variables.openCheckout && participant.paymentStatus === 'pending') {
        setPendingParticipantId(participant.id);
        setShowCheckout(true);
        toast('info', '참가 신청이 생성되었어요. 결제를 완료하면 확정됩니다.');
        return;
      }

      toast('success', '참가 완료! 경기에서 만나요');
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
  const isClosedStatus = match.status === 'cancelled' || match.status === 'completed';
  const canHostEdit = isHost && !isClosedStatus;
  const canHostReopen = isHost && match.status === 'full' && match.currentPlayers < match.maxPlayers;
  const currentParticipant = match.participants?.find((p: MatchParticipant) => p.userId === user?.id);
  const isParticipant = !!currentParticipant;
  const hasPendingPayment = currentParticipant?.paymentStatus === 'pending';
  const isFull = match.currentPlayers >= match.maxPlayers;
  const isRecruitingOpen = match.status === 'recruiting';

  // Arrival window: match start - 30min ~ match end + 30min
  const matchDateStr = match.matchDate.split('T')[0];
  const [arrSH, arrSM] = match.startTime.split(':').map(Number);
  const [arrEH, arrEM] = match.endTime.split(':').map(Number);
  const arrivalWindowStart = new Date(`${matchDateStr}T${String(arrSH).padStart(2, '0')}:${String(arrSM).padStart(2, '0')}:00`).getTime() - 30 * 60 * 1000;
  const arrivalWindowEnd = new Date(`${matchDateStr}T${String(arrEH).padStart(2, '0')}:${String(arrEM).padStart(2, '0')}:00`).getTime() + 30 * 60 * 1000;
  const now = Date.now();
  const isInArrivalWindow = now >= arrivalWindowStart && now <= arrivalWindowEnd;
  const hasArrived = !!currentParticipant?.arrivedAt;
  const matchImages = getSportDetailImageSet(
    match.sportType,
    [match.imageUrl, ...(match.venue?.imageUrls ?? [])],
    match.id,
    4,
  );
  const fallbackMatchImages = getSportDetailImageSet(match.sportType, undefined, match.id, 4);
  const matchedImageEntries = matchImages.filter((image, index, images) => images.indexOf(image) === index);
  const mediaImages = matchedImageEntries.map((image, index) => ({
    src: image,
    alt: `${match.title} 이미지 ${index + 1}`,
    fallbackSrc: fallbackMatchImages[index] ?? fallbackMatchImages[0],
  }));
  const heroImage = matchImages[0];
  const heroFallbackImage = fallbackMatchImages[0];
  const venuePreviewImage = match.venue
    ? getVenueImageSet(match.sportType, match.venue.imageUrls, `${match.id}-venue`, 1)[0]
    : null;
  const fallbackVenuePreviewImage = match.venue
    ? getVenueImageSet(match.sportType, undefined, `${match.id}-venue`, 1)[0]
    : null;
  const mediaImageIndex = new Map(mediaImages.map((image, index) => [image.src, index]));

  function openMediaAt(index: number) {
    setMediaIndex(index);
    setShowMediaLightbox(true);
  }

  const statusLabel = match.status === 'recruiting'
    ? '모집중'
    : match.status === 'full'
      ? '마감'
      : match.status === 'completed'
        ? '완료'
        : match.status === 'cancelled'
          ? '취소됨'
          : match.status;

  const statusBadgeClass = match.status === 'completed'
    ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300'
    : match.status === 'cancelled'
      ? 'bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-300'
      : match.status === 'full'
        ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-200'
        : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300';
  const capacitySubLabel = match.status === 'completed'
    ? '경기 종료'
    : match.status === 'cancelled'
      ? '취소된 매치'
      : match.status === 'full'
        ? '모집 마감'
        : isAlmostFull
          ? '마감 임박'
          : '모집중';

  async function handleHostStatusChange(status: 'recruiting' | 'full' | 'completed' | 'cancelled', successMessage: string) {
    try {
      await updateMatchMutation.mutateAsync({ id: matchId, data: { status } });
      toast('success', successMessage);
    } catch (error) {
      const axiosErr = error as { response?: { data?: { message?: string } } };
      toast('error', axiosErr?.response?.data?.message || '상태 변경에 실패했어요');
    }
  }

  async function handleCloseConfirm() {
    try {
      await closeMutation.mutateAsync();
      toast('success', '모집을 마감했어요');
      setShowCloseModal(false);
    } catch (error) {
      const axiosErr = error as { response?: { data?: { message?: string } } };
      toast('error', axiosErr?.response?.data?.message || '상태 변경에 실패했어요');
    }
  }

  async function handleCancelConfirm() {
    try {
      await cancelMutation.mutateAsync(cancelReason ? { reason: cancelReason } : undefined);
      toast('success', '매치를 취소했어요');
      setShowCancelModal(false);
      setCancelReason('');
    } catch (error) {
      const axiosErr = error as { response?: { data?: { message?: string } } };
      toast('error', axiosErr?.response?.data?.message || '취소에 실패했어요');
    }
  }

  async function handleArrivalConfirm() {
    if (!arrivalPhoto) {
      toast('error', '도착 사진을 선택해주세요');
      return;
    }
    setIsArriving(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 }),
      ).catch(() => null);

      if (!position) {
        toast('error', '위치 정보를 가져올 수 없어요. 위치 권한을 허용해주세요.');
        setIsArriving(false);
        return;
      }

      const { latitude: lat, longitude: lng } = position.coords;

      // Client-side distance pre-check
      if (match?.venue?.lat != null && match?.venue?.lng != null) {
        const R = 6371000;
        const toRad = (deg: number) => (deg * Math.PI) / 180;
        const dLat = toRad(lat - match.venue.lat);
        const dLng = toRad(lng - match.venue.lng);
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(toRad(match.venue.lat)) *
            Math.cos(toRad(lat)) *
            Math.sin(dLng / 2) ** 2;
        const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        if (distance > 200) {
          toast('error', '구장에서 너무 멀어요. 200m 이내에서만 인증할 수 있어요.');
          setIsArriving(false);
          return;
        }
      }

      // Upload photo
      const formData = new FormData();
      formData.append('files', arrivalPhoto);
      const uploadRes = await api.post('/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const uploads = (uploadRes as unknown as ApiResponse<Upload[]>).data;
      const photoUrl = uploads[0]?.path;
      if (!photoUrl) {
        toast('error', '사진 업로드에 실패했어요. 다시 시도해주세요.');
        setIsArriving(false);
        return;
      }

      await arriveMutation.mutateAsync({ lat, lng, photoUrl });
      toast('success', '도착 인증이 완료되었어요!');
      setShowArrivalModal(false);
      setArrivalPhoto(null);
      setArrivalPhotoPreview(null);
    } catch (err) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast('error', axiosErr?.response?.data?.message || '도착 인증에 실패했어요.');
    } finally {
      setIsArriving(false);
    }
  }

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
          {heroImage && (
            <div className="mb-4">
              <button
                type="button"
                onClick={() => openMediaAt(0)}
                aria-label={`${match.title} 대표 이미지 보기`}
                className="w-full overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800"
              >
                <SafeImage
                  src={heroImage}
                  fallbackSrc={heroFallbackImage}
                  alt={match.title}
                  className="h-[220px] w-full object-cover"
                />
              </button>
              {matchImages.length > 1 && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {matchImages.slice(1).map((image, index) => (
                    <button
                      key={`${image}-${index}`}
                      type="button"
                      onClick={() => openMediaAt(mediaImageIndex.get(image) ?? index + 1)}
                      aria-label={`${match.title} 이미지 ${index + 2} 보기`}
                      className="overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800"
                    >
                      <SafeImage
                        src={image}
                        fallbackSrc={fallbackMatchImages[index + 1] ?? heroFallbackImage}
                        alt={`${match.title} 이미지 ${index + 2}`}
                        className="aspect-[4/3] h-full w-full object-cover"
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Title card */}
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 @3xl:p-6">
            <div className="flex items-start gap-3">
              {SportIcon && (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                  <SportIcon size={24} />
                </div>
              )}
              <div>
                <span className={`${sportCardAccent[match.sportType]?.badge || 'bg-gray-100 text-gray-500'} rounded-full px-2 py-0.5 text-xs font-normal`}>{sportLabel[match.sportType]}</span>
                <h2 data-testid="match-detail-title" className="text-xl font-bold text-gray-900 dark:text-white mt-0.5 leading-tight">
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
            <InfoCard icon={<Users size={18} />} label="인원" value={`${match.currentPlayers} / ${match.maxPlayers}명`} sub={capacitySubLabel} highlight={isAlmostFull && isRecruitingOpen} />
            <InfoCard icon={<CreditCard size={18} />} label="참가비" value={formatAmount(match.fee)} sub={`${levelLabel[match.levelMin]}~${levelLabel[match.levelMax]}`} />
          </div>

          {/* Venue card */}
          {match.venue && (
            <div className="mt-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">시설 정보</h3>
              <div className="flex items-center gap-3">
                {venuePreviewImage && (
                  <div className="h-16 w-16 overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-700">
                    <SafeImage
                      src={venuePreviewImage}
                      fallbackSrc={fallbackVenuePreviewImage}
                      alt={match.venue.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                )}
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
              <span data-testid="match-participant-count" className={`text-sm font-semibold ${isAlmostFull ? 'text-amber-500' : 'text-blue-500'}`}>
                {match.currentPlayers}/{match.maxPlayers}명
              </span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-4">
              <div className={`h-full w-full rounded-full transition-transform duration-300 origin-left ${isAlmostFull ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ transform: `scaleX(${filledPercent / 100})` }} />
            </div>
            <div className="mb-4 flex items-center justify-between rounded-xl bg-gray-50 dark:bg-gray-900/40 px-3 py-2">
              <span className="text-sm text-gray-500">매치 상태</span>
              <span data-testid="match-status-badge" className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClass}`}>
                {statusLabel}
              </span>
            </div>

            {!isAuthenticated ? (
              <Link href="/login" className="block w-full text-center rounded-xl bg-blue-500 py-3.5 text-md font-semibold text-white hover:bg-blue-600 transition-colors">
                로그인 후 참가하기
              </Link>
            ) : isHost ? (
              <div className="space-y-2">
                <button disabled className="w-full rounded-xl bg-gray-100 py-3.5 text-md font-semibold text-gray-500 cursor-not-allowed">
                  내가 만든 매치
                </button>
                {canHostEdit ? (
                  <>
                    <Link
                      href={`/matches/${matchId}/edit`}
                      data-testid="match-host-edit-button"
                      className="w-full flex items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-gray-600 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <Pencil size={14} />
                      매치 수정
                    </Link>
                    {match.status === 'recruiting' && (
                      <button
                        onClick={() => setShowCloseModal(true)}
                        disabled={updateMatchMutation.isPending}
                        data-testid="match-host-close-button"
                        className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-60"
                      >
                        모집 마감
                      </button>
                    )}
                    {canHostReopen && (
                      <button
                        onClick={() => handleHostStatusChange('recruiting', '재모집을 시작했어요')}
                        disabled={updateMatchMutation.isPending}
                        data-testid="match-host-reopen-button"
                        className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-60"
                      >
                        재모집 시작
                      </button>
                    )}
                    <button
                      onClick={() => handleHostStatusChange('completed', '매치를 완료 처리했어요')}
                      disabled={updateMatchMutation.isPending}
                      data-testid="match-host-complete-button"
                      className="w-full rounded-xl bg-blue-500 py-2.5 text-sm font-semibold text-white hover:bg-blue-600 transition-colors disabled:opacity-60"
                    >
                      매치 완료
                    </button>
                    <button
                      onClick={() => setShowCancelModal(true)}
                      disabled={updateMatchMutation.isPending}
                      data-testid="match-host-cancel-button"
                      className="w-full rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white hover:bg-red-600 transition-colors disabled:opacity-60"
                    >
                      매치 취소
                    </button>
                  </>
                ) : (
                  <p className="rounded-xl bg-gray-50 dark:bg-gray-900/40 px-3 py-2 text-xs text-gray-500">
                    완료되거나 취소된 매치는 수정할 수 없어요.
                  </p>
                )}
              </div>
            ) : match.status === 'cancelled' ? (
              <button disabled className="w-full rounded-xl bg-gray-100 py-3.5 text-md font-semibold text-gray-500 cursor-not-allowed">
                취소된 매치예요
              </button>
            ) : match.status === 'completed' ? (
              <button disabled className="w-full rounded-xl bg-gray-100 py-3.5 text-md font-semibold text-gray-500 cursor-not-allowed">
                종료된 매치예요
              </button>
            ) : isParticipant ? (
              <div className="space-y-2">
                {hasPendingPayment ? (
                  <button
                    onClick={() => {
                      setPendingParticipantId(currentParticipant?.id ?? null);
                      setShowCheckout(true);
                    }}
                    className="w-full rounded-xl bg-blue-500 py-3.5 text-md font-semibold text-white hover:bg-blue-600 transition-colors"
                  >
                    결제 마무리하기 · {formatAmount(match.fee)}
                  </button>
                ) : null}

                {/* Arrival check-in button */}
                {isInArrivalWindow && (
                  hasArrived ? (
                    <div className="flex items-center justify-center gap-2 rounded-xl bg-green-50 dark:bg-green-950/30 py-3 text-sm font-semibold text-green-600 dark:text-green-400">
                      <CheckCircle2 size={16} aria-hidden="true" />
                      도착 완료
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowArrivalModal(true)}
                      data-testid="match-arrive-button"
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-green-500 py-3 text-sm font-semibold text-white hover:bg-green-600 transition-colors min-h-[44px]"
                    >
                      <Camera size={16} aria-hidden="true" />
                      도착 인증
                    </button>
                  )
                )}

                <button
                  onClick={() => leaveMutation.mutate()}
                  disabled={leaveMutation.isPending}
                  data-testid="match-leave-button"
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 py-3.5 text-md font-semibold text-red-500 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  {leaveMutation.isPending ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
                      처리 중...
                    </span>
                  ) : hasPendingPayment ? '참가 신청 취소하기' : '참가 취소하기'}
                </button>
              </div>
            ) : !isRecruitingOpen ? (
              <button disabled className="w-full rounded-xl bg-gray-100 py-3.5 text-md font-semibold text-gray-500 cursor-not-allowed">
                모집이 마감되었어요
              </button>
            ) : isFull ? (
              <button disabled className="w-full rounded-xl bg-gray-100 py-3.5 text-md font-semibold text-gray-500 cursor-not-allowed">
                마감되었습니다
              </button>
            ) : (
              <button
                onClick={() => joinMutation.mutate({ openCheckout: match.fee > 0 })}
                disabled={joinMutation.isPending}
                data-testid="match-join-button"
                className="w-full rounded-xl bg-blue-500 py-4 text-lg font-bold text-white hover:bg-blue-600 active:bg-blue-700 active:scale-[0.98] transition-[colors,transform] duration-200 disabled:opacity-50"
              >
                {joinMutation.isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    처리 중...
                  </span>
                ) : (
                  `${match.fee > 0 ? '참가 후 결제하기' : '참가하기'} · ${formatAmount(match.fee)}`
                )}
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
                  <div className="flex items-center gap-1.5 shrink-0">
                    {p.arrivedAt && (
                      <CheckCircle2 size={14} className="text-green-500" aria-label="도착 완료" />
                    )}
                    <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${
                      p.status === 'confirmed' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {p.status === 'confirmed' ? '확정' : '대기'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          </div>
        </div>
      </div>


      {/* 모집 마감 확인 모달 */}
      <Modal
        isOpen={showCloseModal}
        onClose={() => setShowCloseModal(false)}
        title="모집 마감"
        size="sm"
      >
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-950/30">
            <AlertTriangle size={24} className="text-amber-500" aria-hidden="true" />
          </div>
          <p className="text-center text-base text-gray-700 dark:text-gray-300">
            모집을 마감하시겠습니까?<br />
            <span className="text-sm text-gray-500">마감 후에도 재모집을 시작할 수 있어요.</span>
          </p>
          <div className="flex w-full gap-3 pt-2">
            <button
              onClick={() => setShowCloseModal(false)}
              className="flex-1 rounded-xl bg-gray-100 dark:bg-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors min-h-[44px]"
            >
              취소
            </button>
            <button
              onClick={handleCloseConfirm}
              disabled={updateMatchMutation.isPending}
              data-testid="match-close-confirm-button"
              className="flex-1 rounded-xl bg-gray-900 dark:bg-white py-3 text-base font-semibold text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors disabled:opacity-60 min-h-[44px]"
            >
              {updateMatchMutation.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  처리 중...
                </span>
              ) : '마감하기'}
            </button>
          </div>
        </div>
      </Modal>

      {/* 매치 취소 확인 모달 */}
      <Modal
        isOpen={showCancelModal}
        onClose={() => { setShowCancelModal(false); setCancelReason(''); }}
        title="매치 취소"
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/30">
              <AlertTriangle size={24} className="text-red-500" aria-hidden="true" />
            </div>
            <p className="text-center text-base text-gray-700 dark:text-gray-300">
              매치를 취소하시겠습니까?<br />
              <span className="text-sm text-gray-500">취소하면 참가자들에게 알림이 발송돼요.<br />이 작업은 되돌릴 수 없어요.</span>
            </p>
          </div>
          <div>
            <label htmlFor="cancel-reason" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              취소 사유 <span className="text-gray-400 font-normal">(선택)</span>
            </label>
            <textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="참가자들에게 전달할 취소 사유를 입력해주세요"
              rows={3}
              className="w-full rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none transition-colors resize-none"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => { setShowCancelModal(false); setCancelReason(''); }}
              className="flex-1 rounded-xl bg-gray-100 dark:bg-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors min-h-[44px]"
            >
              돌아가기
            </button>
            <button
              onClick={handleCancelConfirm}
              disabled={updateMatchMutation.isPending}
              data-testid="match-cancel-confirm-button"
              className="flex-1 rounded-xl bg-red-500 py-3 text-base font-semibold text-white hover:bg-red-600 transition-colors disabled:opacity-60 min-h-[44px]"
            >
              {updateMatchMutation.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  처리 중...
                </span>
              ) : '취소하기'}
            </button>
          </div>
        </div>
      </Modal>

      {/* 도착 인증 모달 */}
      <Modal
        isOpen={showArrivalModal}
        onClose={() => {
          if (!isArriving) {
            setShowArrivalModal(false);
            setArrivalPhoto(null);
            setArrivalPhotoPreview(null);
          }
        }}
        title="도착 인증"
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            구장에 도착했나요? 사진을 찍어 도착을 인증해주세요.
          </p>
          <div>
            <label htmlFor="arrival-photo" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              도착 사진
            </label>
            {arrivalPhotoPreview ? (
              <div className="relative rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={arrivalPhotoPreview}
                  alt="도착 인증 사진 미리보기"
                  className="w-full h-48 object-cover"
                />
                <button
                  type="button"
                  onClick={() => { setArrivalPhoto(null); setArrivalPhotoPreview(null); }}
                  aria-label="사진 제거"
                  className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                >
                  ×
                </button>
              </div>
            ) : (
              <label
                htmlFor="arrival-photo"
                className="flex flex-col items-center justify-center gap-2 h-36 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <Camera size={24} className="text-gray-400" aria-hidden="true" />
                <span className="text-sm text-gray-500">사진을 선택해주세요</span>
              </label>
            )}
            <input
              id="arrival-photo"
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setArrivalPhoto(file);
                  setArrivalPhotoPreview(URL.createObjectURL(file));
                }
              }}
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                setShowArrivalModal(false);
                setArrivalPhoto(null);
                setArrivalPhotoPreview(null);
              }}
              disabled={isArriving}
              className="flex-1 rounded-xl bg-gray-100 dark:bg-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 min-h-[44px]"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleArrivalConfirm}
              disabled={isArriving || !arrivalPhoto}
              data-testid="match-arrive-confirm-button"
              className="flex-1 rounded-xl bg-green-500 py-3 text-base font-semibold text-white hover:bg-green-600 transition-colors disabled:opacity-50 min-h-[44px]"
            >
              {isArriving ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  인증 중...
                </span>
              ) : '인증하기'}
            </button>
          </div>
        </div>
      </Modal>

      {/* 미디어 라이트박스 */}
      <MediaLightbox
        isOpen={showMediaLightbox}
        images={mediaImages}
        initialIndex={mediaIndex}
        onClose={() => setShowMediaLightbox(false)}
        title={`${match.title} 사진`}
      />

      {/* 결제 모달 */}
      {showCheckout && match && (
        <CheckoutModal
          isOpen={showCheckout}
          onClose={() => setShowCheckout(false)}
          participantId={pendingParticipantId ?? ''}
          amount={match.fee}
          itemName={match.title}
          onSuccess={(payment: Payment) => {
            queryClient.invalidateQueries({ queryKey: ['matches', matchId] });
            queryClient.invalidateQueries({ queryKey: ['payments'] });
            setPendingParticipantId(payment.participantId ?? pendingParticipantId);
            setShowCheckout(false);
          }}
          onError={() => {
            toast('error', '결제에 실패했어요. 잠시 후 다시 시도해주세요');
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
