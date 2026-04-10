'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  RotateCcw,
  AlertTriangle,
  Calendar,
  MapPin,
  Clock,
  Loader2,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { usePayment, useRefundPayment } from '@/hooks/use-api';
import { getPaymentMethodMeta, getPaymentSource, getRefundPolicy } from '@/lib/payment-ui';
import { formatAmount, formatDateTime } from '@/lib/utils';

const refundReasons = [
  { id: 'schedule', label: '일정 변경' },
  { id: 'personal', label: '개인 사정' },
  { id: 'match_cancel', label: '매치 취소' },
  { id: 'other', label: '기타' },
];

export default function RefundRequestPage() {
  const router = useRouter();
  const params = useParams();
  const paymentId = params.id as string;
  const { toast } = useToast();
  const [selectedReason, setSelectedReason] = useState('');
  const [additionalReason, setAdditionalReason] = useState('');
  const [showModal, setShowModal] = useState(false);

  const { data: payment, isLoading, isError, refetch } = usePayment(paymentId);
  const refundPayment = useRefundPayment();

  if (isLoading) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-32 rounded-lg bg-gray-100 dark:bg-gray-800" />
          <div className="h-32 rounded-2xl bg-gray-100 dark:bg-gray-800" />
          <div className="h-48 rounded-2xl bg-gray-100 dark:bg-gray-800" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <ErrorState message="환불 정보를 불러오지 못했어요" onRetry={() => void refetch()} />
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <EmptyState
          icon={RotateCcw}
          title="환불 대상을 찾을 수 없어요"
          description="결제 내역에서 다시 시도해주세요"
          action={{ label: '결제 내역으로', href: '/payments' }}
        />
      </div>
    );
  }

  const source = getPaymentSource(payment);
  const method = getPaymentMethodMeta(payment.method);
  const refundPolicy = getRefundPolicy(source.scheduledAt);
  const refundAmount = Math.floor(payment.amount * (refundPolicy.percentage / 100));
  const isRefundable = payment.status === 'completed' && source.kind === 'match' && refundPolicy.percentage > 0;

  const handleRefundSubmit = async () => {
    try {
      await refundPayment.mutateAsync({
        id: paymentId,
        data: {
          reason: selectedReason,
          note: additionalReason,
        },
      });
      toast('success', '환불 요청이 접수되었어요');
      router.push(`/payments/${paymentId}`);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast('error', axiosErr?.response?.data?.message || '환불 요청에 실패했어요.');
    }
  };

  if (!isRefundable) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <EmptyState
          icon={RotateCcw}
          title="지금은 환불할 수 없어요"
          description={refundPolicy.description}
          action={{ label: '결제 상세로', href: `/payments/${paymentId}` }}
        />
      </div>
    );
  }

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 pb-32">
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="환불 확인" size="sm">
        <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">결제 금액</span>
            <span className="text-base text-gray-700 dark:text-gray-200">{formatAmount(payment.amount)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">환불 금액</span>
            <span className="text-lg font-bold text-blue-500">{formatAmount(refundAmount)}</span>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 mb-5">
          <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700 leading-relaxed">
            환불 요청 후에는 취소할 수 없습니다. 환불 처리까지 영업일 기준 1~3일이 소요될 수 있습니다.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setShowModal(false)}
            className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            취소
          </button>
          <button
            onClick={() => void handleRefundSubmit()}
            disabled={refundPayment.isPending}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-red-500 py-3 text-base font-semibold text-white hover:bg-red-600 transition-colors disabled:opacity-60"
          >
            {refundPayment.isPending ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                처리중
              </>
            ) : (
              '환불 요청'
            )}
          </button>
        </div>
      </Modal>

      <header className="@3xl:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50 dark:border-gray-800">
        <button
          aria-label="뒤로 가기"
          onClick={() => router.back()}
          className="rounded-xl p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-[0.98] transition-[colors,transform] min-w-11 min-h-[44px] flex items-center justify-center"
        >
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">환불 요청</h1>
      </header>

      <div className="hidden @3xl:block mb-6">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-base text-gray-500 hover:text-gray-600 mb-2 transition-colors">
          <ArrowLeft size={16} /> 결제 상세
        </button>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">환불 요청</h2>
      </div>

      <div className="px-5 @3xl:px-0 max-w-lg mx-auto @3xl:mx-0 space-y-4 mt-4 @3xl:mt-0">
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
          <h3 className="text-md font-bold text-gray-900 dark:text-white mb-3">결제 정보</h3>
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">상품명</span>
              <span className="text-base font-medium text-gray-900 dark:text-white">{source.title}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">결제 금액</span>
              <span className="text-base font-semibold text-gray-900 dark:text-white">{formatAmount(payment.amount)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">결제 수단</span>
              <span className="text-sm text-gray-600 dark:text-gray-300">{method.label}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">결제일</span>
              <span className="text-sm text-gray-600 dark:text-gray-300">{formatDateTime(payment.paidAt || payment.createdAt)}</span>
            </div>
          </div>
          <div className="mt-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 p-4 space-y-1.5">
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
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
          <h3 className="text-md font-bold text-gray-900 dark:text-white mb-3">환불 규정</h3>
          <div className="space-y-2">
            {[
              { key: 'full', label: '경기 24시간 전', result: '전액 환불', active: refundPolicy.percentage === 100 },
              { key: 'half', label: '경기 1~24시간 전', result: '50% 환불', active: refundPolicy.percentage === 50 },
              { key: 'none', label: '경기 1시간 이내', result: '환불 불가', active: refundPolicy.percentage === 0 },
            ].map((rule) => (
              <div
                key={rule.key}
                className={`flex items-center justify-between rounded-xl px-4 py-3 ${
                  rule.active ? refundPolicy.bgColor : 'bg-gray-50 dark:bg-gray-800/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Clock size={14} className={rule.active ? refundPolicy.color : 'text-gray-500'} />
                  <span className={`text-sm font-medium ${rule.active ? refundPolicy.color : 'text-gray-600 dark:text-gray-300'}`}>
                    {rule.label}
                  </span>
                </div>
                <span className={`text-sm font-bold ${rule.active ? refundPolicy.color : 'text-gray-500'}`}>{rule.result}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={`rounded-2xl border p-5 ${refundPolicy.bgColor} border-transparent`}>
          <div className="flex items-center gap-3 mb-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-white dark:bg-gray-800/80 ${refundPolicy.color}`}>
              <RotateCcw size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-500">예상 환불 금액</p>
              <p className={`text-2xl font-bold ${refundPolicy.color}`}>{formatAmount(refundAmount)}</p>
            </div>
          </div>
          <p className="text-xs text-gray-500">{refundPolicy.description}</p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
          <h3 className="text-md font-bold text-gray-900 dark:text-white mb-3">환불 사유</h3>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {refundReasons.map((reason) => (
              <button
                key={reason.id}
                onClick={() => setSelectedReason(reason.id)}
                className={`rounded-xl border-2 py-3 px-4 text-base font-medium transition-colors ${
                  selectedReason === reason.id
                    ? 'border-gray-900 bg-gray-900 text-white dark:bg-white dark:text-gray-900 dark:border-white'
                    : 'border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-200'
                }`}
              >
                {reason.label}
              </button>
            ))}
          </div>
          <label htmlFor="refund-additional-reason" className="sr-only">추가 사유</label>
          <textarea
            id="refund-additional-reason"
            value={additionalReason}
            onChange={(e) => setAdditionalReason(e.target.value)}
            placeholder="추가 사유를 입력해 주세요 (선택)"
            rows={3}
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 px-4 py-3 text-base text-gray-900 dark:text-white placeholder:text-gray-400 resize-none focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
      </div>

      <div className="fixed bottom-[calc(60px+var(--safe-area-bottom))] @3xl:bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 px-5 py-4 @3xl:relative @3xl:border-0 @3xl:px-0 @3xl:mt-4 @3xl:pb-4 max-w-lg mx-auto @3xl:mx-0">
        <div className="flex items-center justify-between mb-3 @3xl:hidden">
          <span className="text-sm text-gray-500">환불 예상 금액</span>
          <span className={`text-xl font-bold ${refundPolicy.color}`}>{formatAmount(refundAmount)}</span>
        </div>
        <button
          onClick={() => setShowModal(true)}
          disabled={!selectedReason || refundPayment.isPending}
          className={`w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold transition-colors ${
            selectedReason
              ? 'bg-red-500 text-white hover:bg-red-600 active:scale-[0.98]'
              : 'bg-gray-200 text-gray-500 cursor-not-allowed'
          }`}
        >
          <RotateCcw size={20} />
          환불 요청
        </button>
      </div>
    </div>
  );
}
