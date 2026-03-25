'use client';

import { useRef, useEffect, useState } from 'react';
import Link from 'next/link';
import { Target, Shield, Users, Zap, ChevronDown, Star, ArrowRight, Quote, Sparkles } from 'lucide-react';
import { SportIconMap } from '@/components/icons/sport-icons';
import { HeroParticles } from '@/components/landing/hero-particles';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { CountUp } from '@/components/landing/count-up';

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

const FEATURES = [
  {
    icon: Target,
    title: 'AI 매칭',
    description: '실력, 위치, 시간, 매너를 종합 분석해 딱 맞는 상대를 자동으로 찾아드려요.',
    accent: 'from-blue-500 to-blue-600',
    iconBg: 'bg-blue-500',
  },
  {
    icon: Users,
    title: '팀 매칭',
    description: 'S~D 등급으로 팀 실력을 측정하고, 균형 잡힌 경기를 만들어드려요.',
    accent: 'from-emerald-500 to-emerald-600',
    iconBg: 'bg-emerald-500',
  },
  {
    icon: Shield,
    title: '신뢰 시스템',
    description: '3단계 허위 방지와 6항목 상호 평가로 매너 있는 환경을 보장해요.',
    accent: 'from-amber-500 to-amber-600',
    iconBg: 'bg-amber-500',
  },
  {
    icon: Zap,
    title: '올인원',
    description: '매칭, 채팅, 결제, 용병, 장터까지 — 모든 것을 한 곳에서.',
    accent: 'from-violet-500 to-violet-600',
    iconBg: 'bg-violet-500',
  },
];

const STEPS = [
  { num: 1, title: '프로필 만들기', description: '종목, 실력, 활동 지역을 설정하세요.' },
  { num: 2, title: '매치 찾기', description: 'AI 추천 매치를 받거나 직접 검색하세요.' },
  { num: 3, title: '성장하기', description: 'ELO, 뱃지, 매너 점수가 쌓여요.' },
];

const TESTIMONIALS = [
  {
    quote: '실력이 비슷한 상대를 만나니 경기가 훨씬 재밌어졌어요. 일방적인 경기는 이제 안녕!',
    author: '축구왕민수',
    team: '서울 FC 선데이즈',
    role: '축구 B등급',
  },
  {
    quote: '노쇼 없는 매칭이 최고입니다. 매너 점수 시스템 덕분에 진지한 사람들만 모여요.',
    author: 'FC 번개',
    team: '풋살 A등급 팀',
    role: '풋살 A등급',
  },
  {
    quote: '주말마다 배드민턴 파트너 찾기 힘들었는데, 앱 하나로 3분이면 매칭돼요.',
    author: '셔틀콕러버',
    team: '강남 배드민턴 클럽',
    role: '배드민턴 C등급',
  },
];

const STATS = [
  { value: '11개', label: '지원 종목' },
  { value: 'S~D', label: '실력 등급' },
  { value: 'AI', label: '스마트 매칭' },
  { value: '8종', label: '뱃지 시스템' },
];

/* ── Component ── */

export default function LandingPage() {
  const featuresRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 overflow-x-hidden">

      {/* ── Nav ── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl shadow-sm'
          : 'bg-transparent'
      }`}>
        <div className="max-w-[1200px] mx-auto px-5 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md shadow-blue-500/20">
              <span className="text-white font-black text-sm">M</span>
            </div>
            <span className={`font-bold text-[18px] tracking-tight transition-colors duration-300 ${scrolled ? 'text-gray-900 dark:text-white' : 'text-white'}`}>
              MatchUp
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className={`text-[14px] font-medium transition-colors px-3 py-2 rounded-lg hidden sm:block ${scrolled ? 'text-gray-600 hover:text-gray-900' : 'text-white/80 hover:text-white'}`}>
              로그인
            </Link>
            <Link href="/login" className={`text-[14px] font-semibold px-5 py-2.5 rounded-xl transition-all active:scale-[0.97] ${scrolled ? 'bg-blue-500 text-white hover:bg-blue-600 shadow-md shadow-blue-500/20' : 'bg-white text-gray-900 hover:bg-gray-50'}`}>
              시작하기
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative min-h-[100dvh] flex flex-col justify-center overflow-hidden cursor-grab active:cursor-grabbing">
        {/* Background — brighter, more energetic */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.12),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(99,102,241,0.2),transparent_50%)]" />
        <HeroParticles />

        <div className="relative max-w-[1200px] mx-auto px-5 pt-24 pb-20 lg:pt-0 lg:pb-0">
          <div className="max-w-[660px]">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-md text-white text-[13px] font-medium px-4 py-2 rounded-full mb-8 animate-fade-in-up" style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>
              <Sparkles size={14} className="text-yellow-300" />
              11개 종목 매칭 서비스 운영 중
            </div>

            {/* Heading */}
            <h1 className="text-[32px] sm:text-[40px] lg:text-[56px] font-black text-white leading-[1.15] tracking-tight mb-6 animate-fade-in-up" style={{ animationDelay: '0.25s', animationFillMode: 'both' }}>
              내 수준에 딱 맞는
              <br />
              운동 메이트,{' '}
              <span className="bg-gradient-to-r from-yellow-200 via-yellow-300 to-amber-200 bg-clip-text text-transparent">
                AI가 찾아드려요
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-[17px] lg:text-[20px] text-blue-100/80 mb-10 leading-relaxed max-w-[520px] animate-fade-in-up" style={{ animationDelay: '0.4s', animationFillMode: 'both' }}>
              축구, 풋살, 농구, 배드민턴, 테니스 등 11개 종목.
              <br className="hidden sm:block" />
              실력 기반 매칭으로 더 즐거운 경기를 경험하세요.
            </p>

            {/* CTA */}
            <div className="flex flex-col sm:flex-row gap-3 animate-fade-in-up" style={{ animationDelay: '0.55s', animationFillMode: 'both' }}>
              <Link href="/login" className="inline-flex items-center justify-center gap-2.5 bg-white text-blue-600 font-bold rounded-2xl px-8 py-4 text-[16px] hover:shadow-2xl hover:shadow-white/20 active:scale-[0.97] transition-all duration-200 shadow-lg">
                무료로 시작하기
                <ArrowRight size={18} strokeWidth={2.5} />
              </Link>
              <button onClick={() => featuresRef.current?.scrollIntoView({ behavior: 'smooth' })} className="inline-flex items-center justify-center gap-2 text-white/90 rounded-xl px-6 py-3.5 text-[15px] font-medium hover:bg-white/10 transition-all duration-200">
                더 알아보기
                <ChevronDown size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Bottom curve */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 60" fill="none" className="w-full block" preserveAspectRatio="none">
            <path d="M0 60V30Q360 0 720 30T1440 30V60H0Z" className="fill-white dark:fill-gray-900" />
          </svg>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="relative -mt-1 z-10 pb-16 sm:pb-20">
        <div className="mx-5 lg:mx-auto lg:max-w-[800px]">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl shadow-gray-900/5 dark:shadow-black/20 grid grid-cols-2 sm:grid-cols-4 divide-x divide-gray-100 dark:divide-gray-700 border border-gray-100 dark:border-gray-700">
            {STATS.map((stat) => (
              <div key={stat.label} className="px-5 py-6 sm:px-6 sm:py-7 text-center">
                <CountUp value={stat.value} className="text-[28px] font-black text-gray-900 dark:text-white leading-none block" />
                <div className="text-[12px] text-gray-400 mt-2 font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section ref={featuresRef} className="pb-28 sm:pb-36">
        <div className="max-w-[1200px] mx-auto px-5">
          <ScrollReveal>
            <div className="text-center mb-16">
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full mb-4">
                <Target size={13} /> 주요 기능
              </span>
              <h2 className="text-[26px] lg:text-[36px] font-bold text-gray-900 dark:text-white tracking-tight">
                스포츠 매칭, 이렇게 달라집니다
              </h2>
            </div>
          </ScrollReveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map((f, idx) => {
              const Icon = f.icon;
              return (
                <ScrollReveal key={f.title} delay={idx * 100}>
                  <div className="group bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700 hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 h-full">
                    <div className={`h-12 w-12 rounded-xl ${f.iconBg} flex items-center justify-center mb-5 shadow-lg shadow-current/20 group-hover:scale-110 transition-transform duration-300`}>
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
      <section className="py-20 sm:py-28 bg-gray-50 dark:bg-gray-800/30">
        <div className="max-w-[960px] mx-auto px-5">
          <ScrollReveal>
            <div className="text-center mb-12">
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full mb-4">
                이용 방법
              </span>
              <h2 className="text-[26px] lg:text-[36px] font-bold text-gray-900 dark:text-white tracking-tight">
                3단계로 시작하세요
              </h2>
            </div>
          </ScrollReveal>

          {/* Mobile steps */}
          <ScrollReveal className="lg:hidden">
            <div className="space-y-0">
              {STEPS.map((step, idx) => (
                <div key={step.num} className="relative flex gap-5">
                  <div className="flex flex-col items-center">
                    <div className="h-11 w-11 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white font-bold flex items-center justify-center text-[15px] shrink-0 z-10 shadow-lg shadow-blue-500/25">
                      {step.num}
                    </div>
                    {idx < STEPS.length - 1 && (
                      <div className="w-0.5 flex-1 bg-gradient-to-b from-blue-200 to-transparent my-2" />
                    )}
                  </div>
                  <div className={`pb-10 ${idx === STEPS.length - 1 ? 'pb-0' : ''}`}>
                    <h3 className="text-[16px] font-bold text-gray-900 dark:text-white mb-1">{step.title}</h3>
                    <p className="text-[14px] text-gray-500 dark:text-gray-400 leading-relaxed">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollReveal>

          {/* Desktop steps */}
          <div className="hidden lg:grid lg:grid-cols-3 lg:gap-8 relative">
            <div className="absolute top-[22px] left-[calc(16.67%+22px)] right-[calc(16.67%+22px)] h-0.5 bg-gradient-to-r from-blue-200 via-blue-300 to-blue-200" />
            {STEPS.map((step, idx) => (
              <ScrollReveal key={step.num} delay={idx * 200}>
                <div className="text-center relative">
                  <div className="h-11 w-11 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white font-bold flex items-center justify-center text-[15px] mx-auto mb-5 relative z-10 ring-4 ring-gray-50 dark:ring-gray-900 shadow-lg shadow-blue-500/25">
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
      <section className="py-20 sm:py-28">
        <div className="max-w-[960px] mx-auto px-5">
          <ScrollReveal>
            <div className="text-center mb-10">
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full mb-4">
                지원 종목
              </span>
              <h2 className="text-[26px] lg:text-[36px] font-bold text-gray-900 dark:text-white tracking-tight">
                11개 종목, 하나의 플랫폼
              </h2>
            </div>
          </ScrollReveal>

          {/* Mobile scroll */}
          <div className="lg:hidden">
            <div className="flex overflow-x-auto gap-3 pb-4 -mx-5 px-5 scrollbar-hide">
              {SPORTS.map((sport) => {
                const Icon = SportIconMap[sport.key];
                return (
                  <div key={sport.key} className="shrink-0 w-[88px] bg-white dark:bg-gray-800 rounded-2xl p-3.5 border border-gray-100 dark:border-gray-700 flex flex-col items-center gap-2.5 active:scale-[0.95] transition-transform">
                    <div className={`w-12 h-12 rounded-xl ${sport.bg} flex items-center justify-center`}>
                      {Icon && <Icon size={24} className={sport.iconColor} />}
                    </div>
                    <span className="text-[12px] font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">{sport.name}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Desktop grid */}
          <div className="hidden lg:flex lg:flex-wrap lg:justify-center lg:gap-4">
            {SPORTS.map((sport, idx) => {
              const Icon = SportIconMap[sport.key];
              return (
                <ScrollReveal key={sport.key} delay={idx * 50}>
                  <div className="w-[110px] bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 flex flex-col items-center gap-3 hover:shadow-lg hover:-translate-y-1 hover:border-blue-200 dark:hover:border-blue-800 transition-all duration-300 cursor-default">
                    <div className={`w-12 h-12 rounded-xl ${sport.bg} flex items-center justify-center`}>
                      {Icon && <Icon size={24} className={sport.iconColor} />}
                    </div>
                    <span className="text-[12px] font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">{sport.name}</span>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="py-24 sm:py-32 bg-gray-50 dark:bg-gray-800/30">
        <div className="max-w-[1080px] mx-auto px-5">
          <ScrollReveal>
            <div className="text-center mb-12">
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full mb-4">
                사용자 후기
              </span>
              <h2 className="text-[26px] lg:text-[36px] font-bold text-gray-900 dark:text-white tracking-tight">
                이미 많은 선수들이 경험하고 있어요
              </h2>
            </div>
          </ScrollReveal>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, idx) => (
              <ScrollReveal key={t.author} delay={idx * 120}>
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-7 border border-gray-100 dark:border-gray-700 hover:shadow-xl transition-all duration-300 h-full flex flex-col">
                  <div className="flex gap-0.5 mb-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={14} className="text-amber-400 fill-amber-400" />
                    ))}
                  </div>
                  <p className="text-[15px] text-gray-700 dark:text-gray-300 leading-relaxed flex-1 mb-5">
                    &ldquo;{t.quote}&rdquo;
                  </p>
                  <div className="flex items-center gap-3 pt-4 border-t border-gray-50 dark:border-gray-700">
                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-[13px] font-bold shrink-0">
                      {t.author.charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white text-[14px]">{t.author}</p>
                      <p className="text-[12px] text-gray-400">{t.team}</p>
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.1),transparent_50%)]" />

        <div className="relative max-w-[600px] mx-auto px-5 py-20 sm:py-28 text-center">
          <ScrollReveal>
            <h2 className="text-[28px] lg:text-[44px] font-black text-white mb-5 tracking-tight leading-tight">
              지금 바로
              <br />
              시작하세요
            </h2>
            <p className="text-[16px] lg:text-[18px] text-blue-100/80 mb-10 leading-relaxed">
              내 수준에 맞는 운동 메이트를 AI가 찾아드려요.
              <br />
              가입은 3초, 첫 매칭은 무료입니다.
            </p>
            <Link href="/login" className="inline-flex items-center justify-center gap-2.5 bg-white text-blue-600 font-bold px-10 py-4 rounded-2xl text-[16px] hover:shadow-2xl hover:shadow-white/20 active:scale-[0.97] transition-all duration-200 shadow-lg">
              3초 만에 가입하기
              <ArrowRight size={20} strokeWidth={2.5} />
            </Link>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-gray-900 dark:bg-black py-8 sm:py-10">
        <div className="max-w-[1200px] mx-auto px-5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-5">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                <span className="text-white font-bold text-xs">M</span>
              </div>
              <span className="font-semibold text-white text-[15px]">MatchUp</span>
            </div>
            <div className="flex items-center gap-6 text-[13px] text-gray-400">
              <a href="#" className="hover:text-gray-200 transition-colors">이용약관</a>
              <a href="#" className="hover:text-gray-200 transition-colors">개인정보처리방침</a>
            </div>
            <p className="text-[13px] text-gray-500">&copy; 2026 MatchUp. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
