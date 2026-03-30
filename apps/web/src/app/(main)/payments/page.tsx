'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CreditCard, CheckCircle, XCircle, Clock, RotateCcw, Wallet, ShoppingBag, Trophy, GraduationCap, ChevronRight, Receipt, CalendarDays } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { usePayments } from '@/hooks/use-api';
import { EmptyState } from '@/components/ui/empty-state';
import { formatAmount, formatFullDate } from '@/lib/utils';

const tabs = [
  { id: 'all', label: '전체' },
  { id: 'match', label: '매치' },
  { id: 'lesson', label: '강좌' },
  { id: 'market', label: '장터' },
] as const;

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle; badgeClass: string }> = {
  completed: { label: '결제 완료', icon: CheckCircle, badgeClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200' },
  pending: { label: '대기중', icon: Clock, badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-200' },
  refunded: { label: '환불됨', icon: RotateCcw, badgeClass: 'bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-200' },
  failed: { label: '실패', icon: XCircle, badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
};

const methodConfig: Record<string, { label: string; icon: typeof CreditCard }> = {
  card: { label: '카드', icon: CreditCard },
  tosspay: { label: '토스페이', icon: Wallet },
  naverpay: { label: '네이버페이', icon: Wallet },
  kakaopay: { label: '카카오페이', icon: Wallet },
};

const typeConfig: Record<string, { label: string; icon: typeof Trophy; chipClass: string }> = {
  match: { label: '매치', icon: Trophy, chipClass: 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-200' },
  lesson: { label: '강좌', icon: GraduationCap, chipClass: 'bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-200' },
  market: { label: '장터', icon: ShoppingBag, chipClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
};

const surfaceCard =
  'rounded-[28px] border border-slate-200/70 bg-white/90 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-black/20';

const softCard =
  'rounded-[24px] border border-slate-200/60 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/78 dark:shadow-black/10';

const mockPayments = [
  {
    id: 'pay_mock_001',
    type: 'match',
    name: '풋살 친선 매치',
    amount: 14500,
    status: 'completed',
    method: 'card',
    createdAt: '2026-03-20T10:30:00',
  },
  {
    id: 'pay_mock_002',
    type: 'match',
    name: '농구 3:3 매치',
    amount: 20000,
    status: 'refunded',
    method: 'tosspay',
    createdAt: '2026-03-15T14:20:00',
  },
  {
    id: 'pay_mock_003',
    type: 'lesson',
    name: '배드민턴 초급 강좌',
    amount: 35000,
    status: 'completed',
    method: 'kakaopay',
    createdAt: '2026-03-12T09:00:00',
  },
  {
    id: 'pay_mock_004',
    type: 'match',
    name: '풋살 리그전',
    amount: 18000,
    status: 'pending',
    method: 'naverpay',
    createdAt: '2026-03-19T16:45:00',
  },
  {
    id: 'pay_mock_005',
    type: 'market',
    name: '축구화 나이키 팬텀',
    amount: 85000,
    status: 'completed',
    method: 'card',
    createdAt: '2026-03-10T11:30:00',
  },
  {
    id: 'pay_mock_006',
    type: 'lesson',
    name: '아이스하키 입문반',
    amount: 60000,
    status: 'failed',
    method: 'card',
    createdAt: '2026-03-08T13:15:00',
  },
];

export default function PaymentsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]['id']>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const { data: apiPayments } = usePayments();

  const payments = apiPayments
    ? apiPayments.map((payment) => ({
        id: payment.id,
        type: 'match' as string,
        name: payment.orderId || '결제',
        amount: payment.amount,
        status: payment.status,
        method: payment.method || 'card',
        createdAt: payment.createdAt,
      }))
    : mockPayments;

  const filtered = useMemo(() => {
    const tabFiltered = activeTab === 'all'
      ? payments
      : payments.filter((payment) => payment.type === activeTab);

    return tabFiltered.filter((payment) => {
      if (dateFrom && payment.createdAt < dateFrom) return false;
      if (dateTo && payment.createdAt > `${dateTo}T23:59:59`) return false;
      return true;
    });
  }, [activeTab, dateFrom, dateTo, payments]);

  const summary = [
    { label: '건수', value: `${filtered.length}건` },
    { label: '완료 금액', value: formatAmount(filtered.filter((payment) => payment.status === 'completed').reduce((sum, payment) => sum + payment.amount, 0)) },
    { label: '환불/실패', value: `${filtered.filter((payment) => ['refunded', 'failed'].includes(payment.status)).length}건` },
  ];

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
      <section className="px-5 @3xl:px-0 pt-4">
        <div className={`${surfaceCard} overflow-hidden p-6 sm:p-7`}>
          <div className="flex flex-col gap-5 @3xl:flex-row @3xl:items-end @3xl:justify-between">
            <div className="max-w-2xl">
              <div className="eyebrow-chip">
                <Receipt size={14} />
                MatchUp Ledger
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                결제 이력도 같은 톤으로 정리합니다.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
                매치, 강좌, 장터 결제를 한곳에서 확인하고 상태와 결제 수단을 빠르게 구분할 수 있도록 구성했습니다.
              </p>
            </div>
            <button
              onClick={() => router.back()}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-slate-200/70 bg-white/70 px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-white dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              <ArrowLeft size={14} />
              이전 화면
            </button>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {summary.map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{item.label}</p>
                <p className="mt-2 text-2xl font-black tracking-tight text-slate-950 dark:text-white">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 @3xl:px-0 mt-4">
        <div className="solid-panel rounded-[24px] p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <label className="relative">
              <span className="sr-only">시작일</span>
              <CalendarDays className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="input-surface py-3.5 pl-11 pr-4 text-base outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              />
            </label>

            <span className="hidden text-sm font-medium text-slate-500 sm:block">~</span>

            <label className="relative">
              <span className="sr-only">종료일</span>
              <CalendarDays className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="input-surface py-3.5 pl-11 pr-4 text-base outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              />
            </label>
          </div>

          <div className="mt-4 segmented-control scrollbar-hide overflow-x-auto pb-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`segmented-pill shrink-0 ${activeTab === tab.id ? 'is-active' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 @3xl:px-0 mt-4">
        {filtered.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="아직 결제 내역이 없어요"
            description="매치나 강좌를 신청하면 여기서 상태를 확인할 수 있어요"
          />
        ) : (
          <div className="space-y-3 stagger-children">
            {filtered.map((payment) => {
              const status = statusConfig[payment.status] || statusConfig.pending;
              const method = methodConfig[payment.method] || methodConfig.card;
              const type = typeConfig[payment.type] || typeConfig.match;
              const StatusIcon = status.icon;
              const MethodIcon = method.icon;
              const TypeIcon = type.icon;

              return (
                <Link
                  key={payment.id}
                  href={`/payments/${payment.id}`}
                  className={`${softCard} block p-4 transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(15,23,42,0.08)] dark:hover:bg-slate-900`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200/70 bg-white/70 dark:border-slate-800 dark:bg-slate-900/70">
                      <TypeIcon size={20} className="text-slate-600 dark:text-slate-200" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${type.chipClass}`}>{type.label}</span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.badgeClass}`}>
                          <StatusIcon size={12} />
                          {status.label}
                        </span>
                      </div>

                      <div className="mt-3 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-semibold text-slate-950 dark:text-white">{payment.name}</h3>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="inline-flex items-center gap-1">
                              <MethodIcon size={12} />
                              {method.label}
                            </span>
                            <span>·</span>
                            <span>{formatFullDate(payment.createdAt)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-base font-black tracking-tight text-slate-950 dark:text-white">{formatAmount(payment.amount)}</span>
                          <ChevronRight size={16} className="text-slate-300 dark:text-slate-600" />
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
