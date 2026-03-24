'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { Target, Shield, Users, Zap, ChevronRight, Star, ArrowRight } from 'lucide-react';
import { SportIconMap } from '@/components/icons/sport-icons';

const SPORTS = [
  { key: 'soccer', name: '축구', iconColor: 'text-green-600', bg: 'bg-green-50' },
  { key: 'futsal', name: '풋살', iconColor: 'text-blue-500', bg: 'bg-blue-50' },
  { key: 'basketball', name: '농구', iconColor: 'text-amber-600', bg: 'bg-amber-50' },
  { key: 'badminton', name: '배드민턴', iconColor: 'text-cyan-600', bg: 'bg-cyan-50' },
  { key: 'tennis', name: '테니스', iconColor: 'text-red-500', bg: 'bg-red-50' },
  { key: 'baseball', name: '야구', iconColor: 'text-orange-600', bg: 'bg-orange-50' },
  { key: 'volleyball', name: '배구', iconColor: 'text-blue-500', bg: 'bg-blue-50' },
  { key: 'swimming', name: '수영', iconColor: 'text-sky-600', bg: 'bg-sky-50' },
  { key: 'ice_hockey', name: '아이스하키', iconColor: 'text-blue-600', bg: 'bg-blue-50' },
  { key: 'figure_skating', name: '피겨스케이팅', iconColor: 'text-gray-500', bg: 'bg-gray-100' },
  { key: 'short_track', name: '쇼트트랙', iconColor: 'text-gray-500', bg: 'bg-gray-100' },
];

const FEATURES = [
  {
    icon: Target,
    title: 'AI 매칭',
    description: '실력 · 위치 · 시간 · 매너를 종합한 최적 매칭',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    icon: Users,
    title: '팀 매칭',
    description: 'S~D 등급으로 딱 맞는 상대팀 찾기',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
  },
  {
    icon: Shield,
    title: '신뢰 시스템',
    description: '3단계 허위 레벨링 방지 + 6항목 상호 평가',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
  },
  {
    icon: Zap,
    title: '올인원 플랫폼',
    description: '매칭 · 채팅 · 결제 · 용병 · 장터까지 한 곳에서',
    color: 'text-violet-600',
    bg: 'bg-violet-50',
  },
];

const STEPS = [
  {
    step: '01',
    title: '팀/개인 프로필 만들기',
    description: '종목, 레벨, 활동 지역을 설정하세요',
  },
  {
    step: '02',
    title: '매치 찾기 또는 모집하기',
    description: 'AI 추천 매치를 받거나 직접 검색하세요',
  },
  {
    step: '03',
    title: '경기하고 성장하기',
    description: 'ELO 레이팅, 뱃지, 매너 점수로 성장하세요',
  },
];

const TESTIMONIALS = [
  {
    quote: '실력이 비슷한 상대를 만나니 경기가 훨씬 재밌어졌어요. 일방적인 경기는 이제 안녕!',
    author: '축구왕민수',
    role: '축구 · B등급',
    rating: 5,
  },
  {
    quote: '노쇼 없는 매칭이 최고입니다. 매너 점수 시스템 덕분에 진지한 사람들만 모여요.',
    author: 'FC 번개',
    role: '풋살팀 · A등급',
    rating: 5,
  },
  {
    quote: '주말마다 배드민턴 파트너 찾기 힘들었는데, 이제 앱 하나로 3분이면 매칭돼요.',
    author: '셔틀콕러버',
    role: '배드민턴 · C등급',
    rating: 5,
  },
];

export default function LandingPage() {
  const featuresRef = useRef<HTMLDivElement>(null);

  const scrollToFeatures = () => {
    featuresRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">M</span>
            </div>
            <span className="font-bold text-lg text-gray-900">MatchUp</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors px-3 py-2"
            >
              로그인
            </Link>
            <Link
              href="/login"
              className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors px-4 py-2 rounded-lg"
            >
              시작하기
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-16 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent_50%)]" />
        <div className="relative max-w-6xl mx-auto px-4 py-20 sm:py-28 md:py-36">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm text-white/90 text-sm font-medium px-4 py-2 rounded-full mb-6">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              11개 종목 매칭 서비스 운영 중
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white leading-tight mb-5">
              내 수준에 딱 맞는{' '}
              <br className="hidden sm:block" />
              운동 메이트,{' '}
              <span className="text-blue-200">AI가 찾아드려요</span>
            </h1>
            <p className="text-lg sm:text-xl text-blue-100 mb-8 leading-relaxed">
              축구 · 풋살 · 농구 · 배드민턴 · 테니스 등 11개 종목 지원.
              <br className="hidden sm:block" />
              실력 기반 매칭으로 더 즐거운 경기를 경험하세요.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 bg-white text-blue-700 font-semibold px-7 py-3.5 rounded-xl hover:bg-blue-50 transition-colors text-base shadow-lg shadow-blue-900/20"
              >
                무료로 시작하기
                <ArrowRight size={18} />
              </Link>
              <button
                onClick={scrollToFeatures}
                className="inline-flex items-center justify-center gap-2 bg-white/10 backdrop-blur-sm text-white font-medium px-7 py-3.5 rounded-xl hover:bg-white/20 transition-colors text-base border border-white/20"
              >
                서비스 둘러보기
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="relative -mt-8 z-10 max-w-5xl mx-auto px-4">
        <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 grid grid-cols-2 sm:grid-cols-4 divide-x divide-gray-100">
          {[
            { value: '11개', label: '종목 지원' },
            { value: 'S~D', label: '실력 등급' },
            { value: 'AI', label: '스마트 매칭' },
            { value: '8종', label: '뱃지 시스템' },
          ].map((stat) => (
            <div key={stat.label} className="px-6 py-5 text-center">
              <div className="text-2xl font-bold text-blue-600">{stat.value}</div>
              <div className="text-sm text-gray-500 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features Section */}
      <section ref={featuresRef} className="py-20 sm:py-28 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-blue-600 mb-2">주요 기능</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
              스포츠 매칭, 이렇게 달라집니다
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="bg-white rounded-2xl p-6 border border-gray-100 hover:shadow-lg hover:border-gray-200 transition-all duration-200"
                >
                  <div className={`w-12 h-12 rounded-xl ${feature.bg} flex items-center justify-center mb-4`}>
                    <Icon size={24} className={feature.color} />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 sm:py-28 bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-blue-600 mb-2">이용 방법</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
              3단계로 시작하세요
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {STEPS.map((step, idx) => (
              <div key={step.step} className="relative">
                {idx < STEPS.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-full w-full h-0.5 bg-gradient-to-r from-blue-200 to-transparent -translate-x-8" />
                )}
                <div className="flex items-start gap-4">
                  <div className="shrink-0 w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-xl font-bold">
                    {step.step}
                  </div>
                  <div className="pt-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">{step.title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{step.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Supported Sports */}
      <section className="py-20 sm:py-28 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-blue-600 mb-2">지원 종목</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
              11개 종목, 하나의 플랫폼
            </h2>
          </div>
          <div className="flex overflow-x-auto gap-4 pb-4 -mx-4 px-4 scrollbar-hide">
            {SPORTS.map((sport) => {
              const Icon = SportIconMap[sport.key];
              return (
                <div
                  key={sport.key}
                  className="shrink-0 w-28 bg-white rounded-2xl p-5 border border-gray-100 flex flex-col items-center gap-3 hover:shadow-md hover:border-gray-200 transition-all duration-200"
                >
                  <div className={`w-14 h-14 rounded-xl ${sport.bg} flex items-center justify-center`}>
                    {Icon && <Icon size={28} className={sport.iconColor} />}
                  </div>
                  <span className="text-sm font-medium text-gray-700 whitespace-nowrap">{sport.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 sm:py-28 bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-blue-600 mb-2">사용자 후기</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
              이미 많은 선수들이 경험하고 있어요
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((testimonial) => (
              <div
                key={testimonial.author}
                className="bg-gray-50 rounded-2xl p-6 border border-gray-100"
              >
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: testimonial.rating }).map((_, i) => (
                    <Star key={i} size={16} className="text-amber-400 fill-amber-400" />
                  ))}
                </div>
                <p className="text-gray-700 leading-relaxed mb-5">
                  &ldquo;{testimonial.quote}&rdquo;
                </p>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{testimonial.author}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{testimonial.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 sm:py-28 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            지금 바로 시작하세요
          </h2>
          <p className="text-blue-100 mb-8 text-lg">
            내 수준에 맞는 운동 메이트를 AI가 찾아드려요.
            <br />
            가입은 3초, 첫 매칭은 무료입니다.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 bg-white text-blue-700 font-semibold px-8 py-4 rounded-xl hover:bg-blue-50 transition-colors text-lg shadow-lg shadow-blue-900/30"
          >
            3초 만에 가입하기
            <ArrowRight size={20} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 py-10">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center">
                <span className="text-white font-bold text-xs">M</span>
              </div>
              <span className="font-semibold text-white">MatchUp</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-400">
              <a href="#" className="hover:text-gray-200 transition-colors">이용약관</a>
              <a href="#" className="hover:text-gray-200 transition-colors">개인정보처리방침</a>
            </div>
            <p className="text-sm text-gray-500">
              &copy; 2026 MatchUp. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
