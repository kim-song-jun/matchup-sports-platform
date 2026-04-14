import Link from 'next/link';
import { Check, ArrowRight, Sparkles, CreditCard, Users, Zap } from 'lucide-react';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { LandingNav } from '@/components/landing/landing-nav';
import { LandingFooter } from '@/components/landing/landing-footer';
import { PricingFaq } from './pricing-faq';

/* ── Data ── */

const PLANS = [
  {
    id: 'free',
    name: '무료',
    price: '0',
    priceLabel: '원',
    period: '',
    description: '가볍게 시작하는 생활체육',
    icon: Sparkles,
    iconBg: 'bg-gray-100 dark:bg-gray-700',
    iconColor: 'text-gray-500 dark:text-gray-400',
    recommended: false,
    features: [
      '기본 매칭 (월 5회)',
      '1:1 채팅',
      '기본 프로필',
      '경기 일정 관리',
      '커뮤니티 접근',
    ],
    cta: '무료로 시작하기',
    ctaStyle:
      'bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100',
  },
  {
    id: 'pro',
    name: '프로',
    price: '9,900',
    priceLabel: '원',
    period: '/월',
    description: '본격적인 매칭과 성장 분석',
    icon: Zap,
    iconBg: 'bg-blue-100 dark:bg-blue-900/40',
    iconColor: 'text-blue-500',
    recommended: true,
    features: [
      '무제한 매칭',
      'AI 맞춤 추천',
      '상세 통계 & 성장 리포트',
      '우선 매칭 (대기 없이 빠르게)',
      '프리미엄 뱃지',
      '매너 점수 상세 분석',
    ],
    cta: '프로 시작하기',
    ctaStyle:
      'bg-blue-500 text-white hover:bg-blue-600',
  },
  {
    id: 'team',
    name: '팀',
    price: '19,900',
    priceLabel: '원',
    period: '/월',
    description: '팀 단위 매칭과 관리 올인원',
    icon: Users,
    iconBg: 'bg-violet-100 dark:bg-violet-900/40',
    iconColor: 'text-violet-500',
    recommended: false,
    features: [
      '팀 매칭 무제한',
      '팀 통계 대시보드',
      '대회 참가 신청',
      '팀 전용 채팅방',
      '선수 관리 & 출석부',
      '상대 팀 분석 리포트',
    ],
    cta: '팀 시작하기',
    ctaStyle:
      'bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100',
  },
] as const;

/* ── Component ── */

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 overflow-x-hidden">

      {/* ── Nav ── */}
      <LandingNav />

      {/* ── Hero ── */}
      <section className="relative pt-32 pb-14 sm:pt-40 sm:pb-18 lg:pt-44 lg:pb-20">
        <div className="max-w-[1100px] mx-auto px-5 text-center">
          <ScrollReveal delay={0}>
            <div className="inline-flex items-center gap-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-sm font-semibold px-4 py-2 rounded-full mb-6">
              <CreditCard size={14} />
              투명한 요금 정책
            </div>
          </ScrollReveal>
          <ScrollReveal delay={100}>
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-gray-900 dark:text-white leading-[1.15] tracking-tight mb-5">
              요금 안내
            </h1>
          </ScrollReveal>
          <ScrollReveal delay={200}>
            <p className="text-lg lg:text-xl text-gray-500 dark:text-gray-400 leading-relaxed max-w-[480px] mx-auto">
              투명하고 합리적인 가격.{' '}
              <br className="hidden sm:block" />
              필요한 만큼만 선택하세요.
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Pricing Cards ── */}
      <section className="pb-20 sm:pb-28">
        <div className="max-w-[1100px] mx-auto px-5">
          <div className="grid md:grid-cols-3 gap-6 lg:gap-8 max-w-[960px] mx-auto">
            {PLANS.map((plan, idx) => {
              const Icon = plan.icon;
              return (
                <ScrollReveal key={plan.id} delay={idx * 120}>
                  <div
                    className={`relative bg-white dark:bg-gray-800 rounded-2xl p-7 lg:p-8 border h-full flex flex-col transition-[colors,transform] duration-300 hover:-translate-y-0.5 ${
                      plan.recommended
                        ? 'border-blue-500 ring-2 ring-blue-500'
                        : 'border-gray-100 dark:border-gray-700'
                    }`}
                  >
                    {/* Recommended badge */}
                    {plan.recommended && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                        <span className="inline-flex items-center gap-1.5 bg-blue-500 text-white text-xs font-semibold px-4 py-1.5 rounded-full">
                          <Sparkles size={12} />
                          추천
                        </span>
                      </div>
                    )}

                    {/* Header */}
                    <div className="mb-6">
                      <div className={`h-11 w-11 rounded-xl ${plan.iconBg} flex items-center justify-center mb-4`}>
                        <Icon size={20} className={plan.iconColor} />
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                        {plan.name}
                      </h3>
                      <p className="text-sm text-gray-500">{plan.description}</p>
                    </div>

                    {/* Price */}
                    <div className="mb-7">
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl lg:text-5xl font-black text-gray-900 dark:text-white tracking-tight leading-none">
                          {plan.price}
                        </span>
                        <span className="text-md font-medium text-gray-500">
                          {plan.priceLabel}
                        </span>
                        {plan.period && (
                          <span className="text-base text-gray-500">{plan.period}</span>
                        )}
                      </div>
                    </div>

                    {/* Features */}
                    <ul className="space-y-3 mb-8 flex-1" role="list">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-3">
                          <div
                            className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                              plan.recommended
                                ? 'bg-blue-100 dark:bg-blue-900/40'
                                : 'bg-gray-100 dark:bg-gray-700'
                            }`}
                          >
                            <Check
                              size={12}
                              strokeWidth={3}
                              className={
                                plan.recommended
                                  ? 'text-blue-500'
                                  : 'text-gray-500 dark:text-gray-400'
                              }
                            />
                          </div>
                          <span className="text-base text-gray-600 dark:text-gray-300 leading-snug">
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {/* CTA */}
                    <Link
                      href="/login"
                      className={`w-full inline-flex items-center justify-center font-semibold rounded-xl px-6 py-3.5 text-base transition-[colors,transform] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 ${plan.ctaStyle}`}
                    >
                      {plan.cta}
                    </Link>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Match Fee ── */}
      <section className="py-16 sm:py-20 bg-gray-50 dark:bg-gray-800/30">
        <div className="max-w-[760px] mx-auto px-5">
          <ScrollReveal>
            <div className="text-center mb-10">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full mb-4">
                <CreditCard size={14} />
                매치 참가비
              </span>
              <h2 className="text-2xl lg:text-4xl font-bold text-gray-900 dark:text-white tracking-tight leading-tight">
                개별 매치 참가비 안내
              </h2>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={100}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-7 lg:p-10 border border-gray-100 dark:border-gray-700 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none">
              <div className="grid sm:grid-cols-3 gap-6 sm:gap-8 mb-8">
                <div className="text-center">
                  <div className="text-sm text-gray-500 font-medium mb-2">참가비 범위</div>
                  <div className="text-2xl lg:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                    5,000 ~ 30,000
                    <span className="text-base font-medium text-gray-500 ml-1">원</span>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-gray-500 font-medium mb-2">설정 주체</div>
                  <div className="text-2xl lg:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                    호스트
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-gray-500 font-medium mb-2">플랫폼 수수료</div>
                  <div className="text-2xl lg:text-3xl font-black text-blue-500 tracking-tight">
                    10%
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 dark:border-gray-700 pt-6">
                <div className="space-y-3">
                  {[
                    '매치별 참가비는 호스트가 매치 생성 시 직접 설정합니다.',
                    '참가비에는 시설 이용료, 장비 대여비 등이 포함될 수 있습니다.',
                    '플랫폼 수수료 10%는 참가비에서 자동 차감되어 정산됩니다.',
                    '매치 시작 24시간 전까지 취소 시 전액 환불됩니다.',
                  ].map((text) => (
                    <div key={text} className="flex items-start gap-2.5">
                      <Check size={14} strokeWidth={3} className="text-blue-500 shrink-0 mt-1" />
                      <span className="text-base text-gray-600 dark:text-gray-400 leading-relaxed">
                        {text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-20 sm:py-28">
        <div className="max-w-[680px] mx-auto px-5">
          <ScrollReveal>
            <div className="text-center mb-12">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full mb-4">
                자주 묻는 질문
              </span>
              <h2 className="text-2xl lg:text-4xl font-bold text-gray-900 dark:text-white tracking-tight leading-tight">
                요금 관련 FAQ
              </h2>
            </div>
          </ScrollReveal>

          {/* Interactive FAQ accordion */}
          <PricingFaq />
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="relative overflow-hidden bg-gray-900 dark:bg-black">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(49,130,246,0.12),transparent_60%)]" />
        <div className="relative max-w-[600px] mx-auto px-5 py-20 sm:py-28 text-center">
          <ScrollReveal>
            <p className="text-base text-blue-400 font-semibold mb-4">
              가입은 무료, 업그레이드는 언제든
            </p>
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-6 tracking-tight leading-tight">
              지금 무료로 시작하세요
            </h2>
            <p className="text-md lg:text-lg text-gray-400 mb-10 leading-relaxed">
              무료 요금제로 매칭을 체험하고,{' '}
              <br className="hidden sm:block" />
              더 필요할 때 업그레이드하세요.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2.5 bg-blue-500 text-white font-bold px-8 py-4 rounded-2xl text-lg hover:bg-blue-400 active:scale-[0.97] transition-[colors,transform] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
            >
              무료로 시작하기
              <ArrowRight size={18} strokeWidth={2.5} />
            </Link>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Footer ── */}
      <LandingFooter />
    </div>
  );
}
