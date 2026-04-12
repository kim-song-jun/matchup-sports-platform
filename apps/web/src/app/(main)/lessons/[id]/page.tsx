'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, MapPin, Users, Star, CreditCard, ChevronRight, User, CheckCircle, BookOpen, Pencil, GraduationCap } from 'lucide-react';
import { MobileGlassHeader } from '@/components/layout/mobile-glass-header';
import { EmptyState } from '@/components/ui/empty-state';
import { SafeImage } from '@/components/ui/safe-image';
import dynamic from 'next/dynamic';
import { TrustSignalBanner } from '@/components/ui/trust-signal-banner';
import { useAuthStore } from '@/stores/auth-store';

const MediaLightbox = dynamic(
  () => import('@/components/ui/media-lightbox').then((m) => ({ default: m.MediaLightbox })),
  { ssr: false, loading: () => null }
);
import { SportIconMap } from '@/components/icons/sport-icons';
import { useLesson, useMyLessonTickets } from '@/hooks/use-api';
import { sportLabel, lessonTypeLabel, levelLabel } from '@/lib/constants';
import { buildScheduledAt } from '@/lib/payment-ui';
import { getSportDetailImageSet } from '@/lib/sport-image';
import { formatAmount, formatFullDate, formatCurrency } from '@/lib/utils';
import { TicketPlanSelector } from '@/components/lesson/ticket-plan-selector';
import { LessonCalendar } from '@/components/lesson/lesson-calendar';
import { useToast } from '@/components/ui/toast';
import type { LessonTicketPlan } from '@/types/api';
const typeColor: Record<string, string> = {
  group_lesson: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300', practice_match: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
  free_practice: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300', clinic: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
};

export default function LessonDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { toast } = useToast();
  const lessonId = params.id as string;
  const [selectedTicketPlan, setSelectedTicketPlan] = useState<LessonTicketPlan | null>(null);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [showMediaLightbox, setShowMediaLightbox] = useState(false);

  const { data: lesson, isLoading } = useLesson(lessonId);
  const { data: myTickets = [] } = useMyLessonTickets();

  const isHost = user?.id === lesson?.hostId;
  const isFull = !!(lesson && lesson.currentParticipants >= lesson.maxParticipants);

  if (isLoading) return <div role="status" aria-label="로딩 중" className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0"><div className="space-y-4 animate-pulse"><div className="h-48 bg-gray-100 dark:bg-gray-800 rounded-2xl" /><div className="h-32 bg-gray-100 dark:bg-gray-800 rounded-2xl" /></div></div>;
  if (!lesson) return (
    <div role="alert" className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
      <EmptyState
        icon={GraduationCap}
        title="강좌를 찾을 수 없어요"
        description="삭제되었거나 존재하지 않는 강좌예요"
        action={{ label: '목록으로', href: '/lessons' }}
      />
    </div>
  );

  const SportIcon = SportIconMap[lesson.sportType];
  const filledPercent = (lesson.currentParticipants / lesson.maxParticipants) * 100;
  const activeTicketPlans = lesson.ticketPlans?.filter((plan) => plan.isActive) ?? [];
  const selectedPlan = selectedTicketPlan ?? activeTicketPlans[0] ?? null;
  const selectedPrice = selectedPlan?.price ?? 0;
  const ownedTicket = myTickets.find((ticket) => ticket.lessonId === lesson.id && ticket.status === 'active');
  const lessonImages = getSportDetailImageSet(
    lesson.sportType,
    [...(lesson.imageUrls ?? []), lesson.imageUrl],
    lesson.id,
    4,
  );
  const fallbackLessonImages = getSportDetailImageSet(lesson.sportType, undefined, lesson.id, 4);
  const heroImage = lessonImages[0];
  const heroFallbackImage = fallbackLessonImages[0];
  const galleryImages = lessonImages.slice(1, 4);
  const mediaImageEntries = [heroImage, ...galleryImages].filter((image): image is string => Boolean(image)).map((image, index) => ({
    src: image,
    alt: `강좌 사진 ${index + 1}`,
    fallbackSrc: fallbackLessonImages[index] ?? heroFallbackImage,
  }));

  function openMediaAt(src: string) {
    const index = mediaImageEntries.findIndex((image) => image.src === src);
    if (index < 0) return;
    setMediaIndex(index);
    setShowMediaLightbox(true);
  }

  function handleTicketCheckout(plan: LessonTicketPlan) {
    if (!lesson) return;
    if (isHost) {
      toast('info', '본인이 등록한 강좌의 수강권은 구매할 수 없어요');
      return;
    }
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (ownedTicket) {
      router.push(`/my/lesson-tickets?ticketId=${ownedTicket.id}`);
      return;
    }

    const checkoutParams = new URLSearchParams({
      source: 'lesson',
      ticketPlanId: plan.id,
      lessonId: lesson.id,
      name: `${lesson.title} · ${plan.name}`,
      amount: String(plan.price),
      venue: lesson.venueName ?? '',
    });

    const scheduledAt = buildScheduledAt(lesson.lessonDate, lesson.startTime);
    if (scheduledAt) {
      checkoutParams.set('scheduledAt', scheduledAt);
    }

    router.push(`/payments/checkout?${checkoutParams.toString()}`);
  }

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      <MobileGlassHeader className="gap-3">
        <button onClick={() => router.back()} aria-label="뒤로 가기" className="glass-mobile-icon-button flex items-center justify-center min-h-11 min-w-11 rounded-xl"><ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" /></button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white truncate flex-1">{lesson.title}</h1>
      </MobileGlassHeader>
      <div className="hidden @3xl:flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/lessons" className="hover:text-gray-600">강좌</Link><ChevronRight size={14} /><span className="text-gray-700 dark:text-gray-300">{lesson.title}</span>
      </div>

      <div className="@3xl:grid @3xl:grid-cols-[1fr_380px] @3xl:gap-8">
        <div className="px-5 @3xl:px-0">
          {/* 커버 */}
          <div className="rounded-2xl bg-blue-500 dark:bg-blue-600 h-44 @3xl:h-56 mb-4 overflow-hidden relative">
            {heroImage ? (
              <button
                type="button"
                onClick={() => openMediaAt(heroImage)}
                aria-label={`${lesson.title} 대표 이미지 보기`}
                className="relative h-full w-full"
              >
                <SafeImage
                  src={heroImage}
                  fallbackSrc={heroFallbackImage}
                  alt={lesson.title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 60vw"
                  priority
                />
              </button>
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="text-center text-white/80">
                  {SportIcon && <SportIcon size={48} className="mx-auto mb-2 text-white/60" />}
                </div>
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
            <div className="pointer-events-none absolute bottom-4 left-4">
              <span className="rounded-md px-3 py-1 text-xs font-semibold bg-gray-900/70 text-white">{lessonTypeLabel[lesson.type]}</span>
            </div>
          </div>

          {/* 타이틀 */}
          <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-normal ${typeColor[lesson.type]}`}>{lessonTypeLabel[lesson.type]}</span>
              <span className="text-xs text-gray-500">{sportLabel[lesson.sportType]}</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white leading-tight">{lesson.title}</h2>
            {lesson.description && <p className="mt-3 text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-line">{lesson.description}</p>}
          </div>

          {/* 코치 */}
          {lesson.coachName && (
            <div className="mt-4 rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <h3 className="text-base font-bold tracking-tight text-gray-900 dark:text-white mb-3">코치 소개</h3>
              <div className="flex items-start gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"><User size={28} /></div>
                <div>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{lesson.coachName}</p>
                  {lesson.coachBio && <p className="text-sm text-gray-500 mt-1 leading-relaxed">{lesson.coachBio}</p>}
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                    {typeof lesson.host?.mannerScore === 'number' ? (
                      <span className="flex items-center gap-1">
                        <Star size={12} className="text-amber-400" fill="currentColor" />
                        {lesson.host.mannerScore.toFixed(1)}
                      </span>
                    ) : null}
                    <span>등록 인원 {lesson.currentParticipants}명</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 일정 */}
          <div className="mt-4 grid grid-cols-2 gap-3 @3xl:gap-5">
            <InfoCard icon={<Calendar size={18} />} label="일시" value={formatFullDate(lesson.lessonDate)} sub={`${lesson.startTime} ~ ${lesson.endTime}`} />
            <InfoCard icon={<MapPin size={18} />} label="장소" value={lesson.venueName || '장소 미정'} />
            <InfoCard icon={<Users size={18} />} label="인원" value={`${lesson.currentParticipants}/${lesson.maxParticipants}명`} sub={`${levelLabel[lesson.levelMin]}~${levelLabel[lesson.levelMax]}`} />
            <InfoCard icon={<CreditCard size={18} />} label="수강료" value={formatCurrency(lesson.fee)} />
          </div>

          {/* 상세 안내 */}
          <div className="mt-4 rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen size={18} className="text-gray-500" />
              <h3 className="text-base font-bold tracking-tight text-gray-900 dark:text-white">상세 안내</h3>
            </div>
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed text-gray-500 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400">
              현재 이 강좌는 구조화된 커리큘럼 계약을 제공하지 않아요. 실제 설명, 일정, 수강권 정보만 기준으로 안내합니다.
            </div>
          </div>

          {/* 수강권 선택 */}
          <div id="ticket-plans" className="mt-4">
            <TicketPlanSelector
              plans={lesson.ticketPlans}
              onSelect={(plan) => setSelectedTicketPlan(plan)}
              onPurchase={handleTicketCheckout}
              purchaseDisabled={isHost}
              purchaseDisabledLabel="등록한 강좌는 구매할 수 없어요"
            />
          </div>

          {/* 수업 일정 캘린더 */}
          <div className="mt-4">
            <LessonCalendar schedules={lesson.upcomingSchedules} />
          </div>

          {/* 이런 분께 추천 */}
          <div className="mt-4 rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <h3 className="text-base font-bold tracking-tight text-gray-900 dark:text-white mb-3">이런 분께 추천합니다</h3>
            {[
              `${sportLabel[lesson.sportType]}을(를) 처음 시작하시는 분`,
              '체계적으로 기초를 배우고 싶은 분',
              '같은 레벨의 사람들과 함께 연습하고 싶은 분',
              '전문 코치의 피드백을 받고 싶은 분',
            ].map((text, i) => (
              <div key={i} className="flex items-center gap-2 text-base text-gray-600 dark:text-gray-300 py-1">
                <CheckCircle size={16} className="text-gray-500 dark:text-gray-400 shrink-0" />{text}
              </div>
            ))}
          </div>

          {/* 강좌 사진 */}
          <div className="mt-4 rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <h3 className="text-base font-bold tracking-tight text-gray-900 dark:text-white mb-3">강좌 사진</h3>
            <div className="grid grid-cols-3 gap-2">
              {galleryImages.map((image, index) => (
                <button
                  key={`${image}-${index}`}
                  type="button"
                  onClick={() => openMediaAt(image)}
                  aria-label={`${lesson.title} 이미지 ${index + 2} 보기`}
                  className="relative aspect-square rounded-xl bg-gray-50 dark:bg-gray-700 overflow-hidden"
                >
                  <SafeImage
                    src={image}
                    fallbackSrc={fallbackLessonImages[index + 1] ?? heroFallbackImage}
                    alt={`${lesson.title} 사진 ${index + 2}`}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 33vw, 20vw"
                  />
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-3 text-center">업로드된 사진이 없어도 실사형 로컬 자산으로 미리보기를 제공합니다</p>
          </div>
        </div>

        {/* Right CTA — sidebar-sticky로 전체 오른쪽 컬럼이 sticky */}
        <div className="detail-sidebar px-5 @3xl:px-0 mt-4 @3xl:mt-0">
          <div className="sidebar-sticky space-y-3">
            <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <p className="text-2xl font-black text-gray-900 dark:text-white text-center mb-3">{selectedPlan ? formatAmount(selectedPrice) : formatCurrency(lesson.fee)}</p>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500">참가 현황</span>
                <span className="text-sm font-semibold text-blue-500">{lesson.currentParticipants}/{lesson.maxParticipants}명</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-4">
                <div className="h-full w-full rounded-full bg-blue-500 transition-transform duration-300 origin-left" style={{ transform: `scaleX(${filledPercent / 100})` }} />
              </div>
              {!isAuthenticated ? (
                <Link href="/login" className="block w-full text-center rounded-xl bg-blue-500 py-3.5 text-md font-semibold text-white active:bg-blue-600 hover:bg-blue-600 transition-colors">로그인 후 수강권 선택하기</Link>
              ) : isHost ? (
                <Link
                  href={`/lessons/${lessonId}/edit`}
                  className="block w-full rounded-xl bg-gray-900 py-3.5 text-center text-md font-bold text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
                >
                  강좌 관리하기
                </Link>
              ) : ownedTicket ? (
                <Link
                  href={`/my/lesson-tickets?ticketId=${ownedTicket.id}`}
                  className="block w-full rounded-xl bg-blue-50 py-3.5 text-center text-md font-bold text-blue-600 transition-colors hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-200 dark:hover:bg-blue-900/50"
                >
                  보유한 수강권 보기
                </Link>
              ) : activeTicketPlans.length === 0 ? (
                <button
                  disabled
                  className="w-full rounded-xl bg-gray-100 py-3.5 text-md font-bold text-gray-500 cursor-not-allowed"
                >
                  판매 중인 수강권 없음
                </button>
              ) : isFull ? (
                <button
                  disabled
                  className="w-full rounded-xl bg-gray-100 py-3.5 text-md font-bold text-gray-500 cursor-not-allowed"
                >
                  마감
                </button>
              ) : (
                <button
                  onClick={() => selectedPlan && handleTicketCheckout(selectedPlan)}
                  disabled={!selectedPlan}
                  className="w-full rounded-xl bg-blue-500 py-3.5 text-md font-bold text-white transition-colors hover:bg-blue-600 active:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                >
                  {selectedPlan ? `${selectedPlan.name} 결제하기 · ${formatAmount(selectedPrice)}` : '수강권을 먼저 선택하세요'}
                </button>
              )}

              <button
                onClick={() => {
                  const startDate = new Date(lesson.lessonDate);
                  const [sh, sm] = lesson.startTime.split(':');
                  startDate.setHours(+sh, +sm);
                  const [eh, em] = lesson.endTime.split(':');
                  const endDate = new Date(lesson.lessonDate);
                  endDate.setHours(+eh, +em);
                  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
                  const url = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(lesson.title)}&dates=${fmt(startDate)}/${fmt(endDate)}&location=${encodeURIComponent(lesson.venueName || '')}&details=${encodeURIComponent(lesson.description || '')}`;
                  window.open(url, '_blank');
                }}
                className="w-full mt-2 rounded-xl border border-gray-200 dark:border-gray-600 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-1.5"
              >
                <Calendar size={14} />
                캘린더에 추가
              </button>

              <div className="mt-3 space-y-1.5 text-xs text-gray-500">
                <p className="flex items-center gap-1.5"><CheckCircle size={12} className="text-gray-500" /> 24시간 내 환불 가능</p>
                <p className="flex items-center gap-1.5"><CheckCircle size={12} className="text-gray-500" /> 코치 직접 피드백</p>
              </div>
            </div>

            {/* 등록자 — CTA와 같은 sticky 그룹 안에 */}
            <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">등록자</h3>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-500">{lesson.host?.nickname?.charAt(0) || '?'}</div>
                <div>
                  <p className="text-base font-semibold text-gray-900 dark:text-white">{lesson.host?.nickname}</p>
                  <p className="text-xs text-gray-500">호스트</p>
                </div>
              </div>
            </div>

            {ownedTicket && !isHost ? (
              <TrustSignalBanner
                tone="success"
                label="보유 중"
                title="이미 이 강좌의 수강권을 보유하고 있어요"
                description="결제 완료된 수강권은 내 수강권 화면에서 이용 상태와 유효기간을 계속 확인할 수 있어요."
              />
            ) : activeTicketPlans.length > 0 && !isHost ? (
              <TrustSignalBanner
                tone="info"
                label="실구매 흐름"
                title="선택한 수강권 기준으로 결제가 진행돼요"
                description="이제는 mock plan 대신 lesson detail API가 내려준 실제 ticket plan만 구매할 수 있습니다. 결제 완료 후 내 수강권에서 확인할 수 있어요."
              />
            ) : null}

            {isHost && (
              <Link
                href={`/lessons/${lessonId}/edit`}
                className="flex items-center justify-center gap-2 rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <Pencil size={16} />
                강좌 수정
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="h-24" />

      <MediaLightbox
        isOpen={showMediaLightbox}
        images={mediaImageEntries}
        initialIndex={mediaIndex}
        onClose={() => setShowMediaLightbox(false)}
        title={`${lesson.title} 사진`}
      />
    </div>
  );
}

function InfoCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <div className="flex items-center gap-2 mb-1.5"><span className="text-gray-400 dark:text-gray-500">{icon}</span><span className="text-xs text-gray-500 dark:text-gray-400">{label}</span></div>
      <p className="text-sm font-semibold text-gray-900 dark:text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
