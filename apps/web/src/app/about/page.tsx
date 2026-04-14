import Link from 'next/link';
import { ArrowRight, Heart, Brain, Shield, Target, TrendingUp } from 'lucide-react';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { LandingNav } from '@/components/landing/landing-nav';
import { LandingFooter } from '@/components/landing/landing-footer';

/* ── Data ── */

const PROBLEMS = [
  {
    emoji: '😥',
    title: '실력 차이로 재미없는 경기',
    description:
      '초보자와 고수가 같은 경기에 섞이면 아무도 즐겁지 않습니다. 양쪽 모두 시간을 낭비한 기분이 들죠.',
  },
  {
    emoji: '🔍',
    title: '상대 찾기의 어려움',
    description:
      '카톡방 돌리고, 동호회 카페 뒤지고, 결국 인원 안 맞아서 경기 취소. 운동보다 상대 찾기가 더 힘듭니다.',
  },
  {
    emoji: '🚫',
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
      'ELO 레이팅, 경기 이력, 포지션 데이터를 종합 분석해 실력이 비슷한 상대를 자동으로 찾아드립니다.',
    stat: '정확도 94%',
    color: 'bg-blue-500',
    iconBg: 'bg-blue-50 dark:bg-blue-900/30',
    iconColor: 'text-blue-500',
  },
  {
    icon: Shield,
    title: '매너 점수 신뢰 시스템',
    description:
      '6항목 상호 평가와 3단계 허위 방지 시스템으로 매너 있는 경기 환경을 보장합니다.',
    stat: '노쇼율 2% 미만',
    color: 'bg-emerald-500',
    iconBg: 'bg-emerald-50 dark:bg-emerald-900/30',
    iconColor: 'text-emerald-500',
  },
  {
    icon: Target,
    title: '11개 종목 통합 플랫폼',
    description:
      '축구부터 아이스하키까지. 하나의 앱으로 모든 종목의 매칭, 팀 관리, 강좌를 해결합니다.',
    stat: '11종목 지원',
    color: 'bg-amber-500',
    iconBg: 'bg-amber-50 dark:bg-amber-900/30',
    iconColor: 'text-amber-600',
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
    bg: 'bg-emerald-500',
  },
  {
    initial: 'P',
    name: '박준형',
    role: 'Head of Product',
    bio: '토스 출신 PD. 복잡한 문제를 단순한 경험으로 바꾸는 데 진심입니다.',
    bg: 'bg-amber-500',
  },
  {
    initial: 'L',
    name: '이하은',
    role: 'Head of Design',
    bio: '스포츠를 사랑하는 디자이너. 선수의 눈높이에서 모든 화면을 설계합니다.',
    bg: 'bg-purple-500',
  },
];

const STATS = [
  { value: '2,400+', label: '매칭 완료', color: 'text-blue-500' },
  { value: '520+', label: '활성 팀', color: 'text-emerald-500' },
  { value: '11', label: '지원 종목', color: 'text-amber-700' },
  { value: '4.8', label: '평균 만족도', color: 'text-purple-500' },
];

/* ── Component ── */

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 overflow-x-hidden">

      <LandingNav />

      {/* ── Hero ── */}
      <section className="relative pt-32 pb-16 sm:pt-40 sm:pb-24 lg:pt-48 lg:pb-32">
        <div className="max-w-[1100px] mx-auto px-5">
          <div className="max-w-[680px] mx-auto text-center">
            <ScrollReveal delay={0}>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-gray-900 dark:text-white leading-[1.15] tracking-tight mb-6">
                Teameet을
                <br />
                만든 이유
              </h1>
            </ScrollReveal>

            <ScrollReveal delay={150}>
              <p className="text-lg lg:text-xl text-gray-500 dark:text-gray-400 leading-relaxed max-w-[540px] mx-auto">
                주말 아침, 풋살화 끈을 묶으며 설레는 마음.{' '}
                <br className="hidden sm:block" />
                그런데 상대가 없다면? 실력이 안 맞는다면?{' '}
                <br className="hidden sm:block" />
                우리는 그 설렘이 실망으로 바뀌는 순간을{' '}
                <br className="hidden sm:block" />
                없애고 싶었습니다.
              </p>
            </ScrollReveal>
          </div>
        </div>

        {/* Background — clean, no decorative blobs */}
      </section>

      {/* ── Mission ── */}
      <section className="pb-20 sm:pb-28">
        <div className="max-w-[800px] mx-auto px-5">
          <ScrollReveal>
            <div className="relative bg-gray-50 dark:bg-gray-800/50 rounded-3xl p-8 sm:p-12 text-center">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(49,130,246,0.06),transparent_60%)] rounded-3xl" />
              <div className="relative">
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-gray-900 dark:text-white leading-tight tracking-tight">
                  모든 사람이 자기 수준에 맞는
                  <br />
                  운동 상대를 쉽게 찾을 수 있는 세상
                </h2>
                <p className="text-md text-gray-500 dark:text-gray-400 mt-5 leading-relaxed max-w-[480px] mx-auto">
                  운동은 좋은 상대가 있어야 즐겁습니다.{' '}
                  <br className="hidden sm:block" />
                  Teameet은 기술로 그 상대를 연결하는 플랫폼입니다.
                </p>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── 우리가 해결하는 문제 — 비대칭 레이아웃 ── */}
      <section className="py-20 sm:py-28 bg-gray-50 dark:bg-gray-800/30">
        <div className="max-w-[960px] mx-auto px-5">
          <ScrollReveal>
            <div className="text-center mb-14">
              <h2 className="text-2xl lg:text-4xl font-bold text-gray-900 dark:text-white tracking-tight leading-tight">
                우리가 해결하는 문제
              </h2>
              <p className="text-md text-gray-500 dark:text-gray-400 mt-3 max-w-[400px] mx-auto">
                생활체육을 즐기는 사람이라면 누구나 겪는, 아무도 제대로 풀지 못한 문제들.
              </p>
            </div>
          </ScrollReveal>

          {/* 비대칭: 1개 큰 카드 + 2개 작은 카드 */}
          <div className="grid md:grid-cols-5 gap-5">
            <ScrollReveal delay={0}>
              <div className="md:col-span-3 bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-100 dark:border-gray-700 h-full">
                <div className="text-4xl mb-5">{PROBLEMS[0].emoji}</div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                  {PROBLEMS[0].title}
                </h3>
                <p className="text-base text-gray-500 dark:text-gray-400 leading-relaxed max-w-md">
                  {PROBLEMS[0].description}
                </p>
              </div>
            </ScrollReveal>
            <div className="md:col-span-2 flex flex-col gap-5">
              {PROBLEMS.slice(1).map((p, idx) => (
                <ScrollReveal key={p.title} delay={(idx + 1) * 100}>
                  <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700 h-full">
                    <div className="text-2xl mb-3">{p.emoji}</div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                      {p.title}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                      {p.description}
                    </p>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 해결 방식 — 넘버드 카드 (각각 다른 컬러) ── */}
      <section className="py-20 sm:py-28">
        <div className="max-w-[960px] mx-auto px-5">
          <ScrollReveal>
            <div className="mb-14">
              <h2 className="text-2xl lg:text-4xl font-bold text-gray-900 dark:text-white tracking-tight leading-tight">
                이렇게 해결합니다
              </h2>
              <p className="text-md text-gray-500 dark:text-gray-400 mt-3 max-w-[440px]">
                감에 의존하지 않습니다. 데이터와 기술로 근본을 해결합니다.
              </p>
            </div>
          </ScrollReveal>

          <div className="space-y-4">
            {APPROACHES.map((a, idx) => {
              const Icon = a.icon;
              return (
                <div key={a.title} className="group bg-white dark:bg-gray-800 rounded-2xl p-6 sm:p-8 border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors duration-300 flex flex-col sm:flex-row gap-5 sm:gap-6 sm:items-start">
                  <div className="flex items-center gap-4 sm:gap-5 shrink-0">
                    <span className="text-3xl font-black text-gray-200 dark:text-gray-700 tabular-nums">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <div className={`h-12 w-12 rounded-xl ${a.iconBg} flex items-center justify-center`}>
                      <Icon size={20} className={a.iconColor} />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                        {a.title}
                      </h3>
                      <span className={`text-xs font-bold ${a.iconColor} ${a.iconBg} rounded-full px-2.5 py-0.5`}>
                        {a.stat}
                      </span>
                    </div>
                    <p className="text-md text-gray-500 dark:text-gray-400 leading-relaxed">
                      {a.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 숫자 + 핵심 가치 통합 섹션 ── */}
      <section className="py-16 sm:py-24 bg-gray-50 dark:bg-gray-800/30">
        <div className="max-w-[960px] mx-auto px-5">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-start">
            {/* 숫자 */}
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight mb-8">
                숫자로 보는 Teameet
              </h2>
              <div className="grid grid-cols-2 gap-6">
                {STATS.map((stat) => (
                  <div key={stat.label}>
                    <span className={`text-3xl sm:text-4xl font-black ${stat.color} leading-none block`}>
                      {stat.value}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 block font-medium">
                      {stat.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 핵심 가치 — 리스트 형태 (카드 그리드 X) */}
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight mb-8">
                우리가 믿는 것
              </h2>
              <div className="space-y-5">
                <div className="flex gap-4 items-start">
                  <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
                    <Brain size={20} className="text-blue-500" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-white">기술로 해결</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                      AI와 데이터로 스포츠 매칭의 문제를 풀어갑니다.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4 items-start">
                  <div className="h-10 w-10 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center shrink-0">
                    <Heart size={20} className="text-red-500" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-white">선수 중심</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                      모든 결정은 선수의 경험을 기준으로 합니다.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4 items-start">
                  <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center shrink-0">
                    <Shield size={20} className="text-emerald-500" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-white">신뢰가 먼저</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                      공정한 경기 환경을 만드는 것이 최우선입니다.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 팀 — 2x2 with 다른 색상 ── */}
      <section className="py-20 sm:py-28">
        <div className="max-w-[960px] mx-auto px-5">
          <div className="mb-14">
            <h2 className="text-2xl lg:text-4xl font-bold text-gray-900 dark:text-white tracking-tight leading-tight">
              만드는 사람들
            </h2>
            <p className="text-md text-gray-500 dark:text-gray-400 mt-3 max-w-[400px]">
              스포츠를 사랑하고, 문제를 기술로 푸는 것에 진심인 사람들이 모였습니다.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-5">
            {TEAM.map((member) => (
              <div key={member.name} className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700 flex gap-5 items-start">
                <div
                  className={`h-14 w-14 rounded-full ${member.bg} flex items-center justify-center shrink-0`}
                >
                  <span className="text-white font-black text-xl">
                    {member.initial}
                  </span>
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    {member.name}
                  </h3>
                  <p className="text-sm text-gray-500 font-medium">
                    {member.role}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mt-2">
                    {member.bio}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="relative overflow-hidden bg-gray-900 dark:bg-black">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(49,130,246,0.12),transparent_60%)]" />
        <div className="relative max-w-[600px] mx-auto px-5 py-20 sm:py-28 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-6 tracking-tight leading-tight">
            더 나은 경기 경험,
            <br />
            지금 시작하세요
          </h2>
          <p className="text-md lg:text-lg text-gray-400 mb-10 leading-relaxed">
            당신의 피드백이 Teameet을 더 좋게 만듭니다.{' '}
            <br className="hidden sm:block" />
            함께 생활체육의 새로운 기준을 세워주세요.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2.5 bg-blue-500 text-white font-bold px-8 py-4 rounded-2xl text-lg hover:bg-blue-400 active:scale-[0.97] transition-[colors,transform] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
            >
              지금 시작하기
              <ArrowRight size={18} strokeWidth={2.5} />
            </Link>
            <Link
              href="/landing"
              className="inline-flex items-center justify-center gap-2 text-gray-400 rounded-xl px-6 py-3.5 text-md font-medium hover:text-white hover:bg-white/5 active:scale-[0.97] transition-[colors,transform] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
            >
              <TrendingUp size={16} />
              서비스 둘러보기
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
