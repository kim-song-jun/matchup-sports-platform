'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  CheckCircle,
  CreditCard,
  Calendar,
  MapPin,
  ChevronRight,
  Copy,
  RotateCcw,
  ReceiptText,
} from 'lucide-react';
import { MobileGlassHeader } from '@/components/layout/mobile-glass-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { TrustSignalBanner } from '@/components/ui/trust-signal-banner';
import { usePayment } from '@/hooks/use-api';
import {
  buildPaymentReceiptNumber,
  getPaymentMethodDescription,
  getPaymentMethodMeta,
  getPaymentSource,
  getPaymentStatusMeta,
  getPaymentTimelineLabels,
  getRecordedPaymentMode,
  getRefundPolicy,
} from '@/lib/payment-ui';
import { formatAmount, formatDateTime } from '@/lib/utils';

export default function PaymentDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [copied, setCopied] = useState(false);
  const { data: payment, isLoading, isError, refetch } = usePayment(id);

  if (isLoading) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-32 rounded-lg bg-gray-100 dark:bg-gray-800" />
          <div className="h-32 rounded-2xl bg-gray-100 dark:bg-gray-800" />
          <div className="h-40 rounded-2xl bg-gray-100 dark:bg-gray-800" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <ErrorState message="결제 상세를 불러오지 못했어요" onRetry={() => void refetch()} />
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <EmptyState
          icon={ReceiptText}
          title="결제를 찾을 수 없어요"
          description="삭제되었거나 접근할 수 없는 결제예요"
          action={{ label: '결제 내역으로', href: '/payments' }}
        />
      </div>
    );
  }

  const paymentMode = getRecordedPaymentMode(payment);
  const status = getPaymentStatusMeta(payment);
  const method = getPaymentMethodMeta(payment.method);
  const methodDescription = getPaymentMethodDescription(payment);
  const source = getPaymentSource(payment);
  const refundPolicy = getRefundPolicy(source.scheduledAt);
  const receiptNumber = buildPaymentReceiptNumber(payment.orderId);
  const timelineLabels = getPaymentTimelineLabels(payment);
  const StatusIcon = status.icon;

  const handleCopyReceipt = async () => {
    await navigator.clipboard?.writeText(receiptNumber);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const timelineSteps = [
    { label: '주문 생성', time: payment.createdAt, done: true },
    { label: timelineLabels.completed, time: payment.paidAt, done: !!payment.paidAt },
    ...(payment.refundedAt
      ? [{ label: timelineLabels.refunded, time: payment.refundedAt, done: true }]
      : []),
  ];

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 pb-8">
      <MobileGlassHeader title="결제 상세" showBack compact />

      <div className="hidden @3xl:block mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
          <Link href="/payments" className="hover:text-gray-600 dark:hover:text-gray-400 transition-colors">결제 내역</Link>
          <ChevronRight size={14} />
          <span className="text-gray-700 dark:text-gray-300">상세</span>
        </div>
        <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">결제 상세</h2>
      </div>

      <div className="px-5 @3xl:px-0 max-w-lg mx-auto @3xl:mx-0 space-y-4 mt-4 @3xl:mt-0">
        <div className={`rounded-2xl ${status.bgColor} p-5 flex items-center gap-4`}>
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-white dark:bg-gray-800/80 ${status.color}`}>
            <StatusIcon size={24} />
          </div>
          <div>
            <p className={`text-xl font-bold ${status.color}`}>{status.label}</p>
            <p className="text-sm text-gray-500 mt-0.5">{formatDateTime(payment.paidAt || payment.createdAt)}</p>
          </div>
        </div>

        {paymentMode.state !== 'ready' ? (
          <TrustSignalBanner
            tone={paymentMode.tone}
            label={paymentMode.label}
            title={paymentMode.title}
            description={paymentMode.description}
          />
        ) : null}

        <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <h3 className="text-base font-bold tracking-tight text-gray-900 dark:text-white mb-3">결제 금액</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-base text-gray-500">결제 금액</span>
              <span className="text-xl font-bold text-blue-500">{formatAmount(payment.amount)}</span>
            </div>
            {payment.refundAmount ? (
              <div className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2">
                <span className="text-base text-red-500 font-medium">환불 금액</span>
                <span className="text-base font-bold text-red-500">{formatAmount(payment.refundAmount)}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <h3 className="text-base font-bold tracking-tight text-gray-900 dark:text-white mb-3">결제 수단</h3>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-800/50">
              <method.icon size={20} className="text-gray-500" />
            </div>
            <div>
              <p className="text-base font-medium text-gray-900 dark:text-gray-100">{method.label}</p>
              <p className="text-xs text-gray-500">{methodDescription}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <h3 className="text-base font-bold tracking-tight text-gray-900 dark:text-white mb-3">연결된 일정</h3>
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${source.color}`}>
                {source.label}
              </span>
              <p className="text-base font-semibold text-gray-900 dark:text-gray-100">{source.title}</p>
            </div>
            <div className="space-y-1.5">
              {source.scheduledAt && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Calendar size={14} className="text-gray-500 shrink-0" />
                  {formatDateTime(source.scheduledAt)}
                </div>
              )}
              {source.venueName && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <MapPin size={14} className="text-gray-500 shrink-0" />
                  {source.venueName}
                </div>
              )}
              {!source.scheduledAt && !source.venueName && (
                <p className="text-sm text-gray-500">연결된 일정 정보가 아직 등록되지 않았습니다.</p>
              )}
            </div>
            {source.href && (
              <Link href={source.href} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-blue-500 hover:text-blue-600">
                일정 보기
                <ChevronRight size={14} />
              </Link>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <h3 className="text-base font-bold tracking-tight text-gray-900 dark:text-white mb-3">영수증 정보</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">주문번호</span>
              <span className="text-sm font-mono text-gray-700 dark:text-gray-300">{payment.orderId}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">영수증 번호</span>
              <button onClick={() => void handleCopyReceipt()} className="flex items-center gap-1.5 text-sm font-mono text-gray-700 dark:text-gray-300 hover:text-blue-500 transition-colors">
                {receiptNumber}
                <Copy size={12} className={copied ? 'text-green-500' : 'text-gray-300'} />
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <h3 className="text-base font-bold tracking-tight text-gray-900 dark:text-white mb-3">결제 타임라인</h3>
          <div className="relative pl-6">
            <div className="absolute left-[9px] top-1 bottom-1 w-0.5 bg-gray-100 dark:bg-gray-700" />
            {timelineSteps.map((step, index) => (
              <div key={`${step.label}-${index}`} className="relative pb-5 last:pb-0">
                <div className={`absolute -left-6 top-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border transition-colors ${
                  step.done ? 'border-blue-500 bg-blue-500' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
                }`}>
                  {step.done && <CheckCircle size={10} className="text-white" />}
                </div>
                <p className={`text-base font-medium ${step.done ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500'}`}>{step.label}</p>
                {step.time ? <p className="text-xs text-gray-500 mt-0.5">{formatDateTime(step.time)}</p> : null}
              </div>
            ))}
          </div>
        </div>

        {payment.status === 'completed' && source.kind === 'match' ? (
          <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <h3 className="text-base font-bold tracking-tight text-gray-900 dark:text-white mb-3">환불 규정</h3>
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-4 mb-4">
              <p className={`text-sm font-semibold ${refundPolicy.color}`}>{refundPolicy.label}</p>
              <p className="text-sm text-gray-500 mt-1">{refundPolicy.description}</p>
            </div>

            {refundPolicy.percentage > 0 ? (
              paymentMode.state === 'unavailable' ? (
                <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  현재 환경에서는 legacy 실결제 환불을 처리할 수 없어요. 운영 결제 연동이 복구된 뒤 다시 시도해주세요.
                </div>
              ) : (
                <Link
                  href={`/payments/${payment.id}/refund`}
                  className="flex items-center justify-center gap-2 w-full rounded-2xl border border-red-200 bg-red-50 py-3.5 text-md font-semibold text-red-500 hover:bg-red-100 transition-colors"
                >
                  <RotateCcw size={18} />
                  {paymentMode.state === 'mock' ? '테스트 환불 처리' : '환불 요청'}
                </Link>
              )
            ) : (
              <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500">
                {paymentMode.state === 'mock'
                  ? '현재 정책상 이 테스트 결제는 환불 상태를 변경할 수 없어요.'
                  : '현재 정책상 이 결제는 환불할 수 없어요.'}
              </div>
            )}
          </div>
        ) : null}
      </div>
      <div className="h-24" />
    </div>
  );
}
