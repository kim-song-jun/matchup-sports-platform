'use client';

import { useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ScrollReveal } from '@/components/landing/scroll-reveal';

/* ── Types ── */

type Category = '전체' | '서비스' | '매칭' | '결제' | '계정';

interface FaqItem {
  question: string;
  answer: string;
  category: Exclude<Category, '전체'>;
}

/* ── Data ── */

const CATEGORIES: Category[] = ['전체', '서비스', '매칭', '결제', '계정'];

const FAQ_ITEMS: FaqItem[] = [
  /* 서비스 */
  {
    category: '서비스',
    question: 'TeamMeet은 어떤 서비스인가요?',
    answer:
      'TeamMeet은 AI 기반 멀티스포츠 소셜 매칭 플랫폼입니다. 실력, 위치, 매너 점수를 종합 분석하여 나에게 가장 적합한 운동 상대를 자동으로 찾아드립니다. 개인 매칭부터 팀 매칭까지, 축구/풋살/농구/배드민턴 등 11개 종목을 지원합니다.',
  },
  {
    category: '서비스',
    question: '어떤 종목을 지원하나요?',
    answer:
      '현재 축구, 풋살, 농구, 배드민턴, 테니스, 야구, 배구, 수영, 아이스하키, 피겨스케이팅, 쇼트트랙 총 11개 종목을 지원합니다. 앞으로도 사용자 요청에 따라 종목을 지속적으로 확대할 예정입니다.',
  },
  {
    category: '서비스',
    question: '앱 다운로드는 어디서 하나요?',
    answer:
      'TeamMeet은 모바일 웹에서 바로 사용하실 수 있으며, iOS App Store와 Google Play Store에서도 앱을 다운로드하실 수 있습니다. 앱과 웹 모두 동일한 계정으로 이용 가능합니다.',
  },
  {
    category: '서비스',
    question: '서비스 이용 요금이 있나요?',
    answer:
      '기본 가입과 매칭 탐색은 무료입니다. 매치에 참가할 때는 호스트가 설정한 참가비가 부과될 수 있으며, 일부 프리미엄 기능(고급 통계 분석, 우선 매칭 등)은 별도 구독 플랜으로 제공됩니다.',
  },
  /* 매칭 */
  {
    category: '매칭',
    question: 'AI 매칭은 어떻게 작동하나요?',
    answer:
      'TeamMeet의 AI 매칭은 ELO 기반 실력 점수, 선호 포지션, 활동 지역, 가능 시간대, 매너 점수 등 다양한 요소를 종합 분석합니다. 경기를 할수록 데이터가 쌓여 매칭 정확도가 더욱 높아집니다. 목표는 치열하면서도 즐거운 경기를 만드는 것입니다.',
  },
  {
    category: '매칭',
    question: '실력 등급은 어떻게 매겨지나요?',
    answer:
      '가입 시 자기 신고를 기반으로 초기 등급이 배정되며, 이후 경기 결과와 상호 평가를 통해 ELO 점수가 자동 조정됩니다. 등급은 S, A, B, C, D 5단계로 나뉘며, 종목별로 별도 관리됩니다.',
  },
  {
    category: '매칭',
    question: '매칭 취소는 가능한가요?',
    answer:
      '매치 시작 24시간 전까지는 무료로 취소할 수 있습니다. 24시간 이내 취소 시에는 취소 수수료가 부과될 수 있으며, 반복적인 직전 취소는 매너 점수에 영향을 줄 수 있습니다.',
  },
  {
    category: '매칭',
    question: '노쇼 시 패널티는 어떻게 되나요?',
    answer:
      '사전 연락 없이 불참(노쇼)할 경우 매너 점수가 크게 차감되며, 참가비 환불이 불가합니다. 노쇼 3회 누적 시 일정 기간 매칭이 제한됩니다. 이를 통해 모든 참가자가 신뢰할 수 있는 환경을 유지합니다.',
  },
  {
    category: '매칭',
    question: '팀 매칭과 개인 매칭의 차이는 무엇인가요?',
    answer:
      '개인 매칭은 개별 참가자를 모아 팀을 구성하는 방식이고, 팀 매칭은 이미 구성된 팀끼리 상대를 찾는 방식입니다. 팀 매칭의 경우 팀 전체의 평균 실력과 전적을 기반으로 균형 잡힌 상대 팀을 매칭해드립니다.',
  },
  {
    category: '매칭',
    question: '용병(게스트) 참가는 어떻게 하나요?',
    answer:
      '팀 매치에서 인원이 부족할 경우 호스트가 용병 모집을 활성화할 수 있습니다. 용병으로 참가하고 싶은 개인은 해당 매치에 신청하면 되며, AI가 팀 밸런스를 고려하여 용병 배정을 최적화합니다.',
  },
  /* 결제 */
  {
    category: '결제',
    question: '결제 방법은 어떤 것이 있나요?',
    answer:
      '신용카드, 체크카드, 카카오페이, 네이버페이, 토스페이 등 주요 간편결제를 모두 지원합니다. 결제는 토스페이먼츠를 통해 안전하게 처리됩니다.',
  },
  {
    category: '결제',
    question: '환불 규정은 어떻게 되나요?',
    answer:
      '매치 시작 24시간 전 취소 시 전액 환불, 12~24시간 전 취소 시 50% 환불, 12시간 이내 취소 시 환불 불가가 기본 정책입니다. 천재지변이나 시설 사정으로 경기가 취소된 경우에는 전액 환불됩니다.',
  },
  {
    category: '결제',
    question: '참가비는 호스트가 정하나요?',
    answer:
      '네, 매치를 생성하는 호스트가 참가비를 직접 설정합니다. 시설 대여비, 장비 비용 등을 고려하여 자유롭게 설정할 수 있으며, 무료 매치도 가능합니다. 참가비에 플랫폼 수수료가 별도로 부과될 수 있습니다.',
  },
  {
    category: '결제',
    question: '결제 후 영수증은 받을 수 있나요?',
    answer:
      '결제 완료 시 등록된 이메일로 영수증이 자동 발송됩니다. 마이페이지의 결제 내역에서도 언제든지 영수증을 확인하고 다운로드할 수 있습니다.',
  },
  /* 계정 */
  {
    category: '계정',
    question: '프로필 수정은 어떻게 하나요?',
    answer:
      '마이페이지에서 프로필 사진, 닉네임, 활동 지역, 선호 종목 및 포지션, 실력 자기 평가 등을 자유롭게 수정할 수 있습니다. 변경 사항은 즉시 반영됩니다.',
  },
  {
    category: '계정',
    question: '탈퇴 방법은 어떻게 되나요?',
    answer:
      '마이페이지 > 설정 > 계정 관리에서 "회원 탈퇴"를 선택하시면 됩니다. 탈퇴 시 개인정보는 관련 법령에 따라 일정 기간 보관 후 완전 삭제됩니다. 진행 중인 매치가 있을 경우 정산 완료 후 탈퇴가 가능합니다.',
  },
  {
    category: '계정',
    question: '매너 점수란 무엇인가요?',
    answer:
      '매너 점수는 경기 후 상호 평가를 통해 산출되는 신뢰 지표입니다. 시간 준수, 스포츠맨십, 소통 등 6개 항목을 평가하며, 높은 매너 점수는 더 좋은 매칭 기회로 이어집니다. 매너 점수가 일정 수준 이하로 떨어지면 매칭에 제한이 생길 수 있습니다.',
  },
  {
    category: '계정',
    question: '소셜 로그인 연동은 어떻게 하나요?',
    answer:
      '카카오, 네이버, 애플 계정으로 간편 로그인이 가능합니다. 마이페이지 > 설정 > 계정 연동에서 추가 소셜 계정을 연동하거나 해제할 수 있습니다. 여러 소셜 계정을 하나의 TeamMeet 계정에 연결할 수 있습니다.',
  },
];

/* ── Accordion Component ── */

function AccordionItem({ item, isOpen, onToggle, id }: { item: FaqItem; isOpen: boolean; onToggle: () => void; id: string }) {
  const panelId = `${id}-panel`;
  return (
    <div className="border-b border-gray-100 dark:border-gray-800">
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        id={id}
        className="w-full flex items-center justify-between gap-4 py-5 px-1 text-left group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 rounded-lg"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="shrink-0 text-xs font-semibold text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-full">
            {item.category}
          </span>
          <span className="text-md sm:text-lg font-semibold text-gray-900 dark:text-white truncate group-hover:text-blue-500 transition-colors">
            {item.question}
          </span>
        </div>
        <ChevronDown
          size={18}
          className={`shrink-0 text-gray-400 transition-transform duration-300 ${
            isOpen ? 'rotate-180 text-blue-500' : ''
          }`}
        />
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={id}
        className="grid transition-[grid-template-rows,opacity] duration-300 ease-in-out"
        style={{
          gridTemplateRows: isOpen ? '1fr' : '0fr',
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div className="overflow-hidden">
          <p className="text-base sm:text-md text-gray-500 dark:text-gray-400 leading-relaxed pb-5 pl-1 pr-4">
            {item.answer}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Interactive FAQ Content ── */

export function FaqContent() {
  const [activeCategory, setActiveCategory] = useState<Category>('전체');
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const filteredItems =
    activeCategory === '전체' ? FAQ_ITEMS : FAQ_ITEMS.filter((item) => item.category === activeCategory);

  const handleToggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  const handleCategoryChange = (category: Category) => {
    setActiveCategory(category);
    setOpenIndex(null);
  };

  return (
    <>
      {/* ── Category Tabs ── */}
      <section className="pb-4">
        <div className="max-w-[760px] mx-auto px-5">
          <ScrollReveal delay={300}>
            <div className="flex overflow-x-auto gap-2 pb-2 -mx-5 px-5 scrollbar-hide sm:justify-center sm:mx-0 sm:px-0">
              {CATEGORIES.map((category) => (
                <button
                  key={category}
                  onClick={() => handleCategoryChange(category)}
                  className={`shrink-0 text-base font-semibold px-5 py-2.5 rounded-xl transition-[colors,transform,shadow] duration-200 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 ${
                    activeCategory === category
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── FAQ Accordion ── */}
      <section className="py-8 sm:py-12">
        <div className="max-w-[760px] mx-auto px-5">
          <ScrollReveal delay={100}>
            <div className="bg-white dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700 px-5 sm:px-8">
              {filteredItems.length > 0 ? (
                filteredItems.map((item, idx) => (
                  <AccordionItem
                    key={`${activeCategory}-${idx}`}
                    item={item}
                    isOpen={openIndex === idx}
                    onToggle={() => handleToggle(idx)}
                    id={`faq-${activeCategory}-${idx}`}
                  />
                ))
              ) : (
                <EmptyState
                  icon={Search}
                  title="해당 카테고리에 질문이 없어요"
                  description="다른 카테고리를 선택해보세요"
                  size="sm"
                />
              )}
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
