import Link from 'next/link';
import {
  UserPlus,
  SlidersHorizontal,
  Search,
  CreditCard,
  Trophy,
  TrendingUp,
  Users,
  ShieldCheck,
  MessageCircle,
  Star,
  MapPin,
  Swords,
  ShoppingBag,
  Tag,
  Handshake,
  Heart,
  ArrowRight,
  BookOpen,
  CheckCircle2,
} from 'lucide-react';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { LandingNav } from '@/components/landing/landing-nav';
import { LandingFooter } from '@/components/landing/landing-footer';

/* ── Data ── */

const STEPS = [
  {
    num: 1,
    icon: UserPlus,
    title: '회원가입',
    subtitle: '카카오 / 네이버 / 애플 3초 가입',
    description:
      '별도 인증 없이 소셜 계정으로 바로 가입할 수 있어요. 이름과 연락처만 확인하면 가입이 완료됩니다.',
    details: ['카카오, 네이버, 애플 로그인 지원', '추가 인증 절차 없음', '가입 후 바로 프로필 설정으로 이동'],
    mockBg: 'bg-blue-50 dark:bg-blue-900/20',
    mockAccent: 'bg-blue-500',
    mockItems: ['카카오로 시작하기', '네이버로 시작하기', '애플로 시작하기'],
  },
  {
    num: 2,
    icon: SlidersHorizontal,
    title: '프로필 설정',
    subtitle: '종목 / 실력 레벨 / 활동 지역',
    description:
      '관심 종목과 현재 실력 수준, 선호하는 활동 지역을 설정하세요. AI가 이 정보를 기반으로 최적의 상대를 찾아드려요.',
    details: ['11개 종목 중 복수 선택 가능', '실력 레벨: 입문 ~ 프로 (5단계)', '활동 지역은 여러 곳 등록 가능'],
    mockBg: 'bg-blue-50 dark:bg-blue-900/20',
    mockAccent: 'bg-blue-500',
    mockItems: ['종목 선택', '실력 레벨', '활동 지역'],
  },
  {
    num: 3,
    icon: Search,
    title: '매치 탐색',
    subtitle: 'AI 추천 or 직접 검색',
    description:
      'AI가 실력, 거리, 매너 점수를 종합 분석해 추천하는 매치를 확인하거나, 종목/지역/시간대로 직접 검색할 수 있어요.',
    details: ['AI 추천 매치 목록 제공', '종목, 지역, 날짜, 시간대 필터', '매치 상세 정보 미리보기'],
    mockBg: 'bg-blue-50 dark:bg-blue-900/20',
    mockAccent: 'bg-blue-500',
    mockItems: ['AI 추천', '직접 검색', '필터 설정'],
  },
  {
    num: 4,
    icon: CreditCard,
    title: '매치 참가',
    subtitle: '결제 > 확정 > 채팅방 자동 생성',
    description:
      '마음에 드는 매치를 찾으면 참가 신청 후 결제하세요. 결제가 완료되면 매치가 확정되고, 참가자들의 채팅방이 자동으로 만들어집니다.',
    details: ['토스페이먼츠 간편 결제', '참가 확정 즉시 알림 발송', '채팅방에서 장소/시간 조율'],
    mockBg: 'bg-blue-50 dark:bg-blue-900/20',
    mockAccent: 'bg-blue-500',
    mockItems: ['결제하기', '참가 확정', '채팅방 입장'],
  },
  {
    num: 5,
    icon: Trophy,
    title: '경기 & 평가',
    subtitle: '도착 확인 > 경기 > 상호 평가',
    description:
      '경기장에 도착하면 도착 확인을 해주세요. 경기가 끝나면 상대방의 실력과 매너를 평가합니다. 이 평가가 AI 매칭의 정확도를 높여요.',
    details: ['GPS 기반 도착 확인', '6항목 상호 평가 시스템', '노쇼 방지를 위한 3단계 검증'],
    mockBg: 'bg-blue-50 dark:bg-blue-900/20',
    mockAccent: 'bg-blue-500',
    mockItems: ['도착 확인', '경기 진행', '상호 평가'],
  },
  {
    num: 6,
    icon: TrendingUp,
    title: '성장',
    subtitle: 'ELO 레이팅 / 뱃지 / 매너 점수',
    description:
      '경기와 평가를 반복할수록 ELO 레이팅이 정교해지고, 활동에 따라 뱃지를 획득할 수 있어요. 매너 점수가 높을수록 더 좋은 매치에 참여할 수 있습니다.',
    details: ['ELO 기반 실력 레이팅 자동 산출', '활동 뱃지 시스템', '매너 점수에 따른 우선 매칭'],
    mockBg: 'bg-blue-50 dark:bg-blue-900/20',
    mockAccent: 'bg-blue-500',
    mockItems: ['레이팅 확인', '뱃지 수집', '매너 점수'],
  },
];

const TEAM_FEATURES = [
  {
    icon: Users,
    title: '팀 등록',
    description: '팀 이름, 종목, 활동 지역, 멤버를 등록하세요. 팀 전체의 ELO가 자동으로 산출됩니다.',
  },
  {
    icon: Swords,
    title: '팀 매치 생성',
    description: '원하는 날짜와 시간, 장소를 정해 팀 매치를 생성하면 AI가 비슷한 실력의 상대 팀을 찾아드려요.',
  },
  {
    icon: ShieldCheck,
    title: '실력 균형 매칭',
    description: '팀원들의 개인 ELO를 종합해 팀 실력을 측정하고, 균형 잡힌 상대를 매칭합니다.',
  },
  {
    icon: MessageCircle,
    title: '팀 채팅',
    description: '매치가 성사되면 양 팀 대표 간 채팅방이 열려요. 세부 규칙과 장소를 조율할 수 있습니다.',
  },
  {
    icon: Star,
    title: '팀 평가',
    description: '경기 후 상대 팀에 대한 평가를 남기세요. 팀 단위 매너 점수와 전적이 쌓여요.',
  },
  {
    icon: MapPin,
    title: '시설 연동',
    description: '등록된 체육 시설 정보를 확인하고, 매치 생성 시 시설을 바로 선택할 수 있어요.',
  },
];

const MERCENARY_FEATURES = [
  {
    icon: UserPlus,
    title: '용병 구인',
    description: '인원이 부족할 때 용병 모집 글을 올리세요. 종목, 포지션, 실력 레벨로 딱 맞는 용병을 찾을 수 있어요.',
  },
  {
    icon: Handshake,
    title: '용병 지원',
    description: '빈 시간에 용병으로 참여하고 싶다면 모집 글에 지원하세요. 실력과 매너 점수가 함께 표시돼요.',
  },
  {
    icon: ShoppingBag,
    title: '장터 등록',
    description: '더 이상 사용하지 않는 운동 장비를 판매하거나, 필요한 장비를 구매할 수 있어요.',
  },
  {
    icon: Tag,
    title: '카테고리 검색',
    description: '종목별, 장비 종류별로 필터링해서 원하는 물품을 빠르게 찾으세요.',
  },
  {
    icon: Heart,
    title: '찜하기',
    description: '관심 있는 물품을 찜 목록에 저장하고, 가격 변동 시 알림을 받을 수 있어요.',
  },
  {
    icon: CheckCircle2,
    title: '거래 완료',
    description: '채팅으로 거래를 조율하고, 거래 완료 후 상호 평가를 남겨 신뢰도를 쌓으세요.',
  },
];

/* ── Component ── */

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 overflow-x-hidden">

      {/* ── Nav ── */}
      <LandingNav />

      {/* ── Hero ── */}
      <section className="relative pt-32 pb-16 sm:pt-40 sm:pb-20 lg:pt-44 lg:pb-24">
        <div className="max-w-[1100px] mx-auto px-5">
          <div className="max-w-[680px] mx-auto text-center">
            <ScrollReveal delay={0}>
              <div className="inline-flex items-center gap-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-sm font-semibold px-4 py-2 rounded-full mb-6">
                <BookOpen size={14} />
                서비스 가이드
              </div>
            </ScrollReveal>

            <ScrollReveal delay={100}>
              <h1 className="text-3xl sm:text-5xl lg:text-5xl font-black text-gray-900 dark:text-white leading-[1.15] tracking-tight mb-5">
                이용 가이드
              </h1>
            </ScrollReveal>

            <ScrollReveal delay={200}>
              <p className="text-lg lg:text-xl text-gray-500 dark:text-gray-400 leading-relaxed max-w-[480px] mx-auto">
                가입부터 매칭, 경기, 평가까지.
                <br className="hidden sm:block" />
                TeamMeet 서비스 이용의 모든 것을 안내합니다.
              </p>
            </ScrollReveal>
          </div>
        </div>

        <div className="absolute top-20 -right-32 w-[500px] h-[500px] bg-blue-100/40 dark:bg-blue-900/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-32 w-[400px] h-[400px] bg-blue-100/30 dark:bg-blue-900/10 rounded-full blur-3xl pointer-events-none" />
      </section>

      {/* ── Step-by-Step Tutorial ── */}
      <section className="py-16 sm:py-20 bg-gray-50 dark:bg-gray-800/30">
        <div className="max-w-[960px] mx-auto px-5">
          <ScrollReveal>
            <div className="text-center mb-14">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full mb-4">
                시작하기
              </span>
              <h2 className="text-2xl lg:text-4xl font-bold text-gray-900 dark:text-white tracking-tight leading-tight">
                6단계로 시작하는 스포츠 매칭
              </h2>
              <p className="text-md text-gray-500 dark:text-gray-400 mt-3 max-w-[400px] mx-auto leading-relaxed">
                처음 사용하시는 분도 쉽게 따라할 수 있어요.
              </p>
            </div>
          </ScrollReveal>

          <div className="space-y-8 lg:space-y-12">
            {STEPS.map((step, idx) => {
              const Icon = step.icon;
              const isEven = idx % 2 === 1;
              return (
                <ScrollReveal key={step.num} delay={idx * 100}>
                  <div
                    className={`bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 lg:p-8 lg:flex lg:items-center lg:gap-10 ${
                      isEven ? 'lg:flex-row-reverse' : ''
                    }`}
                  >
                    {/* Text Content */}
                    <div className="flex-1 mb-6 lg:mb-0">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="h-10 w-10 rounded-full bg-blue-500 text-white font-bold flex items-center justify-center text-md shrink-0 shadow-lg shadow-blue-500/20">
                          {step.num}
                        </div>
                        <div className="h-10 w-10 rounded-xl bg-gray-50 dark:bg-gray-700 flex items-center justify-center">
                          <Icon size={20} className="text-gray-600 dark:text-gray-300" />
                        </div>
                      </div>
                      <h3 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white mb-1">
                        {step.title}
                      </h3>
                      <p className="text-sm font-medium text-blue-500 mb-3">{step.subtitle}</p>
                      <p className="text-md text-gray-500 dark:text-gray-400 leading-relaxed mb-5">
                        {step.description}
                      </p>
                      <ul className="space-y-2">
                        {step.details.map((detail) => (
                          <li key={detail} className="flex items-start gap-2.5 text-base text-gray-600 dark:text-gray-400">
                            <CheckCircle2
                              size={16}
                              className="text-blue-500 mt-0.5 shrink-0"
                            />
                            <span>{detail}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Mock UI Preview */}
                    <div className="lg:w-[280px] shrink-0">
                      <div
                        className={`${step.mockBg} rounded-2xl p-5 border border-gray-100/50 dark:border-gray-700/50`}
                      >
                        <div className="flex items-center gap-2 mb-4">
                          <div className={`h-2 w-2 rounded-full ${step.mockAccent}`} />
                          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                            {step.title}
                          </div>
                        </div>
                        <div className="space-y-2.5">
                          {step.mockItems.map((item, i) => (
                            <div
                              key={item}
                              className={`bg-white dark:bg-gray-800 rounded-xl px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-100 dark:border-gray-700 flex items-center justify-between ${
                                i === 0 ? 'ring-2 ring-blue-500/20' : ''
                              }`}
                            >
                              <span>{item}</span>
                              {i === 0 && (
                                <div className="h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center">
                                  <CheckCircle2 size={12} className="text-white" />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${step.mockAccent}`}
                            style={{ width: `${((step.num) / 6) * 100}%` }}
                          />
                        </div>
                        <div className="mt-2 text-right text-xs text-gray-500 dark:text-gray-400 font-medium">
                          {step.num} / 6 단계
                        </div>
                      </div>
                    </div>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Team Matching Guide ── */}
      <section className="py-20 sm:py-28">
        <div className="max-w-[960px] mx-auto px-5">
          <ScrollReveal>
            <div className="text-center mb-14">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full mb-4">
                <Users size={13} />
                팀 매칭
              </span>
              <h2 className="text-2xl lg:text-4xl font-bold text-gray-900 dark:text-white tracking-tight leading-tight">
                팀 매칭 이용법
              </h2>
              <p className="text-md text-gray-500 dark:text-gray-400 mt-3 max-w-[440px] mx-auto leading-relaxed">
                팀을 등록하고 비슷한 실력의 상대 팀과 매칭하세요.
                <br className="hidden sm:block" />
                AI가 팀 전체의 실력 균형을 분석해드려요.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {TEAM_FEATURES.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <ScrollReveal key={feature.title} delay={idx * 100}>
                  <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700 hover:shadow-lg hover:-translate-y-1 transition-[colors,transform,shadow] duration-300 h-full">
                    <div className="h-11 w-11 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mb-4">
                      <Icon size={20} className="text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-base text-gray-500 dark:text-gray-400 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>

          {/* Team Flow Summary */}
          <ScrollReveal delay={100}>
            <div className="mt-10 bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-6 lg:p-8 border border-blue-100 dark:border-blue-800/30">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                팀 매칭 흐름 요약
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {['팀 등록', '매치 생성', 'AI 상대 매칭', '양 팀 확정', '경기 진행', '상호 평가'].map(
                  (item, i, arr) => (
                    <div key={item} className="flex items-center gap-2">
                      <span className="bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800/40">
                        {item}
                      </span>
                      {i < arr.length - 1 && (
                        <ArrowRight size={14} className="text-blue-400 shrink-0" />
                      )}
                    </div>
                  ),
                )}
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Mercenary & Marketplace Guide ── */}
      <section className="py-20 sm:py-28 bg-gray-50 dark:bg-gray-800/30">
        <div className="max-w-[960px] mx-auto px-5">
          <ScrollReveal>
            <div className="text-center mb-14">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full mb-4">
                <ShoppingBag size={13} />
                용병 & 장터
              </span>
              <h2 className="text-2xl lg:text-4xl font-bold text-gray-900 dark:text-white tracking-tight leading-tight">
                용병 / 장터 이용법
              </h2>
              <p className="text-md text-gray-500 dark:text-gray-400 mt-3 max-w-[440px] mx-auto leading-relaxed">
                인원이 부족할 때 용병을 구하거나,
                <br className="hidden sm:block" />
                운동 장비를 사고팔 수 있어요.
              </p>
            </div>
          </ScrollReveal>

          {/* Two-column split */}
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Mercenary */}
            <ScrollReveal delay={0}>
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden h-full">
                <div className="bg-blue-500 px-6 py-4">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Handshake size={18} />
                    용병 시스템
                  </h3>
                </div>
                <div className="p-6 space-y-4">
                  {MERCENARY_FEATURES.slice(0, 2).map((feature) => {
                    const Icon = feature.icon;
                    return (
                      <div key={feature.title} className="flex gap-4">
                        <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                          <Icon size={18} className="text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <h4 className="text-md font-bold text-gray-900 dark:text-white mb-1">
                            {feature.title}
                          </h4>
                          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                            {feature.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
                    <div className="flex flex-wrap gap-2">
                      {['포지션별 검색', '실력 레벨 필터', '매너 점수 표시', '즉시 채팅'].map((tag) => (
                        <span
                          key={tag}
                          className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-lg"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </ScrollReveal>

            {/* Marketplace */}
            <ScrollReveal delay={100}>
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden h-full">
                <div className="bg-blue-500 px-6 py-4">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <ShoppingBag size={18} />
                    장터
                  </h3>
                </div>
                <div className="p-6 space-y-4">
                  {MERCENARY_FEATURES.slice(2).map((feature) => {
                    const Icon = feature.icon;
                    return (
                      <div key={feature.title} className="flex gap-4">
                        <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                          <Icon size={18} className="text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <h4 className="text-md font-bold text-gray-900 dark:text-white mb-1">
                            {feature.title}
                          </h4>
                          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                            {feature.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
                    <div className="flex flex-wrap gap-2">
                      {['종목별 카테고리', '가격 협상', '찜하기 알림', '거래 후 평가'].map((tag) => (
                        <span
                          key={tag}
                          className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-lg"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="relative overflow-hidden bg-gray-900 dark:bg-black">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(49,130,246,0.12),transparent_60%)]" />
        <div className="relative max-w-[600px] mx-auto px-5 py-20 sm:py-28 text-center">
          <ScrollReveal>
            <p className="text-base text-blue-400 font-semibold mb-4">
              가입 3초, 첫 매칭 무료
            </p>
            <h2 className="text-2xl lg:text-4xl font-bold text-white mb-5 tracking-tight leading-tight">
              이제 직접 경험해보세요
            </h2>
            <p className="text-md lg:text-lg text-gray-400 mb-10 leading-relaxed">
              가이드를 다 읽으셨다면 준비 완료.
              <br className="hidden sm:block" />
              지금 가입하고 첫 매치를 시작하세요.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2.5 bg-blue-500 text-white font-bold px-8 py-4 rounded-2xl text-lg hover:bg-blue-400 hover:shadow-xl hover:shadow-blue-500/30 active:scale-[0.97] transition-[colors,transform,shadow] duration-200 shadow-lg shadow-blue-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
            >
              지금 시작하기
              <ArrowRight size={18} strokeWidth={2.5} />
            </Link>
          </ScrollReveal>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
