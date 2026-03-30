'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle,
  Clock,
  CreditCard,
  Receipt,
  Calendar,
  MapPin,
  ChevronRight,
  Copy,
  RotateCcw,
} from 'lucide-react';
import { formatAmount, formatDateTime } from '@/lib/utils';

const surfaceCard =
  'rounded-[28px] border border-slate-200/70 bg-white/90 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-black/20';

const solidCard =
  'rounded-[24px] border border-slate-200/70 bg-white/80 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-950/75';

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle; panelClass: string; badgeClass: string; iconClass: string }> = {
  completed: {
    label: '결제 완료',
    icon: CheckCircle,
    panelClass: 'bg-emerald-50/80 dark:bg-emerald-400/10',
    badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200',
    iconClass: 'text-emerald-600 dark:text-emerald-200',
  },
  pending: {
    label: '결제 대기',
    icon: Clock,
    panelClass: 'bg-amber-50/80 dark:bg-amber-400/10',
    badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-400/10 dark:text-amber-200',
    iconClass: 'text-amber-600 dark:text-amber-200',
  },
  refunded: {
    label: '환불 완료',
    icon: RotateCcw,
    panelClass: 'bg-rose-50/80 dark:bg-rose-400/10',
    badgeClass: 'bg-rose-100 text-rose-700 dark:bg-rose-400/10 dark:text-rose-200',
    iconClass: 'text-rose-600 dark:text-rose-200',
  },
};

const mockPayments: Record<string, {
  id: string;
  status: string;
  amount: number;
  originalAmount: number;
  couponDiscount: number;
  method: string;
  methodDetail: string;
  orderId: string;
  receiptNumber: string;
  createdAt: string;
  paidAt: string;
  refundedAt?: string;
  refundAmount?: number;
  match: {
    name: string;
    date: string;
    venue: string;
    type: string;
  };
  isRefundable: boolean;
  refundDeadline?: string;
}> = {
  pay_mock_001: {
    id: 'pay_mock_001',
    status: 'completed',
    amount: 14500,
    originalAmount: 15000,
    couponDiscount: 500,
    method: '신용카드',
    methodDetail: '신한카드 **** 1234',
    orderId: 'ORD-2026-0325-001',
    receiptNumber: 'RCP-20260325-A7K92',
    createdAt: '2026-03-20T10:30:00',
    paidAt: '2026-03-20T10:30:15',
    match: {
      name: '풋살 친선 매치',
      date: '2026년 3월 25일 (수) 19:00',
      venue: '서울 마포구 월드컵경기장 풋살파크 A구장',
      type: '매치',
    },
    isRefundable: true,
    refundDeadline: '2026-03-25T18:00:00',
  },
  pay_mock_002: {
    id: 'pay_mock_002',
    status: 'refunded',
    amount: 20000,
    originalAmount: 20000,
    couponDiscount: 0,
    method: '토스페이',
    methodDetail: '토스페이 간편결제',
    orderId: 'ORD-2026-0318-003',
    receiptNumber: 'RCP-20260318-B3M47',
    createdAt: '2026-03-15T14:20:00',
    paidAt: '2026-03-15T14:20:08',
    refundedAt: '2026-03-17T09:15:00',
    refundAmount: 20000,
    match: {
      name: '농구 3:3 매치',
      date: '2026년 3월 20일 (금) 20:00',
      venue: '서울 강남구 체육센터 실내코트',
      type: '매치',
    },
    isRefundable: false,
  },
};

export default function PaymentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [copied, setCopied] = useState(false);

  const payment = mockPayments[id] || mockPayments.pay_mock_001;
  const status = statusConfig[payment.status] || statusConfig.completed;
  const StatusIcon = status.icon;

  const timelineSteps = [
    { label: '주문 생성', time: payment.createdAt, done: true },
    { label: '결제 완료', time: payment.paidAt, done: !!payment.paidAt },
    ...(payment.status === 'refunded' ? [{ label: '환불 완료', time: payment.refundedAt || '', done: true }] : []),
  ];

  const summary = [
    { label: '결제 금액', value: formatAmount(payment.amount) },
    { label: '결제 수단', value: payment.method },
    { label: '상태', value: status.label },
  ];

  const handleCopyReceipt = async () => {
    try {
      await navigator.clipboard?.writeText(payment.receiptNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 pb-8">
      <section className="px-5 @3xl:px-0 pt-4">
        <div className={`${surfaceCard} overflow-hidden p-6 sm:p-7`}>
          <div className="flex flex-col gap-5 @3xl:flex-row @3xl:items-end @3xl:justify-between">
            <div className="max-w-2xl">
              <div className="eyebrow-chip">
                <Receipt size={14} />
                MatchUp Payment Detail
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                결제 상세는 확인해야 할 정보만 남깁니다.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
                결제 상태, 일정 연결, 영수증 정보와 환불 규정을 하나의 흐름으로 정리했습니다.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => router.push('/payments')}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-slate-200/70 bg-white/70 px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-white dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                <ArrowLeft size={14} />
                결제 내역
              </button>
              <div className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${status.badgeClass}`}>
                <StatusIcon size={14} />
                {status.label}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {summary.map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{item.label}</p>
                <p className="mt-2 text-xl font-black tracking-tight text-slate-950 dark:text-white">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-4 grid gap-4 px-5 @3xl:px-0 @4xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="space-y-4">
          <div className={`${solidCard} ${status.panelClass}`}>
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/80 dark:bg-slate-950/70">
                <StatusIcon size={24} className={status.iconClass} />
              </div>
              <div>
                <p className={`text-xl font-black tracking-tight ${status.iconClass}`}>{status.label}</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{formatDateTime(payment.paidAt || payment.createdAt)}</p>
              </div>
            </div>
          </div>

          <div className={solidCard}>
            <h3 className="text-lg font-bold text-slate-950 dark:text-white">금액 정산</h3>
            <div className="mt-4 space-y-3">
              <Row label="원가" value={formatAmount(payment.originalAmount)} />
              {payment.couponDiscount > 0 && <Row label="쿠폰 할인" value={`-${formatAmount(payment.couponDiscount)}`} valueClassName="text-rose-500" />}
              <Row
                label="최종 결제 금액"
                value={formatAmount(payment.amount)}
                labelClassName="font-semibold text-slate-950 dark:text-white"
                valueClassName="text-lg font-black tracking-tight text-slate-950 dark:text-white"
                divider
              />
              {payment.status === 'refunded' && payment.refundAmount && (
                <Row label="환불 금액" value={formatAmount(payment.refundAmount)} valueClassName="font-semibold text-rose-500" panel />
              )}
            </div>
          </div>

          <div className={solidCard}>
            <h3 className="text-lg font-bold text-slate-950 dark:text-white">연결된 일정</h3>
            <div className="mt-4 rounded-[22px] border border-slate-200/70 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 dark:bg-blue-400/10 dark:text-blue-200">
                  {payment.match.type}
                </span>
                <p className="text-base font-semibold text-slate-950 dark:text-white">{payment.match.name}</p>
              </div>
              <div className="mt-4 space-y-2 text-sm text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="shrink-0" />
                  {payment.match.date}
                </div>
                <div className="flex items-center gap-2">
                  <MapPin size={14} className="shrink-0" />
                  {payment.match.venue}
                </div>
              </div>
            </div>
          </div>

          <div className={solidCard}>
            <h3 className="text-lg font-bold text-slate-950 dark:text-white">결제 타임라인</h3>
            <div className="relative mt-4 pl-6">
              <div className="absolute left-[9px] top-1 bottom-1 w-0.5 bg-slate-200 dark:bg-slate-800" />
              {timelineSteps.map((step) => (
                <div key={step.label} className="relative pb-5 last:pb-0">
                  <div className={`absolute -left-6 top-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 ${
                    step.done ? 'border-slate-950 bg-slate-950 dark:border-white dark:bg-white' : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-950'
                  }`}>
                    {step.done && <CheckCircle size={12} className="text-white dark:text-slate-950" />}
                  </div>
                  <p className={`text-base font-medium ${step.done ? 'text-slate-950 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>{step.label}</p>
                  {step.time && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatDateTime(step.time)}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className={solidCard}>
            <h3 className="text-lg font-bold text-slate-950 dark:text-white">영수증 정보</h3>
            <div className="mt-4 space-y-3">
              <Row label="주문번호" value={payment.orderId} mono />
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-slate-500 dark:text-slate-400">영수증 번호</span>
                <button
                  onClick={handleCopyReceipt}
                  className="inline-flex items-center gap-1.5 text-sm font-mono text-slate-700 transition-colors hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-300"
                >
                  {payment.receiptNumber}
                  <Copy size={12} className={copied ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'} />
                </button>
              </div>
              <Row label="결제 수단 상세" value={payment.methodDetail} />
            </div>
          </div>

          <div className={solidCard}>
            <h3 className="text-lg font-bold text-slate-950 dark:text-white">환불 규정</h3>
            <div className="mt-4 space-y-2 rounded-[22px] border border-slate-200/70 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
              <PolicyLine text="경기 시작 24시간 전: 전액 환불" />
              <PolicyLine text="경기 시작 1~24시간 전: 50% 환불" />
              <PolicyLine text="경기 시작 1시간 이내: 환불 불가" />
            </div>
            {payment.refundDeadline && (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                전액 환불 기준 시각: {formatDateTime(payment.refundDeadline)}
              </p>
            )}

            {payment.isRefundable && payment.status === 'completed' ? (
              <Link
                href={`/payments/${payment.id}/refund`}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-rose-200 bg-rose-50 py-3.5 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-100 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-300 dark:hover:bg-rose-950/30"
              >
                <RotateCcw size={16} />
                환불 요청
              </Link>
            ) : (
              <div className="mt-4 rounded-[22px] border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400">
                현재 상태에서는 추가 환불 요청을 진행할 수 없습니다.
              </div>
            )}
          </div>

          <div className={solidCard}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950 dark:text-white">결제 내역 전체 보기</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">같은 계정의 다른 매치, 강좌, 장터 결제를 이어서 확인합니다.</p>
              </div>
              <Link href="/payments" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
                이동
                <ChevronRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Row({
  label,
  value,
  divider,
  mono,
  panel,
  labelClassName,
  valueClassName,
}: {
  label: string;
  value: string;
  divider?: boolean;
  mono?: boolean;
  panel?: boolean;
  labelClassName?: string;
  valueClassName?: string;
}) {
  return (
    <div className={`${divider ? 'border-t border-slate-200 pt-3 dark:border-slate-800' : ''} ${panel ? 'rounded-[18px] bg-slate-50/80 px-3 py-2 dark:bg-slate-900/70' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <span className={labelClassName || 'text-sm text-slate-500 dark:text-slate-400'}>{label}</span>
        <span className={`${mono ? 'font-mono' : ''} ${valueClassName || 'text-sm text-slate-700 dark:text-slate-300'}`}>{value}</span>
      </div>
    </div>
  );
}

function PolicyLine({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400 dark:bg-slate-500" />
      <p className="text-sm text-slate-600 dark:text-slate-300">{text}</p>
    </div>
  );
}
