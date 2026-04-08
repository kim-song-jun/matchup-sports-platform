'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, MapPin, Users, Star, CreditCard, ChevronRight, User, Clock, CheckCircle, BookOpen, Pencil, GraduationCap } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { SafeImage } from '@/components/ui/safe-image';
import { TrustSignalBanner } from '@/components/ui/trust-signal-banner';
import { useAuthStore } from '@/stores/auth-store';
import { MediaLightbox } from '@/components/ui/media-lightbox';
import { SportIconMap } from '@/components/icons/sport-icons';
import { useLesson } from '@/hooks/use-api';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sportLabel, lessonTypeLabel, levelLabel } from '@/lib/constants';
import { getSportDetailImageSet } from '@/lib/sport-image';
import { formatFullDate, formatCurrency } from '@/lib/utils';
import { TicketPlanSelector } from '@/components/lesson/ticket-plan-selector';
import { LessonCalendar } from '@/components/lesson/lesson-calendar';
import type { LessonTicketPlan, LessonSchedule } from '@/types/api';
const typeColor: Record<string, string> = {
  group_lesson: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300', practice_match: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
  free_practice: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300', clinic: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
};

const sampleCurriculum = [
  { title: '오리엔테이션', desc: '기초 스트레칭 및 장비 점검', duration: '15분' },
  { title: '기본기 훈련', desc: '핵심 동작 반복 훈련', duration: '30분' },
  { title: '실전 연습', desc: '실전 상황 시뮬레이션', duration: '30분' },
  { title: '피드백 & 정리', desc: '개인별 피드백 및 다음 목표 설정', duration: '15분' },
];

export default function LessonDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const lessonId = params.id as string;
  const [selectedTicketPlan, setSelectedTicketPlan] = useState<LessonTicketPlan | null>(null);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [showMediaLightbox, setShowMediaLightbox] = useState(false);

  const { data: lesson, isLoading } = useLesson(lessonId);

  const enrollMutation = useMutation({
    mutationFn: () => api.post(`/lessons/${lessonId}/enroll`) as Promise<unknown>,
    onSuccess: () => {
      toast('success', '수강 신청 완료! 강좌에서 만나요');
      queryClient.invalidateQueries({ queryKey: ['lessons', lessonId] });
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast('error', axiosErr?.response?.data?.message || '수강 신청에 실패했어요. 잠시 후 다시 시도해주세요');
    },
  });

  const isHost = user?.id === lesson?.hostId;
  const isEnrolled = !!(lesson?.participants?.some((p) => p.userId === user?.id));
  const isFull = !!(lesson && lesson.currentParticipants >= lesson.maxParticipants);
  const selectedPrice = selectedTicketPlan?.price ?? lesson?.fee ?? 0;
  const requiresPayment = selectedPrice > 0;

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

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      <header className="@3xl:hidden flex items-center gap-3 px-5 py-3 sticky top-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm z-10 border-b border-gray-50 dark:border-gray-800">
        <button onClick={() => router.back()} aria-label="뒤로 가기" className="flex items-center justify-center min-h-11 min-w-11 rounded-xl -ml-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" /></button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white truncate flex-1">{lesson.title}</h1>
      </header>
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
                className="h-full w-full"
              >
                <SafeImage
                  src={heroImage}
                  fallbackSrc={heroFallbackImage}
                  alt={lesson.title}
                  className="h-full w-full object-cover"
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
              <span className="rounded-md px-3 py-1 text-xs font-semibold bg-white/20 text-white backdrop-blur-sm">{lessonTypeLabel[lesson.type]}</span>
            </div>
          </div>

          {/* 타이틀 */}
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-normal ${typeColor[lesson.type]}`}>{lessonTypeLabel[lesson.type]}</span>
              <span className="text-xs text-gray-500">{sportLabel[lesson.sportType]}</span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">{lesson.title}</h2>
            {lesson.description && <p className="mt-3 text-base text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-line">{lesson.description}</p>}
          </div>

          {/* 코치 */}
          {lesson.coachName && (
            <div className="mt-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">코치 소개</h3>
              <div className="flex items-start gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"><User size={28} /></div>
                <div>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{lesson.coachName}</p>
                  {lesson.coachBio && <p className="text-sm text-gray-500 mt-1 leading-relaxed">{lesson.coachBio}</p>}
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><Star size={12} className="text-amber-400" fill="currentColor" /> 4.8</span>
                    <span>수강생 42명</span>
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

          {/* 커리큘럼 */}
          <div className="mt-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen size={18} className="text-gray-500" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">커리큘럼</h3>
              <span className="text-xs text-gray-500 ml-auto">총 {sampleCurriculum.length}개 섹션</span>
            </div>
            {sampleCurriculum.map((item, idx) => (
              <div key={idx} className="flex items-start gap-3 py-3 border-b border-gray-50 dark:border-gray-700 last:border-0">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs font-bold mt-0.5">{idx + 1}</div>
                <div className="flex-1">
                  <p className="text-base font-semibold text-gray-900 dark:text-white">{item.title}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{item.desc}</p>
                </div>
                <span className="text-xs text-gray-500 shrink-0 mt-0.5"><Clock size={12} className="inline mr-0.5" />{item.duration}</span>
              </div>
            ))}
          </div>

          {/* 수강권 선택 */}
          <div className="mt-4">
            <TicketPlanSelector
              plans={lesson.ticketPlans}
              onSelect={(plan) => setSelectedTicketPlan(plan)}
              onPurchase={(plan) => {
                setSelectedTicketPlan(plan);
                if (plan.price > 0) {
                  toast('info', '유료 수강권 결제는 아직 준비 중이에요');
                } else {
                  enrollMutation.mutate();
                }
              }}
            />
          </div>

          {/* 수업 일정 캘린더 */}
          <div className="mt-4">
            <LessonCalendar
              schedules={lesson.upcomingSchedules as LessonSchedule[] | undefined}
              onReserve={(scheduleId) => {
                if (!isAuthenticated) {
                  toast('info', '로그인 후 예약할 수 있어요');
                  return;
                }
                toast('info', `수업 예약 기능을 준비 중이에요 (scheduleId: ${scheduleId})`);
              }}
            />
          </div>

          {/* 이런 분께 추천 */}
          <div className="mt-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">이런 분께 추천합니다</h3>
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
          <div className="mt-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">강좌 사진</h3>
            <div className="grid grid-cols-3 gap-2">
              {galleryImages.map((image, index) => (
                <button
                  key={`${image}-${index}`}
                  type="button"
                  onClick={() => openMediaAt(image)}
                  aria-label={`${lesson.title} 이미지 ${index + 2} 보기`}
                  className="aspect-square rounded-xl bg-gray-50 dark:bg-gray-700 overflow-hidden"
                >
                  <SafeImage
                    src={image}
                    fallbackSrc={fallbackLessonImages[index + 1] ?? heroFallbackImage}
                    alt={`${lesson.title} 사진 ${index + 2}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
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
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
              <p className="text-2xl font-black text-gray-900 dark:text-white text-center mb-3">{formatCurrency(lesson.fee)}</p>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500">참가 현황</span>
                <span className="text-sm font-semibold text-blue-500">{lesson.currentParticipants}/{lesson.maxParticipants}명</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-4">
                <div className="h-full w-full rounded-full bg-blue-500 transition-transform duration-300 origin-left" style={{ transform: `scaleX(${filledPercent / 100})` }} />
              </div>
              {!isAuthenticated ? (
                <Link href="/login" className="block w-full text-center rounded-xl bg-blue-500 py-3.5 text-md font-semibold text-white active:bg-blue-600 hover:bg-blue-600 transition-colors">로그인 후 신청하기</Link>
              ) : isEnrolled ? (
                <div className="space-y-1.5">
                  <button
                    onClick={() => {
                      toast('info', '수강 취소는 결제 내역에서 환불 신청해주세요');
                    }}
                    className="w-full rounded-xl bg-red-50 border border-red-200 py-3.5 text-md font-bold text-red-500 hover:bg-red-100 active:bg-red-200 transition-colors"
                  >
                    수강 취소
                  </button>
                  <Link href="/payments" className="block text-center text-xs text-gray-400 hover:text-blue-500 transition-colors py-0.5">
                    결제 내역 →
                  </Link>
                </div>
              ) : isFull ? (
                <button
                  disabled
                  className="w-full rounded-xl bg-gray-100 py-3.5 text-md font-bold text-gray-500 cursor-not-allowed"
                >
                  마감
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (!requiresPayment) {
                      enrollMutation.mutate();
                    }
                  }}
                  disabled={enrollMutation.isPending || requiresPayment}
                  className={`w-full rounded-xl py-3.5 text-md font-bold transition-colors disabled:opacity-50 ${
                    requiresPayment
                      ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700'
                  }`}
                >
                  {enrollMutation.isPending ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      처리 중...
                    </span>
                  ) : (
                    requiresPayment ? '유료 수강권 준비 중' : `수강 신청하기 ${lesson.fee > 0 ? `· ${formatCurrency(lesson.fee)}` : ''}`
                  )}
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
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">등록자</h3>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-500">{lesson.host?.nickname?.charAt(0) || '?'}</div>
                <div>
                  <p className="text-base font-semibold text-gray-900 dark:text-white">{lesson.host?.nickname}</p>
                  <p className="text-xs text-gray-500">호스트</p>
                </div>
              </div>
            </div>

            {requiresPayment && !isHost && !isEnrolled && (
              <TrustSignalBanner
                tone="warning"
                label="결제 준비 중"
                title="유료 강좌 결제는 아직 연결되지 않았어요"
                description="강좌/수강권 구매는 결제와 좌석 확정이 아직 백엔드와 연결되지 않았습니다. 가짜 성공 없이 신청 버튼이 비활성화됩니다."
              />
            )}

            {isHost && (
              <Link
                href={`/lessons/${lessonId}/edit`}
                className="flex items-center justify-center gap-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <Pencil size={16} />
                강좌 수정
              </Link>
            )}
          </div>
        </div>
      </div>

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
    <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3.5">
      <div className="flex items-center gap-2 mb-1.5"><span className="text-gray-400 dark:text-gray-500">{icon}</span><span className="text-xs text-gray-500 dark:text-gray-400">{label}</span></div>
      <p className="text-md font-semibold text-gray-900 dark:text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
