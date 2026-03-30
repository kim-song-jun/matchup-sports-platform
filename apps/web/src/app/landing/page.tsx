'use client';

import { useRef } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  ChevronDown,
  Shield,
  Sparkles,
  Star,
  Target,
  Users,
  Zap,
} from 'lucide-react';
import { SportIconMap } from '@/components/icons/sport-icons';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { LandingNav } from '@/components/landing/landing-nav';
import { LandingFooter } from '@/components/landing/landing-footer';

const SPORTS = [
  { key: 'soccer', name: '축구', tone: 'from-emerald-400/20 to-emerald-500/5' },
  { key: 'futsal', name: '풋살', tone: 'from-sky-400/20 to-sky-500/5' },
  { key: 'basketball', name: '농구', tone: 'from-amber-400/20 to-amber-500/5' },
  { key: 'badminton', name: '배드민턴', tone: 'from-cyan-400/20 to-cyan-500/5' },
  { key: 'tennis', name: '테니스', tone: 'from-rose-400/20 to-rose-500/5' },
  { key: 'baseball', name: '야구', tone: 'from-orange-400/20 to-orange-500/5' },
  { key: 'volleyball', name: '배구', tone: 'from-indigo-400/20 to-indigo-500/5' },
  { key: 'swimming', name: '수영', tone: 'from-blue-400/20 to-blue-500/5' },
  { key: 'ice_hockey', name: '아이스하키', tone: 'from-slate-400/20 to-slate-500/5' },
  { key: 'figure_skating', name: '피겨', tone: 'from-violet-400/20 to-violet-500/5' },
  { key: 'short_track', name: '쇼트트랙', tone: 'from-slate-300/20 to-slate-400/5' },
];

const SUB_FEATURES = [
  { icon: Users, title: '팀 매칭', description: '팀 실력과 조건을 정리해 균형 잡힌 상대를 빠르게 제안합니다.' },
  { icon: Shield, title: '신뢰 시스템', description: '평가, 기록, 매너 정보를 함께 보여줘 신뢰를 먼저 확인할 수 있습니다.' },
  { icon: Zap, title: '올인원 운영', description: '매칭, 채팅, 결제, 평가까지 한 흐름 안에서 연결됩니다.' },
];

const STEPS = [
  { num: 1, title: '프로필 만들기', description: '종목, 레벨, 선호 조건을 입력해 기본 매칭 기준을 세웁니다.' },
  { num: 2, title: '매치 참가', description: '추천 매치를 고르거나 직접 만들어 필요한 사람을 모읍니다.' },
  { num: 3, title: '평가하고 성장하기', description: '경기 후 평가와 기록이 쌓이며 프로필 신뢰도가 점점 정교해집니다.' },
];

const TESTIMONIALS = [
  { quote: '실력 차이 때문에 흐트러지던 경기가 줄었고, 설명 없이도 구조가 직관적이라 계속 쓰게 됩니다.', author: '김민수', detail: '축구 B등급 · 47경기', rating: 5, sport: 'soccer' },
  { quote: '노쇼 대응과 평가 흐름이 깔끔해서 팀 운영 화면처럼 신뢰가 보입니다.', author: '이수진', detail: '풋살 A등급 팀장 · FC 번개', rating: 5, sport: 'futsal' },
  { quote: '선수 프로필과 일정 정보가 한 번에 보여서 경기 전 준비 시간이 확실히 줄었습니다.', author: '박지영', detail: '배드민턴 C등급 · 32경기', rating: 4, sport: 'badminton' },
];

const STATS = [
  { value: '2,400+', label: '매칭 완료' },
  { value: '520+', label: '활성 팀' },
  { value: '4.8', label: '평균 만족도' },
  { value: '98%', label: '재매칭률' },
];

export default function LandingPage() {
  const featuresRef = useRef<HTMLDivElement>(null);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.2),transparent_28%),radial-gradient(circle_at_20%_20%,rgba(15,23,42,0.25),transparent_24%),linear-gradient(180deg,#08111f_0%,#0b1324_42%,#eef4fb_42.1%,#eef4fb_100%)] text-slate-900 dark:bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),transparent_28%),linear-gradient(180deg,#020617_0%,#0f172a_40%,#0f172a_100%)] dark:text-white">
      <LandingNav />

      <main>
        <section className="relative pt-28 pb-20 sm:pt-36 sm:pb-24 lg:pt-40 lg:pb-28">
          <div className="absolute inset-x-0 top-0 -z-10 h-[480px] bg-[radial-gradient(circle_at_50%_12%,rgba(125,211,252,0.28),transparent_56%)]" />
          <div className="mx-auto max-w-[1180px] px-5">
            <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="max-w-2xl">
                <ScrollReveal>
                  <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-white/10 px-4 py-2 text-sm font-medium text-sky-100 backdrop-blur-md dark:bg-white/10">
                    <Sparkles size={14} />
                    MatchUp v2
                  </div>
                </ScrollReveal>

                <ScrollReveal delay={90}>
                  <h1 className="mt-6 text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
                    매칭은 더 선명하게,
                    <span className="block text-sky-300">프로필은 더 믿을 수 있게.</span>
                  </h1>
                </ScrollReveal>

                <ScrollReveal delay={180}>
                  <p className="mt-5 max-w-xl text-base leading-8 text-slate-300 sm:text-lg">
                    MatchUp은 실력, 매너, 거리, 일정 정보를 정리된 화면으로 보여주고 매칭, 채팅, 결제, 평가를 하나의 전문적인 흐름으로 연결합니다.
                  </p>
                </ScrollReveal>

                <ScrollReveal delay={270}>
                  <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <Link
                      href="/login"
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-sky-300 px-7 py-4 text-base font-bold text-slate-950 shadow-lg shadow-sky-500/20 transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:bg-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60"
                    >
                      무료로 시작하기
                      <ArrowRight size={18} />
                    </Link>
                    <button
                      type="button"
                      onClick={() => featuresRef.current?.scrollIntoView({ behavior: 'smooth' })}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/10 px-7 py-4 text-base font-semibold text-white transition-colors hover:bg-white/15"
                    >
                      더 알아보기
                      <ChevronDown size={18} />
                    </button>
                  </div>
                </ScrollReveal>

                <ScrollReveal delay={360}>
                  <div className="mt-8 flex flex-wrap gap-3">
                    {[
                      '신뢰 중심 매칭',
                      '선수 프로필 운영',
                      '선택적 glass chrome',
                    ].map((item) => (
                      <div key={item} className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm text-slate-200 backdrop-blur-md">
                        {item}
                      </div>
                    ))}
                  </div>
                </ScrollReveal>
              </div>

              <ScrollReveal className="relative">
                <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/10 p-4 shadow-[0_24px_100px_rgba(2,6,23,0.38)] backdrop-blur-2xl">
                  <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.12),transparent_40%,rgba(56,189,248,0.08))]" />
                  <div className="relative rounded-[1.6rem] border border-white/10 bg-slate-950/60 p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-200/70">MatchUp Dashboard</p>
                        <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">신뢰 기반 매칭 운영 화면</h2>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-xs text-slate-300">v2</div>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3">
                      {STATS.map((stat) => (
                        <div key={stat.label} className="rounded-2xl border border-white/10 bg-white/10 p-4">
                          <div className="text-2xl font-black tracking-tight text-white">{stat.value}</div>
                          <div className="mt-1 text-xs text-slate-400">{stat.label}</div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 space-y-3">
                      {[
                        { label: '실력 매칭', value: '94%' },
                        { label: '매너 점수', value: '98%' },
                        { label: '거리 적합도', value: '2.1km' },
                      ].map((item) => (
                        <div key={item.label}>
                          <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                            <span>{item.label}</span>
                            <span className="font-semibold text-sky-200">{item.value}</span>
                          </div>
                          <div className="h-2 rounded-full bg-white/10">
                            <div className="h-full rounded-full bg-gradient-to-r from-sky-300 to-cyan-300" style={{ width: item.value === '2.1km' ? '82%' : item.value === '98%' ? '98%' : '94%' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            </div>
          </div>
        </section>

        <section className="pb-20 sm:pb-24">
          <div className="mx-auto max-w-[1180px] px-5">
            <ScrollReveal>
              <div className="grid grid-cols-2 gap-3 rounded-[2rem] border border-slate-200/80 bg-white/90 p-4 shadow-[0_16px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-white/10 sm:grid-cols-4">
                {STATS.map((stat) => (
                  <div key={stat.label} className="rounded-2xl bg-slate-50 p-5 text-center dark:bg-white/5">
                    <div className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">{stat.value}</div>
                    <div className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">{stat.label}</div>
                  </div>
                ))}
              </div>
            </ScrollReveal>
          </div>
        </section>

        <section className="pb-20 sm:pb-24">
          <div className="mx-auto max-w-[1180px] px-5">
            <ScrollReveal>
              <div className="max-w-3xl">
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-sky-300">왜 MatchUp인가</p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                  전문성이 느껴지는 구조는 정보의 우선순위에서 시작됩니다.
                </h2>
                <p className="mt-4 text-base leading-8 text-slate-600 dark:text-slate-300">
                  매치 표면과 프로필 표면을 분리하고, glass morphism은 상단 chrome과 요약 패널에만 제한해 읽기 쉬우면서도 무게감 있는 화면을 유지합니다.
                </p>
              </div>
            </ScrollReveal>

            <div ref={featuresRef} className="mt-10 grid gap-5 md:grid-cols-3">
              <ScrollReveal className="md:col-span-3">
                <div className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-slate-950 p-6 text-white shadow-[0_18px_60px_rgba(15,23,42,0.16)] dark:border-white/10">
                  <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
                    <div>
                      <div className="inline-flex items-center gap-2 rounded-full bg-sky-400/15 px-3 py-1 text-xs font-semibold text-sky-200">
                        <Target size={14} /> 핵심 기능
                      </div>
                      <h3 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">AI 매칭과 신뢰 검증을 함께 보입니다.</h3>
                      <p className="mt-3 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
                        MatchUp은 실력, 위치, 매너, ELO 정보를 하나의 흐름으로 보여주고, 전체 기능은 유지하되 화면의 밀도를 재배치합니다.
                      </p>
                      <div className="mt-5 flex flex-wrap gap-2">
                        {['실력 분석', '위치 매칭', '매너 필터', 'ELO 반영'].map((tag) => (
                          <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs text-slate-200">
                            <Check size={12} className="text-sky-300" />
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-[1.5rem] border border-white/10 bg-white/10 p-5 backdrop-blur-md">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-300 text-sm font-black text-slate-950">K</div>
                        <div>
                          <div className="text-sm font-semibold text-white">김민수</div>
                          <div className="text-xs text-slate-400">축구 · B등급</div>
                        </div>
                      </div>
                      <div className="mt-4 space-y-2.5">
                        {[
                          { label: '실력 매칭', value: '94%' },
                          { label: '매너 점수', value: '98%' },
                          { label: '거리', value: '2.1km' },
                        ].map((item) => (
                          <div key={item.label}>
                            <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                              <span>{item.label}</span>
                              <span className="font-semibold text-sky-200">{item.value}</span>
                            </div>
                            <div className="h-2 rounded-full bg-white/10">
                              <div className="h-full rounded-full bg-gradient-to-r from-sky-300 to-cyan-300" style={{ width: item.value === '2.1km' ? '82%' : item.value === '98%' ? '98%' : '94%' }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollReveal>

              {SUB_FEATURES.map((feature, idx) => {
                const Icon = feature.icon;
                return (
                  <ScrollReveal key={feature.title} delay={idx * 90}>
                    <div className="h-full rounded-[1.75rem] border border-slate-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.08)] transition-transform hover:-translate-y-1 dark:border-white/10 dark:bg-white/10">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/20">
                        <Icon size={20} />
                      </div>
                      <h3 className="mt-5 text-lg font-bold text-slate-950 dark:text-white">{feature.title}</h3>
                      <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">{feature.description}</p>
                    </div>
                  </ScrollReveal>
                );
              })}
            </div>
          </div>
        </section>

        <section className="py-20 sm:py-24">
          <div className="mx-auto max-w-[1180px] px-5">
            <ScrollReveal>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="max-w-2xl">
                  <p className="text-sm font-semibold uppercase tracking-[0.28em] text-sky-300">이용 방법</p>
                  <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                    3단계로 시작하는 MatchUp
                  </h2>
                </div>
                <p className="max-w-md text-sm leading-7 text-slate-600 dark:text-slate-400">
                  기능을 덜어내지 않고, 시작부터 결과까지의 흐름을 명확하게 나눠서 화면을 읽기 쉽게 만들었습니다.
                </p>
              </div>
            </ScrollReveal>

            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {STEPS.map((step, idx) => (
                <ScrollReveal key={step.num} delay={idx * 100}>
                  <div className="rounded-[1.75rem] border border-slate-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/10">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-base font-bold text-white">
                      {step.num}
                    </div>
                    <h3 className="mt-5 text-lg font-bold text-slate-950 dark:text-white">{step.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">{step.description}</p>
                  </div>
                </ScrollReveal>
              ))}
            </div>

            <ScrollReveal className="mt-10">
              <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
                {SPORTS.map((sport) => {
                  const Icon = SportIconMap[sport.key];
                  return (
                    <div
                      key={sport.key}
                      className="flex w-[112px] shrink-0 flex-col items-center gap-2.5 rounded-[1.5rem] border border-slate-200/80 bg-white px-4 py-5 text-center shadow-[0_10px_28px_rgba(15,23,42,0.06)] transition-transform hover:-translate-y-1 dark:border-white/10 dark:bg-white/10"
                    >
                      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${sport.tone}`}>
                        {Icon && <Icon size={20} className="text-slate-700 dark:text-slate-200" />}
                      </div>
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{sport.name}</span>
                    </div>
                  );
                })}
              </div>
            </ScrollReveal>
          </div>
        </section>

        <section className="py-20 sm:py-24">
          <div className="mx-auto max-w-[1180px] px-5">
            <ScrollReveal>
              <div className="max-w-3xl">
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-sky-300">사용자 후기</p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                  이미 많은 선수들이 MatchUp을 쓰고 있습니다.
                </h2>
                <p className="mt-3 text-base text-slate-500 dark:text-slate-400">
                  평균 만족도 <span className="font-semibold text-amber-500">4.8</span> / 5.0 · 리뷰 <span className="font-semibold text-slate-700 dark:text-slate-200">340</span>건
                </p>
              </div>
            </ScrollReveal>

            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {TESTIMONIALS.map((item, idx) => {
                const SportIcon = SportIconMap[item.sport];
                return (
                  <ScrollReveal key={item.author} delay={idx * 100}>
                    <div className="flex h-full flex-col rounded-[1.75rem] border border-slate-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/10">
                      <div className="flex gap-0.5" role="img" aria-label={`${item.rating}점 만점`}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            size={14}
                            className={i < item.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200 dark:text-slate-600'}
                            aria-hidden="true"
                          />
                        ))}
                      </div>
                      <p className="mt-4 flex-1 text-sm leading-7 text-slate-600 dark:text-slate-300">
                        &ldquo;{item.quote}&rdquo;
                      </p>
                      <div className="mt-5 flex items-center gap-3 border-t border-slate-200/80 pt-4 dark:border-white/10">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white">
                          {SportIcon ? <SportIcon size={18} /> : <span className="text-sm font-bold">{item.author.charAt(0)}</span>}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-950 dark:text-white">{item.author}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{item.detail}</p>
                        </div>
                      </div>
                    </div>
                  </ScrollReveal>
                );
              })}
            </div>
          </div>
        </section>

        <section className="border-t border-white/10 bg-slate-950 text-white">
          <div className="mx-auto max-w-[960px] px-5 py-20 text-center sm:py-24">
            <ScrollReveal>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-sky-200/80">가입은 3초, 첫 매칭은 무료</p>
              <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
                지금 바로 MatchUp의 v2 경험을 시작하세요.
              </h2>
              <p className="mt-4 text-base leading-8 text-slate-300">
                기능은 그대로 두고, 보는 방식만 정리했습니다. 더 빠르게 읽히고 더 전문적으로 보이는 매칭 플랫폼을 제공합니다.
              </p>
              <Link
                href="/login"
                className="mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-sky-300 px-8 py-4 text-base font-bold text-slate-950 shadow-lg shadow-sky-500/20 transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:bg-sky-200"
              >
                무료로 시작하기
                <ArrowRight size={18} />
              </Link>
            </ScrollReveal>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
