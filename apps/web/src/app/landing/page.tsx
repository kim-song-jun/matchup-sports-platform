'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { Target, Shield, Users, Zap, ChevronDown, Star, ArrowRight, Sparkles, Frown, SearchX, UserX, Check } from 'lucide-react';
import { SportIconMap } from '@/components/icons/sport-icons';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { CountUp } from '@/components/landing/count-up';
import { LandingNav } from '@/components/landing/landing-nav';
import { LandingFooter } from '@/components/landing/landing-footer';

/* ── Data ── */

const SPORTS = [
  { key: 'soccer', name: '축구', bg: 'bg-green-50', iconColor: 'text-green-600' },
  { key: 'futsal', name: '풋살', bg: 'bg-blue-50', iconColor: 'text-blue-500' },
  { key: 'basketball', name: '농구', bg: 'bg-amber-50', iconColor: 'text-amber-600' },
  { key: 'badminton', name: '배드민턴', bg: 'bg-cyan-50', iconColor: 'text-cyan-600' },
  { key: 'tennis', name: '테니스', bg: 'bg-red-50', iconColor: 'text-red-500' },
  { key: 'baseball', name: '야구', bg: 'bg-orange-50', iconColor: 'text-orange-600' },
  { key: 'volleyball', name: '배구', bg: 'bg-indigo-50', iconColor: 'text-indigo-500' },
  { key: 'swimming', name: '수영', bg: 'bg-sky-50', iconColor: 'text-sky-600' },
  { key: 'ice_hockey', name: '아이스하키', bg: 'bg-blue-50', iconColor: 'text-blue-600' },
  { key: 'figure_skating', name: '피겨', bg: 'bg-purple-50', iconColor: 'text-purple-500' },
  { key: 'short_track', name: '쇼트트랙', bg: 'bg-slate-50', iconColor: 'text-slate-600' },
];

const SUB_FEATURES = [
  { icon: Users, title: '팀 매칭', description: '팀 실력을 정밀 측정하고, 균형 잡힌 상대를 매칭해드려요.', iconBg: 'bg-blue-500' },
  { icon: Shield, title: '신뢰 시스템', description: '3단계 허위 방지와 6항목 상호 평가로 매너 있는 환경을 보장해요.', iconBg: 'bg-blue-500' },
  { icon: Zap, title: '올인원', description: '매칭, 채팅, 결제, 용병, 장터까지 — 모든 것을 한 곳에서.', iconBg: 'bg-blue-500' },
];

const STEPS = [
  { num: 1, title: '프로필 만들기', description: '종목, 실력 레벨, 활동 지역을 설정하면 준비 완료.' },
  { num: 2, title: '매치 참가', description: 'AI가 추천하는 최적의 매치에 참가하거나 직접 만드세요.' },
  { num: 3, title: '평가하고 성장하기', description: '경기 후 상호 평가를 하면 AI가 더 정확해지고, ELO와 뱃지가 쌓여요.' },
];

const TESTIMONIALS = [
  { quote: '3개월간 47경기를 매칭 받았는데, 실력 차이로 재미없었던 경기가 단 한 번도 없었어요.', author: '김민수', detail: '축구 B등급 · 47경기', rating: 5, sport: 'soccer' },
  { quote: '노쇼 때문에 경기가 무산된 적이 많았는데, 매너 점수 시스템 도입 후 노쇼율이 거의 0%예요.', author: '이수진', detail: '풋살 A등급 팀장 · FC 번개', rating: 5, sport: 'futsal' },
  { quote: '퇴근 후 배드민턴 파트너 찾기가 제일 힘들었는데, 이제 평균 3분이면 매칭돼요.', author: '박지영', detail: '배드민턴 C등급 · 32경기', rating: 4, sport: 'badminton' },
];

const STATS = [
  { value: '2,400+', label: '매칭 완료' },
  { value: '520+', label: '활성 팀' },
  { value: '4.8', label: '평균 만족도' },
  { value: '98%', label: '재매칭률' },
];

/* ── Component ── */

export default function LandingPage() {
  const featuresRef = useRef<HTMLDivElement>(null);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 overflow-x-hidden">

      <LandingNav />

      {/* ── Hero — 화이트 베이스, 텍스트 중심 ── */}
      <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-28 lg:pt-48 lg:pb-36">
        <div className="max-w-[1100px] mx-auto px-5">
          <div className="max-w-[680px] mx-auto text-center">
            {/* Badge */}
            <ScrollReveal delay={0}>
              <div className="inline-flex items-center gap-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[13px] font-semibold px-4 py-2 rounded-full mb-8">
                <Sparkles size={14} />
                11개 종목 · 2,400+ 매칭 완료
              </div>
            </ScrollReveal>

            {/* Heading */}
            <ScrollReveal delay={100}>
              <h1 className="text-[32px] sm:text-[44px] lg:text-[56px] font-black text-gray-900 dark:text-white leading-[1.15] tracking-tight mb-6">
                내 수준에 딱 맞는
                <br />
                운동 메이트를{' '}
                <span className="text-blue-500">AI가 찾아드려요</span>
              </h1>
            </ScrollReveal>

            {/* Subtitle */}
            <ScrollReveal delay={200}>
              <p className="text-[17px] lg:text-[18px] text-gray-500 dark:text-gray-400 mb-10 leading-relaxed max-w-[480px] mx-auto">
                실력·위치·매너를 종합 분석해서
                <br className="hidden sm:block" />
                딱 맞는 상대와 매칭해드려요.
              </p>
            </ScrollReveal>

            {/* CTA */}
            <ScrollReveal delay={300}>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link href="/login" className="inline-flex items-center justify-center gap-2.5 bg-blue-500 text-white font-bold rounded-2xl px-8 py-4 text-[16px] hover:bg-blue-600 hover:shadow-xl hover:shadow-blue-500/20 active:scale-[0.97] transition-all duration-200 shadow-lg shadow-blue-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400">
                  무료로 시작하기
                  <ArrowRight size={18} strokeWidth={2.5} />
                </Link>
                <button onClick={() => featuresRef.current?.scrollIntoView({ behavior: 'smooth' })} className="inline-flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400 rounded-xl px-6 py-3.5 text-[15px] font-semibold hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-[0.97] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400">
                  더 알아보기
                  <ChevronDown size={18} />
                </button>
              </div>
            </ScrollReveal>
          </div>
        </div>

        {/* 배경 장식 — 은은한 그라데이션 원 */}
        <div className="absolute top-20 -right-32 w-[500px] h-[500px] bg-blue-100/40 dark:bg-blue-900/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-32 w-[400px] h-[400px] bg-blue-100/30 dark:bg-blue-900/10 rounded-full blur-3xl pointer-events-none" />
      </section>

      {/* ── Stats ── */}
      <section className="pb-16 sm:pb-20">
        <div className="mx-5 lg:mx-auto lg:max-w-[800px]">
          <ScrollReveal>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg shadow-gray-900/5 dark:shadow-black/20 grid grid-cols-2 sm:grid-cols-4 divide-x divide-gray-100 dark:divide-gray-700 border border-gray-100 dark:border-gray-700">
              {STATS.map((stat) => (
                <div key={stat.label} className="px-5 py-6 sm:px-6 sm:py-7 text-center">
                  <CountUp value={stat.value} className="text-[26px] font-black text-gray-900 dark:text-white leading-none block" />
                  <div className="text-[12px] text-gray-500 mt-2 font-medium">{stat.label}</div>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Pain Points ── */}
      <section className="pb-20 sm:pb-24">
        <div className="max-w-[800px] mx-auto px-5">
          <ScrollReveal>
            <div className="text-center">
              <h2 className="text-[22px] lg:text-[28px] font-bold text-gray-900 dark:text-white tracking-tight leading-tight mb-10">
                이런 경험, 있지 않나요?
              </h2>
              <div className="grid sm:grid-cols-3 gap-4">
                {([
                  { icon: Frown, text: '실력 차이가 너무 커서 재미없는 경기', color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20' },
                  { icon: SearchX, text: '매번 상대 찾기가 힘든 주말', color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
                  { icon: UserX, text: '약속했는데 노쇼 당한 경험', color: 'text-gray-500', bg: 'bg-gray-100 dark:bg-gray-700' },
                ] as const).map((pain) => (
                  <div key={pain.text} className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700 text-center">
                    <div className={`h-12 w-12 rounded-xl ${pain.bg} flex items-center justify-center mx-auto mb-4`}>
                      <pain.icon size={22} className={pain.color} />
                    </div>
                    <p className="text-[14px] text-gray-600 dark:text-gray-400 leading-relaxed font-medium">{pain.text}</p>
                  </div>
                ))}
              </div>
              <p className="mt-10 text-[16px] text-gray-500 dark:text-gray-400">
                TeamMeet이 이 문제를 <span className="text-blue-500 font-semibold">기술로 해결</span>합니다.
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Features ── */}
      <section ref={featuresRef} className="py-24 sm:py-32 bg-gray-50 dark:bg-gray-800/30">
        <div className="max-w-[1100px] mx-auto px-5">
          <ScrollReveal>
            <div className="text-center mb-16">
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full mb-4">
                <Target size={13} /> 주요 기능
              </span>
              <h2 className="text-[26px] lg:text-[36px] font-bold text-gray-900 dark:text-white tracking-tight leading-tight">
                스포츠 매칭, 이렇게 달라집니다
              </h2>
            </div>
          </ScrollReveal>

          {/* AI 매칭 히어로 카드 */}
          <ScrollReveal className="mb-6">
            <div className="bg-gray-900 dark:bg-gray-800 rounded-2xl p-8 lg:p-10 text-white hover:shadow-xl transition-all duration-300 lg:flex lg:items-center lg:gap-10">
              <div className="flex-1">
                <div className="inline-flex items-center gap-2 bg-blue-500/20 text-blue-300 text-[12px] font-semibold px-3 py-1 rounded-full mb-4">
                  <Target size={13} /> 핵심 기능
                </div>
                <h3 className="text-[22px] lg:text-[26px] font-bold mb-3">AI 매칭</h3>
                <p className="text-[15px] text-gray-400 leading-relaxed max-w-[400px]">
                  실력, 위치, 시간, 매너 점수를 종합 분석해 나와 가장 잘 맞는 상대를 자동으로 찾아드려요. 경기할수록 AI가 더 정확해집니다.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {['실력 분석', '위치 매칭', '매너 필터', 'ELO 반영'].map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 text-[12px] text-gray-400 bg-white/5 px-2.5 py-1 rounded-lg">
                      <Check size={12} className="text-blue-400" /> {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-6 lg:mt-0 shrink-0">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5 w-[220px]">
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="h-9 w-9 rounded-full bg-blue-500/30 flex items-center justify-center text-[13px] font-bold text-blue-300">K</div>
                    <div>
                      <div className="text-[13px] font-semibold text-white">김민수</div>
                      <div className="text-[12px] text-gray-500">축구 · B등급</div>
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    <div><div className="flex justify-between text-[12px] text-gray-500 mb-1"><span>실력 매칭</span><span className="text-blue-400 font-semibold">94%</span></div><div className="h-1.5 rounded-full bg-white/5"><div className="h-full rounded-full bg-blue-500 w-[94%]" /></div></div>
                    <div><div className="flex justify-between text-[12px] text-gray-500 mb-1"><span>매너 점수</span><span className="text-green-400 font-semibold">98%</span></div><div className="h-1.5 rounded-full bg-white/5"><div className="h-full rounded-full bg-green-500 w-[98%]" /></div></div>
                    <div><div className="flex justify-between text-[12px] text-gray-500 mb-1"><span>거리</span><span className="text-amber-400 font-semibold">2.1km</span></div><div className="h-1.5 rounded-full bg-white/5"><div className="h-full rounded-full bg-amber-500 w-[85%]" /></div></div>
                  </div>
                  <div className="mt-4 text-center text-[12px] font-bold text-blue-400 bg-blue-500/10 rounded-lg py-2">매칭 적합도 96%</div>
                </div>
              </div>
            </div>
          </ScrollReveal>

          {/* 나머지 기능 */}
          <div className="grid sm:grid-cols-3 gap-5">
            {SUB_FEATURES.map((f, idx) => {
              const Icon = f.icon;
              return (
                <ScrollReveal key={f.title} delay={idx * 100}>
                  <div className="group bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700 hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 h-full">
                    <div className={`h-12 w-12 rounded-xl ${f.iconBg} flex items-center justify-center mb-5 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                      <Icon size={22} className="text-white" />
                    </div>
                    <h3 className="text-[17px] font-bold text-gray-900 dark:text-white mb-2">{f.title}</h3>
                    <p className="text-[14px] text-gray-500 dark:text-gray-400 leading-relaxed">{f.description}</p>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="py-20 sm:py-28">
        <div className="max-w-[960px] mx-auto px-5">
          <ScrollReveal>
            <div className="text-center mb-12">
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full mb-4">
                이용 방법
              </span>
              <h2 className="text-[26px] lg:text-[36px] font-bold text-gray-900 dark:text-white tracking-tight leading-tight">
                3단계로 시작하세요
              </h2>
            </div>
          </ScrollReveal>

          {/* Mobile */}
          <ScrollReveal className="lg:hidden">
            <div className="space-y-0">
              {STEPS.map((step, idx) => (
                <div key={step.num} className="relative flex gap-5">
                  <div className="flex flex-col items-center">
                    <div className="h-11 w-11 rounded-full bg-blue-500 text-white font-bold flex items-center justify-center text-[15px] shrink-0 z-10 shadow-lg shadow-blue-500/25">
                      {step.num}
                    </div>
                    {idx < STEPS.length - 1 && (
                      <div className="w-0.5 flex-1 bg-gradient-to-b from-blue-200 to-transparent dark:from-blue-700 my-2" />
                    )}
                  </div>
                  <div className={idx === STEPS.length - 1 ? 'pb-0' : 'pb-10'}>
                    <h3 className="text-[16px] font-bold text-gray-900 dark:text-white mb-1">{step.title}</h3>
                    <p className="text-[14px] text-gray-500 dark:text-gray-400 leading-relaxed">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollReveal>

          {/* Desktop */}
          <div className="hidden lg:grid lg:grid-cols-3 lg:gap-8 relative">
            <div className="absolute top-[22px] left-[calc(16.67%+22px)] right-[calc(16.67%+22px)] h-0.5 bg-gradient-to-r from-blue-200 via-blue-300 to-blue-200 dark:from-blue-700 dark:via-blue-600 dark:to-blue-700" />
            {STEPS.map((step, idx) => (
              <ScrollReveal key={step.num} delay={idx * 200}>
                <div className="text-center relative">
                  <div className="h-11 w-11 rounded-full bg-blue-500 text-white font-bold flex items-center justify-center text-[15px] mx-auto mb-5 relative z-10 ring-4 ring-white dark:ring-gray-900 shadow-lg shadow-blue-500/25">
                    {step.num}
                  </div>
                  <h3 className="text-[18px] font-bold text-gray-900 dark:text-white mb-2">{step.title}</h3>
                  <p className="text-[14px] text-gray-500 dark:text-gray-400 leading-relaxed max-w-[260px] mx-auto">{step.description}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Sports ── */}
      <section className="py-20 sm:py-28 bg-gray-50 dark:bg-gray-800/30">
        <div className="max-w-[960px] mx-auto px-5">
          <ScrollReveal>
            <div className="text-center mb-10">
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full mb-4">
                지원 종목
              </span>
              <h2 className="text-[26px] lg:text-[36px] font-bold text-gray-900 dark:text-white tracking-tight leading-tight">
                11개 종목, 하나의 플랫폼
              </h2>
            </div>
          </ScrollReveal>

          {/* Mobile */}
          <div className="lg:hidden">
            <div className="flex overflow-x-auto gap-3 pb-4 -mx-5 px-5 scrollbar-hide">
              {SPORTS.map((sport) => {
                const Icon = SportIconMap[sport.key];
                return (
                  <div key={sport.key} className="shrink-0 w-[88px] bg-white dark:bg-gray-800 rounded-2xl p-3.5 border border-gray-100 dark:border-gray-700 flex flex-col items-center gap-2.5 active:scale-[0.95] transition-transform duration-200">
                    <div className={`w-12 h-12 rounded-xl ${sport.bg} flex items-center justify-center`}>
                      {Icon && <Icon size={24} className={sport.iconColor} />}
                    </div>
                    <span className="text-[12px] font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">{sport.name}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Desktop */}
          <ScrollReveal className="hidden lg:block">
            <div className="flex flex-wrap justify-center gap-3 max-w-[760px] mx-auto">
              {SPORTS.map((sport) => {
                const Icon = SportIconMap[sport.key];
                return (
                  <div key={sport.key} className="w-[108px] bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 flex flex-col items-center gap-2.5 hover:shadow-lg hover:-translate-y-1 hover:border-blue-200 dark:hover:border-blue-800 transition-all duration-300 cursor-default">
                    <div className={`w-11 h-11 rounded-xl ${sport.bg} flex items-center justify-center`}>
                      {Icon && <Icon size={22} className={sport.iconColor} />}
                    </div>
                    <span className="text-[12px] font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">{sport.name}</span>
                  </div>
                );
              })}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="py-24 sm:py-32">
        <div className="max-w-[1080px] mx-auto px-5">
          <ScrollReveal>
            <div className="text-center mb-12">
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full mb-4">
                사용자 후기
              </span>
              <h2 className="text-[26px] lg:text-[36px] font-bold text-gray-900 dark:text-white tracking-tight leading-tight">
                이미 많은 선수들이 경험하고 있어요
              </h2>
              <p className="text-[14px] text-gray-500 mt-3">평균 만족도 <span className="text-amber-500 font-semibold">4.8</span> / 5.0 · 리뷰 <span className="font-semibold text-gray-600 dark:text-gray-300">340</span>건</p>
            </div>
          </ScrollReveal>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, idx) => {
              const SportIcon = SportIconMap[t.sport];
              return (
                <ScrollReveal key={t.author} delay={idx * 120}>
                  <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 h-full flex flex-col">
                    <div className="flex gap-0.5 mb-4" role="img" aria-label={`${t.rating}점 만점`}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} size={14} className={i < t.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200 dark:text-gray-600'} aria-hidden="true" />
                      ))}
                    </div>
                    <p className="text-[15px] text-gray-700 dark:text-gray-300 leading-relaxed flex-1 mb-5">
                      &ldquo;{t.quote}&rdquo;
                    </p>
                    <div className="flex items-center gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                      <div className="h-10 w-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                        {SportIcon ? <SportIcon size={18} className="text-gray-500 dark:text-gray-400" /> : <span className="text-[13px] font-bold text-gray-500">{t.author.charAt(0)}</span>}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white text-[14px]">{t.author}</p>
                        <p className="text-[12px] text-gray-500">{t.detail}</p>
                      </div>
                    </div>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative overflow-hidden bg-gray-900 dark:bg-black">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(49,130,246,0.12),transparent_60%)]" />
        <div className="relative max-w-[600px] mx-auto px-5 py-20 sm:py-28 text-center">
          <ScrollReveal>
            <p className="text-[14px] text-blue-400 font-semibold mb-4">가입은 3초, 첫 매칭은 무료</p>
            <h2 className="text-[28px] lg:text-[36px] font-black text-white mb-6 tracking-tight leading-tight">
              운동이 더 즐거워지는 경험,
              <br />
              지금 시작하세요
            </h2>
            <p className="text-[15px] lg:text-[17px] text-gray-400 mb-10 leading-relaxed">
              내 수준에 맞는 상대를 AI가 찾아드려요.
              <br className="hidden sm:block" />
              경기할수록 더 정확해지는 스마트 매칭.
            </p>
            <Link href="/login" className="inline-flex items-center justify-center gap-2.5 bg-blue-500 text-white font-bold px-8 py-4 rounded-2xl text-[16px] hover:bg-blue-400 hover:shadow-xl hover:shadow-blue-500/30 active:scale-[0.97] transition-all duration-200 shadow-lg shadow-blue-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400">
              무료로 시작하기
              <ArrowRight size={18} strokeWidth={2.5} />
            </Link>
          </ScrollReveal>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
