'use client';

import { useEffect, useState } from 'react';
import { Sparkles, Zap, Infinity, ShoppingCart, Ticket } from 'lucide-react';
import { LessonTicketPlan, TicketType } from '@/types/api';
import { formatAmount } from '@/lib/utils';

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
  purchaseDisabled?: boolean;
  purchaseDisabledLabel?: string;
}

export function TicketPlanSelector({
  plans,
  onSelect,
  onPurchase,
  purchaseDisabled = false,
  purchaseDisabledLabel,
}: TicketPlanSelectorProps) {
  const activePlans = (plans ?? []).filter((p) => p.isActive);
  const [selectedId, setSelectedId] = useState<string>('');

  useEffect(() => {
    if (activePlans.length === 0) {
      if (selectedId) {
        setSelectedId('');
      }
      return;
    }

    const selectedPlan = activePlans.find((plan) => plan.id === selectedId);
    if (selectedPlan) {
      return;
    }

    setSelectedId(activePlans[0].id);
    onSelect?.(activePlans[0]);
  }, [activePlans, onSelect, selectedId]);

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

  if (activePlans.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-start gap-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/60">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-gray-500 dark:bg-gray-900 dark:text-gray-300">
            <Ticket size={18} aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">현재 판매 중인 수강권이 없어요</p>
            <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
              등록된 ticket plan이 없는 강좌라서 이 화면에서 가짜 구매 옵션을 대신 보여주지 않습니다.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
      <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4">수강권 선택</h3>

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
                isSelected
                  ? 'ring-2 ring-blue-500 border border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                  : 'border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/40 hover:border-gray-300',
              ].join(' ')}
              aria-pressed={isSelected}
              aria-label={`${meta.label(plan)} 수강권 선택`}
            >
              {/* Popular badge */}
              {meta.popular && (
                <span className="absolute -top-2.5 left-4 rounded-full bg-blue-500 px-2.5 py-0.5 text-2xs font-bold text-white shadow-sm">
                  가장 인기
                </span>
              )}

              <div className="flex items-start gap-3">
                {/* Radio indicator */}
                <span
                  className={[
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
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
                      <span className="rounded-full bg-red-50 dark:bg-red-900/30 px-1.5 py-0.5 text-2xs font-bold text-red-500 dark:text-red-400">
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
        disabled={!selectedPlan || purchaseDisabled}
        className={[
          'mt-4 w-full flex items-center justify-center gap-2',
          'rounded-2xl py-3 text-base font-bold transition-colors',
          selectedPlan && !purchaseDisabled
            ? 'bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed',
        ].join(' ')}
        aria-label={
          selectedPlan
            ? purchaseDisabled
              ? purchaseDisabledLabel ?? '수강권 구매 불가'
              : `${PLAN_META[selectedPlan.type].label(selectedPlan)} 구매 — ${formatAmount(selectedPlan.price)}`
            : '수강권 구매'
        }
      >
        <ShoppingCart size={18} aria-hidden="true" />
        {purchaseDisabled ? purchaseDisabledLabel ?? '수강권 구매 불가' : '수강권 구매'}
        {selectedPlan && !purchaseDisabled ? (
          <span className="ml-1 opacity-80">· {formatAmount(selectedPlan.price)}</span>
        ) : null}
      </button>

      <p className="mt-2.5 text-center text-xs text-gray-400 dark:text-gray-500">
        구매 후 7일 내 미사용 시 전액 환불
      </p>
    </div>
  );
}
