'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, CreditCard } from 'lucide-react';
import Link from 'next/link';
import { usePayments } from '@/hooks/use-api';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { formatAmount, formatFullDate } from '@/lib/utils';
import { getPaymentMethodMeta, getPaymentSource, paymentStatusConfig } from '@/lib/payment-ui';
import { Input } from '@/components/ui/input';
import { MobileGlassHeader } from '@/components/layout/mobile-glass-header';

const tabs = [
  { id: 'all', label: '전체' },
  { id: 'match', label: '매치' },
  { id: 'lesson', label: '강좌' },
  { id: 'marketplace', label: '장터' },
];

export default function PaymentsPage() {
  const [activeTab, setActiveTab] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const { data: paymentsData, isLoading, isError, refetch } = usePayments();
  const payments = paymentsData?.items ?? [];

  const filteredPayments = useMemo(() => {
    return payments
      .filter((payment) => {
        const source = getPaymentSource(payment);
        if (activeTab !== 'all' && source.kind !== activeTab) {
          return false;
        }
        if (dateFrom && payment.createdAt < dateFrom) {
          return false;
        }
        if (dateTo && payment.createdAt > `${dateTo}T23:59:59`) {
          return false;
        }
        return true;
      })
      .map((payment) => ({
        payment,
        source: getPaymentSource(payment),
        method: getPaymentMethodMeta(payment.method),
        status: paymentStatusConfig[payment.status] ?? paymentStatusConfig.pending,
      }));
  }, [activeTab, dateFrom, dateTo, payments]);

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 dark:bg-gray-900">
      <MobileGlassHeader title="결제 내역" showBack />

      <div className="hidden @3xl:block px-5 @3xl:px-0 pt-4 pb-3">
        <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">결제 내역</h1>
        <p className="text-xs text-gray-500 mt-0.5">실제 결제와 환불 상태를 확인하세요</p>
      </div>

      <div className="px-5 @3xl:px-0">
        <div className="flex items-center gap-2 mb-4">
          <label htmlFor="payment-date-from" className="sr-only">시작 날짜</label>
          <Input
            id="payment-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="flex-1"
          />
          <span className="text-sm text-gray-500" aria-hidden="true">~</span>
          <label htmlFor="payment-date-to" className="sr-only">종료 날짜</label>
          <Input
            id="payment-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="flex-1"
          />
        </div>

        <div className="flex items-center gap-1 mb-5 rounded-xl bg-gray-100 p-1 overflow-x-auto scrollbar-hide" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-24 rounded-2xl bg-gray-100 dark:bg-gray-800" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState message="결제 내역을 불러오지 못했어요" onRetry={() => void refetch()} />
        ) : filteredPayments.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="아직 결제 내역이 없어요"
            description="매치 참가 결제를 완료하면 여기서 확인할 수 있어요"
          />
        ) : (
          <div className="space-y-3 stagger-children">
            {filteredPayments.map(({ payment, source, method, status }) => {
              const StatusIcon = status.icon;
              const MethodIcon = method.icon;
              const SourceIcon = source.icon;

              return (
                <Link
                  key={payment.id}
                  href={`/payments/${payment.id}`}
                  className="block rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-[0.98] transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${source.color} shrink-0`}>
                        <SourceIcon size={20} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-base font-semibold text-gray-900 dark:text-white truncate">{source.title}</p>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${status.bgColor} ${status.color}`}>
                            {status.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <MethodIcon size={12} />
                            {method.label}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{formatFullDate(payment.createdAt)}</span>
                        </div>
                        {source.venueName && (
                          <p className="mt-1 text-xs text-gray-400 truncate">{source.venueName}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <span className="block text-md font-bold text-gray-900 dark:text-white">
                          {formatAmount(payment.amount)}
                        </span>
                        <div className="mt-1 flex items-center justify-end gap-1 text-2xs text-gray-400">
                          <StatusIcon size={12} />
                          <span>{source.label}</span>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-gray-300" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
      <div className="h-24" />
    </div>
  );
}
