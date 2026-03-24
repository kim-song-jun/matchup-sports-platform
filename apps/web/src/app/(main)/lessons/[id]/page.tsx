'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, MapPin, Users, Star, CreditCard, ChevronRight, User, Clock, CheckCircle, Video, Image, BookOpen, Pencil } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { SportIconMap } from '@/components/icons/sport-icons';
import { CheckoutModal } from '@/components/payment/checkout-modal';
import { useLesson } from '@/hooks/use-api';

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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${weekdays[d.getDay()]})`;
}
function formatCurrency(n: number) { return n === 0 ? '무료' : new Intl.NumberFormat('ko-KR').format(n) + '원'; }

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
  const lessonId = params.id as string;
  const [showCheckout, setShowCheckout] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);

  const { data: lesson, isLoading } = useLesson(lessonId);

  const isHost = user?.id === lesson?.hostId;

  if (isLoading) return <div className="px-5 lg:px-0 pt-[var(--safe-area-top)] lg:pt-0"><div className="space-y-4 animate-pulse"><div className="h-48 bg-gray-100 rounded-2xl" /><div className="h-32 bg-gray-100 rounded-2xl" /></div></div>;
  if (!lesson) return <div className="px-5 lg:px-0 pt-[var(--safe-area-top)] lg:pt-0 text-center py-20"><p className="text-gray-500">강좌를 찾을 수 없습니다</p><Link href="/lessons" className="text-blue-500 text-sm mt-2 inline-block">목록으로</Link></div>;

  const SportIcon = SportIconMap[lesson.sportType];
  const filledPercent = (lesson.currentParticipants / lesson.maxParticipants) * 100;

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0 animate-fade-in">
      <header className="lg:hidden flex items-center gap-3 px-5 py-3 sticky top-0 bg-white/95 backdrop-blur-sm z-10 border-b border-gray-50">
        <button onClick={() => router.back()} aria-label="뒤로 가기" className="flex items-center justify-center min-h-11 min-w-11 rounded-lg -ml-1.5 hover:bg-gray-100 transition-colors"><ArrowLeft size={20} className="text-gray-700" /></button>
        <h1 className="text-[16px] font-semibold text-gray-900 truncate flex-1">{lesson.title}</h1>
      </header>
      <div className="hidden lg:flex items-center gap-2 text-[13px] text-gray-400 mb-6">
        <Link href="/lessons" className="hover:text-gray-600">강좌</Link><ChevronRight size={14} /><span className="text-gray-700">{lesson.title}</span>
      </div>

      <div className="lg:grid lg:grid-cols-[1fr_380px] lg:gap-8">
        <div className="px-5 lg:px-0">
          {/* 커버 */}
          <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 h-44 lg:h-56 flex items-center justify-center mb-4 overflow-hidden">
            <div className="text-center text-white/80">
              {SportIcon && <SportIcon size={48} className="mx-auto mb-2 text-white/60" />}
              <span className="rounded-md px-3 py-1 text-[12px] font-semibold bg-white/20 backdrop-blur-sm">{typeLabel[lesson.type]}</span>
            </div>
          </div>

          {/* 타이틀 */}
          <div className="rounded-2xl bg-white border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${typeColor[lesson.type]}`}>{typeLabel[lesson.type]}</span>
              <span className="text-[12px] text-gray-400">{sportLabel[lesson.sportType]}</span>
            </div>
            <h2 className="text-[22px] font-bold text-gray-900 leading-tight">{lesson.title}</h2>
            {lesson.description && <p className="mt-3 text-[14px] text-gray-600 leading-relaxed whitespace-pre-line">{lesson.description}</p>}
          </div>

          {/* 코치 */}
          {lesson.coachName && (
            <div className="mt-3 rounded-2xl bg-white border border-gray-100 p-5">
              <h3 className="text-[16px] font-bold text-gray-900 mb-4">코치 소개</h3>
              <div className="flex items-start gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500"><User size={28} /></div>
                <div>
                  <p className="text-[17px] font-bold text-gray-900">{lesson.coachName}</p>
                  {lesson.coachBio && <p className="text-[13px] text-gray-500 mt-1 leading-relaxed">{lesson.coachBio}</p>}
                  <div className="flex items-center gap-3 mt-2 text-[12px] text-gray-400">
                    <span className="flex items-center gap-1"><Star size={12} className="text-amber-400" fill="currentColor" /> 4.8</span>
                    <span>수강생 42명</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 일정 */}
          <div className="mt-3 grid grid-cols-2 gap-3 lg:gap-5">
            <InfoCard icon={<Calendar size={16} />} label="일시" value={formatDate(lesson.lessonDate)} sub={`${lesson.startTime} ~ ${lesson.endTime}`} />
            <InfoCard icon={<MapPin size={16} />} label="장소" value={lesson.venueName || '장소 미정'} />
            <InfoCard icon={<Users size={16} />} label="인원" value={`${lesson.currentParticipants}/${lesson.maxParticipants}명`} sub={`${levelLabel[lesson.levelMin]}~${levelLabel[lesson.levelMax]}`} />
            <InfoCard icon={<CreditCard size={16} />} label="수강료" value={formatCurrency(lesson.fee)} />
          </div>

          {/* 커리큘럼 */}
          <div className="mt-3 rounded-2xl bg-white border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen size={18} className="text-blue-500" />
              <h3 className="text-[16px] font-bold text-gray-900">커리큘럼</h3>
              <span className="text-[12px] text-gray-400 ml-auto">총 {sampleCurriculum.length}개 섹션</span>
            </div>
            {sampleCurriculum.map((item, idx) => (
              <div key={idx} className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-500 text-[12px] font-bold mt-0.5">{idx + 1}</div>
                <div className="flex-1">
                  <p className="text-[14px] font-semibold text-gray-900">{item.title}</p>
                  <p className="text-[13px] text-gray-400 mt-0.5">{item.desc}</p>
                </div>
                <span className="text-[12px] text-gray-400 shrink-0 mt-0.5"><Clock size={12} className="inline mr-0.5" />{item.duration}</span>
              </div>
            ))}
          </div>

          {/* 이런 분께 추천 */}
          <div className="mt-3 rounded-2xl bg-white border border-gray-100 p-5">
            <h3 className="text-[16px] font-bold text-gray-900 mb-3">이런 분께 추천합니다</h3>
            {[
              `${sportLabel[lesson.sportType]}을(를) 처음 시작하시는 분`,
              '체계적으로 기초를 배우고 싶은 분',
              '같은 레벨의 사람들과 함께 연습하고 싶은 분',
              '전문 코치의 피드백을 받고 싶은 분',
            ].map((text, i) => (
              <div key={i} className="flex items-center gap-2 text-[14px] text-gray-600 py-1">
                <CheckCircle size={16} className="text-blue-500 shrink-0" />{text}
              </div>
            ))}
          </div>

          {/* 강좌 사진 */}
          <div className="mt-3 rounded-2xl bg-white border border-gray-100 p-5">
            <h3 className="text-[16px] font-bold text-gray-900 mb-4">강좌 사진</h3>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="aspect-square rounded-xl bg-gray-50 flex items-center justify-center text-gray-300"><Image size={20} /></div>
              ))}
            </div>
            <p className="text-[12px] text-gray-400 mt-3 text-center">아직 등록된 사진이 없습니다</p>
          </div>
        </div>

        {/* Right CTA — sidebar-sticky로 전체 오른쪽 컬럼이 sticky */}
        <div className="detail-sidebar px-5 lg:px-0 mt-4 lg:mt-0">
          <div className="sidebar-sticky space-y-3">
            <div className="rounded-2xl bg-white border border-gray-100 p-5">
              <p className="text-[24px] font-black text-gray-900 text-center mb-3">{formatCurrency(lesson.fee)}</p>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px] text-gray-500">참가 현황</span>
                <span className="text-[13px] font-semibold text-blue-500">{lesson.currentParticipants}/{lesson.maxParticipants}명</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-4">
                <div className="h-full rounded-full bg-blue-500 transition-all duration-700" style={{ width: `${filledPercent}%` }} />
              </div>
              {!isAuthenticated ? (
                <Link href="/login" className="block w-full text-center rounded-xl bg-gray-900 py-3.5 text-[15px] font-semibold text-white active:bg-gray-800 transition-colors">로그인 후 신청하기</Link>
              ) : (
                <button
                  onClick={() => {
                    if (lesson.fee > 0) {
                      setIsEnrolling(true);
                      setShowCheckout(true);
                      setTimeout(() => setIsEnrolling(false), 500);
                    }
                  }}
                  disabled={isEnrolling}
                  className="w-full rounded-xl bg-blue-500 py-3.5 text-[15px] font-semibold text-white hover:bg-blue-600 active:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {isEnrolling ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      처리 중...
                    </span>
                  ) : (
                    `수강 신청하기 ${lesson.fee > 0 ? `· ${formatCurrency(lesson.fee)}` : ''}`
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
                className="w-full mt-2 rounded-xl border border-gray-200 py-2.5 text-[13px] font-medium text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
              >
                <Calendar size={14} />
                캘린더에 추가
              </button>

              <div className="mt-3 space-y-1.5 text-[12px] text-gray-400">
                <p className="flex items-center gap-1.5"><CheckCircle size={12} className="text-green-500" /> 24시간 내 환불 가능</p>
                <p className="flex items-center gap-1.5"><CheckCircle size={12} className="text-green-500" /> 코치 직접 피드백</p>
              </div>
            </div>

            {/* 등록자 — CTA와 같은 sticky 그룹 안에 */}
            <div className="rounded-2xl bg-white border border-gray-100 p-4">
              <h3 className="text-[14px] font-semibold text-gray-900 mb-3">등록자</h3>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-500">{lesson.host?.nickname?.charAt(0) || '?'}</div>
                <div>
                  <p className="text-[14px] font-semibold text-gray-900">{lesson.host?.nickname}</p>
                  <p className="text-[12px] text-gray-400">호스트</p>
                </div>
              </div>
            </div>

            {isHost && (
              <Link
                href={`/lessons/${lessonId}/edit`}
                className="flex items-center justify-center gap-2 rounded-2xl bg-white border border-gray-100 p-4 text-[14px] font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Pencil size={16} />
                강좌 수정
              </Link>
            )}
          </div>
        </div>
      </div>
      <div className="h-8" />

      {/* 결제 모달 */}
      {showCheckout && lesson && (
        <CheckoutModal
          isOpen={showCheckout}
          onClose={() => setShowCheckout(false)}
          amount={lesson.fee}
          itemName={lesson.title}
          orderId={`lesson-${lessonId}-${Date.now()}`}
          onSuccess={() => {
            setShowCheckout(false);
          }}
          onError={() => {
            setShowCheckout(false);
          }}
        />
      )}
    </div>
  );
}

function InfoCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white border border-gray-100 p-3.5">
      <div className="flex items-center gap-2 mb-1.5">{icon}<span className="text-[12px] text-gray-400">{label}</span></div>
      <p className="text-[15px] font-semibold text-gray-900">{value}</p>
      {sub && <p className="text-[12px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
