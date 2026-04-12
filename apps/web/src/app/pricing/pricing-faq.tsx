'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ScrollReveal } from '@/components/landing/scroll-reveal';

const FAQ_ITEMS = [
  {
    q: '무료로도 쓸 수 있나요?',
    a: '네, 무료 요금제만으로도 월 5회 매칭, 채팅, 기본 프로필 등 핵심 기능을 이용할 수 있습니다. 유료 구독 없이도 충분히 매치를 즐길 수 있어요.',
  },
  {
    q: '환불 정책은 어떻게 되나요?',
    a: '구독 결제일로부터 7일 이내 환불 요청 시 전액 환불됩니다. 7일 이후에는 남은 기간에 비례하여 환불해드려요. 매치 참가비는 매치 시작 24시간 전까지 전액 환불 가능합니다.',
  },
  {
    q: '프로 구독은 어떻게 해지하나요?',
    a: '마이페이지 > 구독 관리에서 언제든 해지할 수 있습니다. 해지 후에도 결제 기간 종료일까지는 프로 기능을 그대로 이용할 수 있어요. 위약금은 없습니다.',
  },
  {
    q: '매치 참가비는 어떻게 결제하나요?',
    a: '매치에 참가 신청할 때 카드, 카카오페이, 토스페이 등으로 간편 결제할 수 있습니다. 결제된 참가비는 경기 종료 후 호스트에게 정산됩니다.',
  },
  {
    q: '팀 요금제는 팀 전체에 적용되나요?',
    a: '네, 팀 요금제 하나로 팀원 전원(최대 30명)이 팀 매칭, 팀 통계, 대회 참가 등 팀 전용 기능을 이용할 수 있습니다. 팀장(결제자) 1명만 구독하면 됩니다.',
  },
  {
    q: '플랫폼 수수료는 얼마인가요?',
    a: '매치 참가비의 10%가 플랫폼 수수료로 적용됩니다. 예를 들어, 참가비가 10,000원이면 호스트에게 9,000원이 정산돼요. 구독 요금에는 별도 수수료가 없습니다.',
  },
];

export function PricingFaq() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      {FAQ_ITEMS.map((item, idx) => (
        <ScrollReveal key={item.q} delay={idx * 60}>
          <div
            className={`bg-white dark:bg-gray-800 rounded-2xl border transition-colors duration-200 ${
              openFaq === idx
                ? 'border-blue-200 dark:border-blue-800'
                : 'border-gray-100 dark:border-gray-700'
            }`}
          >
            <button
              onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
              className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 rounded-2xl"
              aria-expanded={openFaq === idx}
            >
              <span className="text-md font-semibold text-gray-900 dark:text-white">
                {item.q}
              </span>
              <ChevronDown
                size={18}
                className={`text-gray-400 shrink-0 transition-transform duration-300 ${
                  openFaq === idx ? 'rotate-180' : ''
                }`}
              />
            </button>
            <div
              className={`overflow-hidden transition-[max-height,opacity] duration-300 ${
                openFaq === idx ? 'max-h-[300px] opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <div className="px-6 pb-5">
                <p className="text-base text-gray-500 dark:text-gray-400 leading-relaxed">
                  {item.a}
                </p>
              </div>
            </div>
          </div>
        </ScrollReveal>
      ))}
    </div>
  );
}
