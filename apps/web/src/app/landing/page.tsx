'use client';

import { useRef, useEffect, useState } from 'react';
import Link from 'next/link';
import { Target, Shield, Users, Zap, ChevronRight, Star, ArrowRight, Quote } from 'lucide-react';
import { SportIconMap } from '@/components/icons/sport-icons';
import { HeroParticles } from '@/components/landing/hero-particles';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { CountUp } from '@/components/landing/count-up';

/* ────────────────────────────────────────────
   Data
   ──────────────────────────────────────────── */

const SPORTS = [
  { key: 'soccer', name: '축구', bg: 'bg-green-100', iconColor: 'text-green-600' },
  { key: 'futsal', name: '풋살', bg: 'bg-blue-100', iconColor: 'text-blue-500' },
  { key: 'basketball', name: '농구', bg: 'bg-amber-100', iconColor: 'text-amber-600' },
  { key: 'badminton', name: '배드민턴', bg: 'bg-cyan-100', iconColor: 'text-cyan-600' },
  { key: 'tennis', name: '테니스', bg: 'bg-red-100', iconColor: 'text-red-500' },
  { key: 'baseball', name: '야구', bg: 'bg-orange-100', iconColor: 'text-orange-600' },
  { key: 'volleyball', name: '배구', bg: 'bg-indigo-100', iconColor: 'text-indigo-500' },
  { key: 'swimming', name: '수영', bg: 'bg-sky-100', iconColor: 'text-sky-600' },
  { key: 'ice_hockey', name: '아이스하키', bg: 'bg-blue-100', iconColor: 'text-blue-600' },
  { key: 'figure_skating', name: '피겨스케이팅', bg: 'bg-purple-100', iconColor: 'text-purple-500' },
  { key: 'short_track', name: '쇼트트랙', bg: 'bg-slate-100', iconColor: 'text-slate-600' },
];

const FEATURES = [
  {
    icon: Target,
    title: 'AI 매칭',
    description: '실력, 위치, 시간, 매너를 종합 분석해 나와 가장 잘 맞는 상대를 자동으로 찾아드립니다.',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-100',
  },
  {
    icon: Users,
    title: '팀 매칭',
    description: 'S~D 등급으로 팀 실력을 정확히 측정하고, 균형 잡힌 경기를 만들어드립니다.',
    color: 'text-blue-500',
    bg: 'bg-gray-50',
    border: 'border-gray-100',
  },
  {
    icon: Shield,
    title: '신뢰 시스템',
    description: '3단계 허위 레벨링 방지와 6항목 상호 평가로 매너 있는 경기 환경을 보장합니다.',
    color: 'text-blue-500',
    bg: 'bg-gray-50',
    border: 'border-gray-100',
  },
  {
    icon: Zap,
    title: '올인원 플랫폼',
    description: '매칭부터 채팅, 결제, 용병 구하기, 장터까지 — 모든 것을 한 곳에서 해결하세요.',
    color: 'text-blue-500',
    bg: 'bg-gray-50',
    border: 'border-gray-100',
  },
];

const STEPS = [
  {
    num: 1,
    title: '프로필 만들기',
    description: '종목, 실력 레벨, 활동 지역을 설정하고 나만의 스포츠 프로필을 완성하세요.',
  },
  {
    num: 2,
    title: '매치 찾기',
    description: 'AI가 추천하는 최적의 매치를 받거나, 직접 원하는 경기를 검색해 참여하세요.',
  },
  {
    num: 3,
    title: '경기하고 성장하기',
    description: 'ELO 레이팅, 뱃지, 매너 점수가 쌓이며 나만의 스포츠 커리어가 만들어집니다.',
  },
];

const TESTIMONIALS = [
  {
    quote: '실력이 비슷한 상대를 만나니 경기가 훨씬 재밌어졌어요. 일방적인 경기는 이제 안녕!',
    author: '축구왕민수',
    team: '서울 FC 선데이즈',
    role: '축구 B등급',
    rating: 5,
  },
  {
    quote: '노쇼 없는 매칭이 최고입니다. 매너 점수 시스템 덕분에 진지한 사람들만 모여요.',
    author: 'FC 번개',
    team: '풋살 A등급 팀',
    role: '풋살 A등급',
    rating: 5,
  },
  {
    quote: '주말마다 배드민턴 파트너 찾기 힘들었는데, 이제 앱 하나로 3분이면 매칭돼요.',
    author: '셔틀콕러버',
    team: '강남 배드민턴 클럽',
    role: '배드민턴 C등급',
    rating: 5,
  },
];

const STATS = [
  { value: '11개', label: '지원 종목' },
  { value: 'S~D', label: '실력 등급' },
  { value: 'AI', label: '스마트 매칭' },
  { value: '8종', label: '뱃지 시스템' },
];

/* ────────────────────────────────────────────
   Component
   ──────────────────────────────────────────── */

export default function LandingPage() {
  const featuresRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToFeatures = () => {
    featuresRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      {/* ── Fixed Navigation ── */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-800 shadow-sm'
            : 'bg-transparent border-b border-transparent'
        }`}
      >
        <div className="max-w-[1200px] mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">M</span>
            </div>
            <span className={`font-bold text-[18px] tracking-tight transition-colors duration-300 ${scrolled ? 'text-gray-900 dark:text-white' : 'text-white'}`}>MatchUp</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className={`text-[14px] transition-colors px-3 py-2 hidden sm:block ${scrolled ? 'text-gray-600 dark:text-gray-300 hover:text-gray-900' : 'text-white/80 hover:text-white'}`}
            >
              로그인
            </Link>
            <Link
              href="/login"
              className={`text-[14px] font-semibold transition-all px-5 py-2.5 rounded-xl ${scrolled ? 'text-white bg-blue-600 hover:bg-blue-700' : 'text-blue-600 bg-white hover:bg-blue-50'}`}
            >
              시작하기
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero Section ── */}
      <section className="relative pt-16 overflow-hidden cursor-grab active:cursor-grabbing">
        {/* Premium gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-blue-700 to-gray-900" />
        {/* Subtle radial overlay for depth */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_40%,rgba(255,255,255,0.08),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_80%,rgba(49,130,246,0.15),transparent_50%)]" />
        {/* Interactive particles */}
        <HeroParticles />

        <div className="relative max-w-[1200px] mx-auto px-5 py-20 sm:py-28 lg:py-36">
          <div className="max-w-[640px]">
            {/* Status badge */}
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm text-white/90 text-[13px] font-medium px-4 py-2 rounded-full mb-8 animate-fade-in-up" style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              11개 종목 매칭 서비스 운영 중
            </div>

            {/* Main heading */}
            <h1 className="text-[28px] sm:text-[32px] lg:text-[48px] font-black text-white leading-[1.2] tracking-tight mb-5 animate-fade-in-up" style={{ animationDelay: '0.25s', animationFillMode: 'both' }}>
              내 수준에 딱 맞는{' '}
              <br className="hidden sm:block" />
              운동 메이트,{' '}
              <br className="block sm:hidden" />
              <span className="text-blue-200">AI가 찾아드려요</span>
            </h1>

            {/* Subtitle */}
            <p className="text-[16px] lg:text-[20px] text-white/70 mb-10 leading-relaxed max-w-[520px] animate-fade-in-up" style={{ animationDelay: '0.4s', animationFillMode: 'both' }}>
              축구, 풋살, 농구, 배드민턴, 테니스 등 11개 종목 지원.
              <br className="hidden sm:block" />
              실력 기반 매칭으로 더 즐거운 경기를 경험하세요.
            </p>

            {/* CTA buttons */}
            <div className="flex flex-col sm:flex-row gap-3 animate-fade-in-up" style={{ animationDelay: '0.55s', animationFillMode: 'both' }}>
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 bg-white text-blue-600 font-bold rounded-2xl px-10 py-4.5 text-[16px] hover:bg-blue-50 hover:shadow-xl active:scale-[0.98] transition-all duration-200 shadow-lg shadow-black/10"
              >
                무료로 시작하기
                <ArrowRight size={18} strokeWidth={2.5} />
              </Link>
              <button
                onClick={scrollToFeatures}
                className="inline-flex items-center justify-center gap-2 border border-white/30 text-white rounded-xl px-6 py-3.5 text-[15px] font-medium hover:bg-white/10 hover:border-white/50 transition-all duration-200 backdrop-blur-sm"
              >
                서비스 둘러보기
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Hero bottom wave */}
        <div className="relative -mb-px">
          <svg
            viewBox="0 0 1440 80"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-auto block"
            preserveAspectRatio="none"
          >
            <path
              d="M0 80V40C120 53.3333 240 66.6667 360 60C480 53.3333 600 26.6667 720 16C840 5.33333 960 10.6667 1080 24C1200 37.3333 1320 58.6667 1380 69.3333L1440 80H0Z"
              className="fill-gray-50 dark:fill-gray-900"
            />
          </svg>
        </div>
      </section>

      {/* ── Features Section (includes Stats bar) ── */}
      <section ref={featuresRef} className="bg-gray-50 dark:bg-gray-900">
        {/* Stats Bar — floating overlap from hero */}
        <div className="relative -mt-8 z-10 mx-5 lg:mx-auto lg:max-w-[800px]">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl shadow-gray-200/60 dark:shadow-black/20 grid grid-cols-2 sm:grid-cols-4 divide-x divide-gray-100 dark:divide-gray-700">
            {STATS.map((stat) => (
              <div key={stat.label} className="px-5 py-5 sm:px-6 sm:py-6 text-center">
                <CountUp value={stat.value} className="text-[28px] font-black text-gray-900 dark:text-white leading-none block" />
                <div className="text-[12px] text-gray-400 dark:text-gray-500 mt-1.5 font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Features content */}
        <div className="pt-16 pb-20 sm:pt-24 sm:pb-28">
        <div className="max-w-[1200px] mx-auto px-5">
          <ScrollReveal>
            <div className="text-center mb-14">
              <p className="text-[13px] font-semibold text-blue-600 mb-2 tracking-wide uppercase">주요 기능</p>
              <h2 className="text-[28px] lg:text-[36px] font-bold text-gray-900 dark:text-white tracking-tight">
                스포츠 매칭, 이렇게 달라집니다
              </h2>
            </div>
          </ScrollReveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <ScrollReveal key={feature.title} delay={idx * 100} direction="up">
                  <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 cursor-default h-full">
                    <div
                      className={`h-14 w-14 rounded-2xl ${feature.bg} dark:bg-opacity-20 flex items-center justify-center mb-5`}
                    >
                      <Icon size={26} className={feature.color} />
                    </div>
                    <h3 className="text-[16px] lg:text-[18px] font-semibold text-gray-900 dark:text-white mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-[14px] text-gray-500 dark:text-gray-400 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="py-20 sm:py-28 bg-white dark:bg-gray-900">
        <div className="max-w-[1200px] mx-auto px-5">
          <ScrollReveal>
            <div className="text-center mb-14">
              <p className="text-[13px] font-semibold text-blue-600 mb-2 tracking-wide uppercase">이용 방법</p>
              <h2 className="text-[28px] lg:text-[36px] font-bold text-gray-900 dark:text-white tracking-tight">
                3단계로 시작하세요
              </h2>
            </div>
          </ScrollReveal>

          {/* Mobile: vertical with connecting line */}
          <ScrollReveal className="lg:hidden">
            <div className="space-y-0">
              {STEPS.map((step, idx) => (
                <div key={step.num} className="relative flex gap-5">
                  <div className="flex flex-col items-center">
                    <div className="h-10 w-10 rounded-full bg-blue-500 text-white font-bold flex items-center justify-center text-[15px] shrink-0 z-10">
                      {step.num}
                    </div>
                    {idx < STEPS.length - 1 && (
                      <div className="w-0.5 flex-1 bg-gradient-to-b from-blue-300 to-blue-100 dark:from-blue-600 dark:to-blue-900 my-2" />
                    )}
                  </div>
                  <div className={`pb-10 ${idx === STEPS.length - 1 ? 'pb-0' : ''}`}>
                    <h3 className="text-[16px] font-semibold text-gray-900 dark:text-white mb-1.5">{step.title}</h3>
                    <p className="text-[14px] text-gray-500 dark:text-gray-400 leading-relaxed">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollReveal>

          {/* Desktop: horizontal with connecting line */}
          <div className="hidden lg:grid lg:grid-cols-3 lg:gap-8 relative">
            {/* Connecting line behind the step numbers */}
            <div className="absolute top-5 left-[calc(16.67%+20px)] right-[calc(16.67%+20px)] h-0.5 bg-gradient-to-r from-blue-300 via-blue-400 to-blue-300 dark:from-blue-700 dark:via-blue-600 dark:to-blue-700" />

            {STEPS.map((step, idx) => (
              <ScrollReveal key={step.num} delay={idx * 200}>
                <div className="text-center relative">
                  <div className="h-10 w-10 rounded-full bg-blue-500 text-white font-bold flex items-center justify-center text-[15px] mx-auto mb-5 relative z-10 ring-4 ring-white dark:ring-gray-900">
                    {step.num}
                  </div>
                  <h3 className="text-[18px] font-semibold text-gray-900 dark:text-white mb-2">{step.title}</h3>
                  <p className="text-[14px] text-gray-500 dark:text-gray-400 leading-relaxed max-w-[280px] mx-auto">
                    {step.description}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Supported Sports ── */}
      <section className="py-20 sm:py-28 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-[1200px] mx-auto px-5">
          <ScrollReveal>
            <div className="text-center mb-14">
              <p className="text-[13px] font-semibold text-blue-600 mb-2 tracking-wide uppercase">지원 종목</p>
              <h2 className="text-[28px] lg:text-[36px] font-bold text-gray-900 dark:text-white tracking-tight">
                11개 종목, 하나의 플랫폼
              </h2>
            </div>
          </ScrollReveal>

          {/* Mobile: horizontal scroll */}
          <div className="lg:hidden">
            <div className="flex overflow-x-auto gap-4 pb-4 -mx-5 px-5 scrollbar-hide">
              {SPORTS.map((sport) => {
                const Icon = SportIconMap[sport.key];
                return (
                  <div
                    key={sport.key}
                    className="shrink-0 w-[100px] bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 flex flex-col items-center gap-3 hover:shadow-md transition-all duration-200"
                  >
                    <div className={`w-14 h-14 rounded-2xl ${sport.bg} flex items-center justify-center`}>
                      {Icon && <Icon size={28} className={sport.iconColor} />}
                    </div>
                    <span className="text-[13px] font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {sport.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Desktop: centered flex wrap */}
          <div className="hidden lg:flex lg:flex-wrap lg:justify-center lg:gap-4">
            {SPORTS.map((sport, idx) => {
              const Icon = SportIconMap[sport.key];
              return (
                <ScrollReveal key={sport.key} delay={idx * 60} direction="up">
                <div
                  className="w-[120px] bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 flex flex-col items-center gap-3 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 cursor-default"
                >
                  <div className={`w-14 h-14 rounded-2xl ${sport.bg} flex items-center justify-center`}>
                    {Icon && <Icon size={28} className={sport.iconColor} />}
                  </div>
                  <span className="text-[13px] font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {sport.name}
                  </span>
                </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="py-20 sm:py-28 bg-white dark:bg-gray-900">
        <div className="max-w-[1200px] mx-auto px-5">
          <ScrollReveal>
            <div className="text-center mb-14">
              <p className="text-[13px] font-semibold text-blue-600 mb-2 tracking-wide uppercase">사용자 후기</p>
              <h2 className="text-[28px] lg:text-[36px] font-bold text-gray-900 dark:text-white tracking-tight">
                이미 많은 선수들이 경험하고 있어요
              </h2>
            </div>
          </ScrollReveal>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, idx) => (
              <ScrollReveal key={t.author} delay={idx * 120} direction="up">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-7 border border-gray-100 dark:border-gray-700 relative hover:shadow-lg transition-all duration-200 h-full">
                {/* Quote icon */}
                <div className="mb-4">
                  <Quote size={24} className="text-blue-200 dark:text-blue-800" />
                </div>

                {/* Stars */}
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <Star key={i} size={14} className="text-amber-400 fill-amber-400" />
                  ))}
                </div>

                {/* Quote text */}
                <p className="text-[15px] text-gray-700 dark:text-gray-300 leading-relaxed mb-6">
                  {t.quote}
                </p>

                {/* Author info */}
                <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
                  <p className="font-semibold text-gray-900 dark:text-white text-[14px]">{t.author}</p>
                  <p className="text-[12px] text-gray-400 dark:text-gray-500 mt-0.5">{t.team} &middot; {t.role}</p>
                </div>
              </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-blue-700 to-gray-900" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,255,255,0.08),transparent_60%)]" />

        <div className="relative max-w-[640px] mx-auto px-5 py-20 sm:py-28 text-center">
          <ScrollReveal>
            <h2 className="text-[28px] lg:text-[40px] font-black text-white mb-4 tracking-tight leading-tight">
              지금 바로 시작하세요
            </h2>
            <p className="text-[16px] lg:text-[18px] text-white/70 mb-10 leading-relaxed">
              내 수준에 맞는 운동 메이트를 AI가 찾아드려요.
              <br />
              가입은 3초, 첫 매칭은 무료입니다.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 bg-white text-blue-600 font-bold px-10 py-4.5 rounded-2xl text-[16px] hover:bg-blue-50 hover:shadow-xl active:scale-[0.98] transition-all duration-200 shadow-lg shadow-black/10"
            >
              3초 만에 가입하기
              <ArrowRight size={20} strokeWidth={2.5} />
            </Link>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-gray-900 dark:bg-black py-10 border-t border-gray-800">
        <div className="max-w-[1200px] mx-auto px-5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center">
                <span className="text-white font-bold text-xs">M</span>
              </div>
              <span className="font-semibold text-white text-[15px]">MatchUp</span>
            </div>
            <div className="flex items-center gap-6 text-[13px] text-gray-400">
              <a href="#" className="hover:text-gray-200 transition-colors">이용약관</a>
              <a href="#" className="hover:text-gray-200 transition-colors">개인정보처리방침</a>
            </div>
            <p className="text-[13px] text-gray-500">
              &copy; 2026 MatchUp. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
