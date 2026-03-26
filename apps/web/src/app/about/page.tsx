'use client';

import Link from 'next/link';
import { ArrowRight, Heart, Brain, Shield, Users, Target, TrendingUp } from 'lucide-react';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { CountUp } from '@/components/landing/count-up';
import { LandingNav } from '@/components/landing/landing-nav';
import { LandingFooter } from '@/components/landing/landing-footer';

/* ── Data ── */

const PROBLEMS = [
  {
    emoji: '\uD83D\uDE25',
    title: '실력 차이로 재미없는 경기',
    description:
      '초보자와 고수가 같은 경기에 섞이면 아무도 즐겁지 않습니다. 양쪽 모두 시간을 낭비한 기분이 들죠.',
  },
  {
    emoji: '\uD83D\uDD0D',
    title: '상대 찾기의 어려움',
    description:
      '카톡방 돌리고, 동호회 카페 뒤지고, 결국 인원 안 맞아서 경기 취소. 운동보다 상대 찾기가 더 힘듭니다.',
  },
  {
    emoji: '\uD83D\uDEAB',
    title: '노쇼와 신뢰 문제',
    description:
      '열심히 모은 인원인데 당일 연락 두절. 반복되는 노쇼에 경기 운영 자체가 무너집니다.',
  },
];

const APPROACHES = [
  {
    icon: Brain,
    title: 'AI 기반 실력 매칭',
    description:
      'ELO 레이팅, 경기 이력, 포지션 데이터를 종합 분석해 실력이 비슷한 상대를 자동으로 찾아드립니다. 경기할수록 AI가 더 정확해집니다.',
    color: 'bg-blue-500',
  },
  {
    icon: Shield,
    title: '매너 점수 신뢰 시스템',
    description:
      '6항목 상호 평가와 3단계 허위 방지 시스템으로 매너 있는 경기 환경을 보장합니다. 노쇼율 2% 미만.',
    color: 'bg-blue-500',
  },
  {
    icon: Target,
    title: '11개 종목 통합 플랫폼',
    description:
      '축구, 풋살, 농구, 배드민턴, 테니스, 야구, 배구, 수영, 아이스하키, 피겨, 쇼트트랙. 하나의 앱으로 모든 종목을.',
    color: 'bg-blue-500',
  },
];

const TEAM = [
  {
    initial: 'J',
    name: '정현우',
    role: 'CEO & Co-founder',
    bio: '전직 풋살 선수. 직접 겪은 매칭 불편함을 기술로 풀고 싶었습니다.',
    bg: 'bg-blue-500',
  },
  {
    initial: 'K',
    name: '김서연',
    role: 'CTO & Co-founder',
    bio: 'ML 엔지니어 출신. 스포츠 데이터와 AI의 교차점에서 가능성을 봤습니다.',
    bg: 'bg-blue-500',
  },
  {
    initial: 'P',
    name: '박준형',
    role: 'Head of Product',
    bio: '토스 출신 PD. 복잡한 문제를 단순한 경험으로 바꾸는 데 진심입니다.',
    bg: 'bg-blue-500',
  },
  {
    initial: 'L',
    name: '이하은',
    role: 'Head of Design',
    bio: '스포츠를 사랑하는 디자이너. 선수의 눈높이에서 모든 화면을 설계합니다.',
    bg: 'bg-blue-500',
  },
];

const VALUES = [
  {
    icon: Brain,
    title: '기술로 해결',
    description: 'AI와 데이터로 스포츠 매칭의 문제를 풀어갑니다.',
    accent: 'text-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
  },
  {
    icon: Heart,
    title: '선수 중심',
    description: '모든 결정은 선수의 경험을 기준으로 합니다.',
    accent: 'text-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
  },
  {
    icon: Shield,
    title: '신뢰가 먼저',
    description: '공정한 경기 환경을 만드는 것이 최우선입니다.',
    accent: 'text-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
  },
];

const STATS = [
  { value: '2,400+', label: '매칭 완료' },
  { value: '520+', label: '활성 팀' },
  { value: '11', label: '지원 종목' },
  { value: '4.8', label: '평균 만족도' },
];

/* ── Component ── */

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 overflow-x-hidden">

      {/* ── Nav ── */}
      <LandingNav />

      {/* ── Hero ── */}
      <section className="relative pt-32 pb-16 sm:pt-40 sm:pb-24 lg:pt-48 lg:pb-32">
        <div className="max-w-[1100px] mx-auto px-5">
          <div className="max-w-[680px] mx-auto text-center">
            <ScrollReveal delay={0}>
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full mb-4">
                OUR STORY
              </span>
            </ScrollReveal>

            <ScrollReveal delay={100}>
              <h1 className="text-[36px] sm:text-[44px] lg:text-[56px] font-black text-gray-900 dark:text-white leading-[1.15] tracking-tight mb-6">
                TeamMeet을
                <br />
                만든 이유
              </h1>
            </ScrollReveal>

            <ScrollReveal delay={200}>
              <p className="text-[17px] lg:text-[18px] text-gray-500 dark:text-gray-400 leading-relaxed max-w-[540px] mx-auto">
                주말 아침, 풋살화 끈을 묶으며 설레는 마음.
                <br className="hidden sm:block" />
                그런데 상대가 없다면? 실력이 안 맞는다면?
                <br className="hidden sm:block" />
                우리는 그 설렘이 실망으로 바뀌는 순간을
                <br className="hidden sm:block" />
                없애고 싶었습니다.
              </p>
            </ScrollReveal>
          </div>
        </div>

        {/* Background decoration */}
        <div className="absolute top-20 -right-32 w-[500px] h-[500px] bg-blue-100/40 dark:bg-blue-900/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-32 w-[400px] h-[400px] bg-blue-100/30 dark:bg-blue-900/10 rounded-full blur-3xl pointer-events-none" />
      </section>

      {/* ── Mission ── */}
      <section className="pb-20 sm:pb-28">
        <div className="max-w-[800px] mx-auto px-5">
          <ScrollReveal>
            <div className="relative bg-gray-50 dark:bg-gray-800/50 rounded-3xl p-8 sm:p-12 text-center">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(49,130,246,0.06),transparent_60%)] rounded-3xl" />
              <div className="relative">
                <p className="text-[13px] font-semibold text-blue-500 mb-4 tracking-wide">
                  OUR MISSION
                </p>
                <h2 className="text-[22px] sm:text-[28px] lg:text-[36px] font-black text-gray-900 dark:text-white leading-tight tracking-tight">
                  모든 사람이 자기 수준에 맞는
                  <br />
                  운동 상대를 쉽게 찾을 수 있는 세상
                </h2>
                <p className="text-[15px] text-gray-500 dark:text-gray-400 mt-5 leading-relaxed max-w-[480px] mx-auto">
                  운동은 좋은 상대가 있어야 즐겁습니다.
                  <br className="hidden sm:block" />
                  TeamMeet은 기술로 그 상대를 연결하는 플랫폼입니다.
                </p>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Problem We Solve ── */}
      <section className="py-20 sm:py-28 bg-gray-50 dark:bg-gray-800/30">
        <div className="max-w-[960px] mx-auto px-5">
          <ScrollReveal>
            <div className="text-center mb-14">
              <p className="text-[13px] font-semibold text-blue-500 mb-4 tracking-wide">
                THE PROBLEM
              </p>
              <h2 className="text-[26px] lg:text-[36px] font-bold text-gray-900 dark:text-white tracking-tight leading-tight">
                우리가 해결하는 문제
              </h2>
              <p className="text-[15px] text-gray-500 dark:text-gray-400 mt-3 max-w-[400px] mx-auto">
                생활체육을 즐기는 사람이라면 누구나 겪는, 하지만 아무도 제대로 풀지 못한 문제들.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-3 gap-6">
            {PROBLEMS.map((p, idx) => (
              <ScrollReveal key={p.title} delay={idx * 120}>
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-7 border border-gray-100 dark:border-gray-700 h-full">
                  <div className="text-[28px] mb-4">{p.emoji}</div>
                  <h3 className="text-[17px] font-bold text-gray-900 dark:text-white mb-2">
                    {p.title}
                  </h3>
                  <p className="text-[14px] text-gray-500 dark:text-gray-400 leading-relaxed">
                    {p.description}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Our Approach ── */}
      <section className="py-20 sm:py-28">
        <div className="max-w-[960px] mx-auto px-5">
          <ScrollReveal>
            <div className="text-center mb-14">
              <p className="text-[13px] font-semibold text-blue-500 mb-4 tracking-wide">
                OUR APPROACH
              </p>
              <h2 className="text-[26px] lg:text-[36px] font-bold text-gray-900 dark:text-white tracking-tight leading-tight">
                우리의 해결 방식
              </h2>
              <p className="text-[15px] text-gray-500 dark:text-gray-400 mt-3 max-w-[440px] mx-auto">
                감에 의존하지 않습니다. 데이터와 기술로 문제의 근본을 해결합니다.
              </p>
            </div>
          </ScrollReveal>

          <div className="space-y-5">
            {APPROACHES.map((a, idx) => {
              const Icon = a.icon;
              return (
                <ScrollReveal key={a.title} delay={idx * 100}>
                  <div className="group bg-white dark:bg-gray-800 rounded-2xl p-6 sm:p-8 border border-gray-100 dark:border-gray-700 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex flex-col sm:flex-row gap-5 sm:gap-8 sm:items-start">
                    <div
                      className={`h-12 w-12 rounded-xl ${a.color} flex items-center justify-center shrink-0 shadow-lg group-hover:scale-110 transition-transform duration-300`}
                    >
                      <Icon size={22} className="text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-[18px] font-bold text-gray-900 dark:text-white mb-2">
                        {a.title}
                      </h3>
                      <p className="text-[15px] text-gray-500 dark:text-gray-400 leading-relaxed">
                        {a.description}
                      </p>
                    </div>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Numbers ── */}
      <section className="py-16 sm:py-20 bg-gray-50 dark:bg-gray-800/30">
        <div className="max-w-[800px] mx-auto px-5">
          <ScrollReveal>
            <div className="text-center mb-10">
              <p className="text-[13px] font-semibold text-blue-500 mb-4 tracking-wide">
                BY THE NUMBERS
              </p>
              <h2 className="text-[26px] lg:text-[36px] font-bold text-gray-900 dark:text-white tracking-tight leading-tight">
                숫자로 보는 TeamMeet
              </h2>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={100}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg shadow-gray-900/5 dark:shadow-black/20 grid grid-cols-2 sm:grid-cols-4 divide-x divide-gray-100 dark:divide-gray-700 border border-gray-100 dark:border-gray-700">
              {STATS.map((stat) => (
                <div key={stat.label} className="px-5 py-7 sm:px-6 sm:py-9 text-center">
                  <CountUp
                    value={stat.value}
                    className="text-[28px] sm:text-[32px] font-black text-gray-900 dark:text-white leading-none block"
                  />
                  <div className="text-[13px] text-gray-500 mt-2.5 font-medium">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Values ── */}
      <section className="py-20 sm:py-28">
        <div className="max-w-[960px] mx-auto px-5">
          <ScrollReveal>
            <div className="text-center mb-14">
              <p className="text-[13px] font-semibold text-blue-500 mb-4 tracking-wide">
                OUR VALUES
              </p>
              <h2 className="text-[26px] lg:text-[36px] font-bold text-gray-900 dark:text-white tracking-tight leading-tight">
                우리가 믿는 것
              </h2>
            </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-3 gap-6">
            {VALUES.map((v, idx) => {
              const Icon = v.icon;
              return (
                <ScrollReveal key={v.title} delay={idx * 120}>
                  <div className="bg-white dark:bg-gray-800 rounded-2xl p-7 border border-gray-100 dark:border-gray-700 hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 text-center h-full">
                    <div
                      className={`h-14 w-14 rounded-2xl ${v.bg} flex items-center justify-center mx-auto mb-5`}
                    >
                      <Icon size={24} className={v.accent} />
                    </div>
                    <h3 className="text-[18px] font-bold text-gray-900 dark:text-white mb-2">
                      {v.title}
                    </h3>
                    <p className="text-[14px] text-gray-500 dark:text-gray-400 leading-relaxed">
                      {v.description}
                    </p>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Team ── */}
      <section className="py-20 sm:py-28 bg-gray-50 dark:bg-gray-800/30">
        <div className="max-w-[960px] mx-auto px-5">
          <ScrollReveal>
            <div className="text-center mb-14">
              <p className="text-[13px] font-semibold text-blue-500 mb-4 tracking-wide">
                OUR TEAM
              </p>
              <h2 className="text-[26px] lg:text-[36px] font-bold text-gray-900 dark:text-white tracking-tight leading-tight">
                만드는 사람들
              </h2>
              <p className="text-[15px] text-gray-500 dark:text-gray-400 mt-3 max-w-[400px] mx-auto">
                스포츠를 사랑하고, 문제를 기술로 푸는 것에 진심인 사람들이 모였습니다.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {TEAM.map((member, idx) => (
              <ScrollReveal key={member.name} delay={idx * 100}>
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 text-center h-full">
                  <div
                    className={`h-16 w-16 rounded-full ${member.bg} flex items-center justify-center mx-auto mb-4`}
                  >
                    <span className="text-white font-black text-[22px]">
                      {member.initial}
                    </span>
                  </div>
                  <h3 className="text-[16px] font-bold text-gray-900 dark:text-white">
                    {member.name}
                  </h3>
                  <p className="text-[13px] text-blue-500 font-medium mt-0.5">
                    {member.role}
                  </p>
                  <p className="text-[13px] text-gray-500 dark:text-gray-400 leading-relaxed mt-3">
                    {member.bio}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="relative overflow-hidden bg-gray-900 dark:bg-black">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(49,130,246,0.12),transparent_60%)]" />
        <div className="relative max-w-[600px] mx-auto px-5 py-20 sm:py-28 text-center">
          <ScrollReveal>
            <div className="inline-flex items-center gap-2 mb-6">
              <Users size={16} className="text-blue-400" />
              <p className="text-[14px] text-blue-400 font-semibold">
                함께 만들어가요
              </p>
            </div>
            <h2 className="text-[28px] lg:text-[36px] font-bold text-white mb-6 tracking-tight leading-tight">
              더 나은 경기 경험,
              <br />
              지금 시작하세요
            </h2>
            <p className="text-[15px] lg:text-[17px] text-gray-400 mb-10 leading-relaxed">
              당신의 피드백이 TeamMeet을 더 좋게 만듭니다.
              <br className="hidden sm:block" />
              함께 생활체육의 새로운 기준을 세워주세요.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2.5 bg-blue-500 text-white font-bold px-8 py-4 rounded-2xl text-[16px] hover:bg-blue-400 hover:shadow-xl hover:shadow-blue-500/30 active:scale-[0.97] transition-all duration-200 shadow-lg shadow-blue-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
              >
                지금 시작하기
                <ArrowRight size={18} strokeWidth={2.5} />
              </Link>
              <Link
                href="/landing"
                className="inline-flex items-center justify-center gap-2 text-gray-400 rounded-xl px-6 py-3.5 text-[15px] font-medium hover:text-white hover:bg-white/5 active:scale-[0.97] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
              >
                <TrendingUp size={16} />
                서비스 둘러보기
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Footer ── */}
      <LandingFooter />
    </div>
  );
}
