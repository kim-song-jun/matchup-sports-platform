'use client';

import { useState } from 'react';
import { Sparkles, Zap, Infinity, ShoppingCart } from 'lucide-react';
import { LessonTicketPlan, TicketType } from '@/types/api';
import { formatAmount } from '@/lib/utils';

// Mock plans for when API provides none
const MOCK_PLANS: LessonTicketPlan[] = [
  {
    id: 'mock-single',
    lessonId: '',
    name: '일일 체험',
    type: 'single',
    price: 30000,
    isActive: true,
    sortOrder: 0,
    description: '부담 없이 첫 수업을 경험해보세요',
  },
  {
    id: 'mock-multi',
    lessonId: '',
    name: '정기수강',
    type: 'multi',
    price: 200000,
    originalPrice: 240000,
    totalSessions: 8,
    isActive: true,
    sortOrder: 1,
    description: '꾸준히 실력을 키워보세요',
  },
  {
    id: 'mock-unlimited',
    lessonId: '',
    name: '무제한 수강',
    type: 'unlimited',
    price: 150000,
    validDays: 30,
    isActive: true,
    sortOrder: 2,
    description: '한 달 동안 자유롭게 수강하세요',
  },
];

const PLAN_META: Record<
  TicketType,
  {
    icon: React.ReactNode;
    label: (plan: LessonTicketPlan) => string;
    subtitle: (plan: LessonTicketPlan) => string;
    popular?: boolean;
  }
> = {
  single: {
    icon: <Zap size={18} />,
    label: () => '1회 체험',
    subtitle: () => '부담 없이 시작',
  },
  multi: {
    icon: <Sparkles size={18} />,
    label: (p) => `${p.totalSessions ?? 0}회 수강권`,
    subtitle: (p) =>
      p.totalSessions && p.totalSessions > 0
        ? `회당 ${formatAmount(Math.round(p.price / p.totalSessions))}`
        : '정기 수강',
    popular: true,
  },
  unlimited: {
    icon: <Infinity size={18} />,
    label: (p) => `${p.validDays ?? 30}일 무제한`,
    subtitle: () => '자유롭게 수강',
  },
};

interface TicketPlanSelectorProps {
  plans?: LessonTicketPlan[];
  onSelect?: (plan: LessonTicketPlan) => void;
  onPurchase?: (plan: LessonTicketPlan) => void;
}

export function TicketPlanSelector({ plans, onSelect, onPurchase }: TicketPlanSelectorProps) {
  const activePlans = (plans && plans.length > 0 ? plans : MOCK_PLANS).filter(
    (p) => p.isActive,
  );
  const [selectedId, setSelectedId] = useState<string>(activePlans[0]?.id ?? '');

  const selectedPlan = activePlans.find((p) => p.id === selectedId);

  function handleSelect(plan: LessonTicketPlan) {
    setSelectedId(plan.id);
    onSelect?.(plan);
  }

  function handlePurchase() {
    if (selectedPlan) {
      onPurchase?.(selectedPlan);
    }
  }

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">수강권 선택</h3>

      <div className="space-y-3">
        {activePlans.map((plan) => {
          const meta = PLAN_META[plan.type];
          const isSelected = plan.id === selectedId;
          const discountPct =
            plan.originalPrice && plan.originalPrice > plan.price
              ? Math.round((1 - plan.price / plan.originalPrice) * 100)
              : null;

          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => handleSelect(plan)}
              className={[
                'relative w-full text-left rounded-2xl p-4 transition-[border-color,background-color,box-shadow] duration-200',
                'border-2',
                isSelected
                  ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-900/20'
                  : 'border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/40 hover:border-gray-200 dark:hover:border-gray-600',
              ].join(' ')}
              aria-pressed={isSelected}
              aria-label={`${meta.label(plan)} 수강권 선택`}
            >
              {/* Popular badge */}
              {meta.popular && (
                <span className="absolute -top-2.5 left-4 rounded-full bg-blue-500 px-2.5 py-0.5 text-xs font-bold text-white shadow-sm">
                  가장 인기
                </span>
              )}

              <div className="flex items-start gap-3">
                {/* Radio indicator */}
                <span
                  className={[
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                    isSelected
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-gray-300 dark:border-gray-500',
                  ].join(' ')}
                  aria-hidden="true"
                >
                  {isSelected && (
                    <span className="h-2 w-2 rounded-full bg-white" />
                  )}
                </span>

                {/* Plan info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={[
                        'flex items-center gap-1 text-sm font-semibold',
                        isSelected
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-gray-700 dark:text-gray-200',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'shrink-0',
                          isSelected ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500',
                        ].join(' ')}
                        aria-hidden="true"
                      >
                        {meta.icon}
                      </span>
                      {meta.label(plan)}
                    </span>

                    {discountPct !== null && (
                      <span className="rounded-full bg-red-50 dark:bg-red-900/30 px-1.5 py-0.5 text-xs font-bold text-red-500 dark:text-red-400">
                        {discountPct}% 할인
                      </span>
                    )}
                  </div>

                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {meta.subtitle(plan)}
                  </p>

                  {plan.description && (
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
                      {plan.description}
                    </p>
                  )}
                </div>

                {/* Price */}
                <div className="shrink-0 text-right">
                  {plan.originalPrice && plan.originalPrice > plan.price && (
                    <p className="text-xs text-gray-400 line-through tabular-nums">
                      {formatAmount(plan.originalPrice)}
                    </p>
                  )}
                  <p
                    className={[
                      'text-base font-black tabular-nums',
                      isSelected
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-gray-900 dark:text-white',
                    ].join(' ')}
                  >
                    {formatAmount(plan.price)}
                  </p>
                </div>
              </div>

            </button>
          );
        })}
      </div>

      {/* Purchase CTA */}
      <button
        type="button"
        onClick={handlePurchase}
        disabled={!selectedPlan}
        className={[
          'mt-4 w-full flex items-center justify-center gap-2',
          'rounded-2xl py-3.5 text-base font-bold transition-colors',
          selectedPlan
            ? 'bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed',
        ].join(' ')}
        aria-label={
          selectedPlan
            ? `${PLAN_META[selectedPlan.type].label(selectedPlan)} 구매 — ${formatAmount(selectedPlan.price)}`
            : '수강권 구매'
        }
      >
        <ShoppingCart size={18} aria-hidden="true" />
        수강권 구매
        {selectedPlan && (
          <span className="ml-1 opacity-80">· {formatAmount(selectedPlan.price)}</span>
        )}
      </button>

      <p className="mt-2.5 text-center text-xs text-gray-400 dark:text-gray-500">
        구매 후 7일 내 미사용 시 전액 환불
      </p>
    </div>
  );
}
