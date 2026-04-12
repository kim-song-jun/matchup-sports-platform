'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  CreditCard,
  Wallet,
  MapPin,
  Calendar,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import { MobileGlassHeader } from '@/components/layout/mobile-glass-header';
import { useToast } from '@/components/ui/toast';
import { EmptyState } from '@/components/ui/empty-state';
import { TrustSignalBanner } from '@/components/ui/trust-signal-banner';
import {
  useConfirmLessonTicketPayment,
  useConfirmPayment,
  usePreparePayment,
  usePurchaseLessonTicket,
} from '@/hooks/use-api';
import { getCheckoutPaymentMode } from '@/lib/payment-ui';
import { formatAmount, formatDateTime } from '@/lib/utils';

const paymentMethods = [
  { id: 'card', label: '신용/체크카드', icon: CreditCard, description: '모든 카드 가능' },
  { id: 'tosspay', label: '토스페이', icon: Wallet, description: '토스 간편결제' },
  { id: 'naverpay', label: '네이버페이', icon: Wallet, description: '네이버 간편결제' },
  { id: 'kakaopay', label: '카카오페이', icon: Wallet, description: '카카오 간편결제' },
] as const;

export default function CheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const preparePayment = usePreparePayment();
  const confirmPayment = useConfirmPayment();
  const purchaseLessonTicket = usePurchaseLessonTicket();
  const confirmLessonTicketPayment = useConfirmLessonTicketPayment();
  const paymentMode = getCheckoutPaymentMode();
  const isMockMode = paymentMode.state === 'mock';

  const [selectedMethod, setSelectedMethod] = useState<(typeof paymentMethods)[number]['id']>('card');
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const source = searchParams.get('source');
  const participantId = searchParams.get('participantId');
  const ticketPlanId = searchParams.get('ticketPlanId');
  const name = searchParams.get('name');
  const amount = Number(searchParams.get('amount'));
  const scheduledAt = searchParams.get('scheduledAt');
  const venue = searchParams.get('venue');

  const isMatchCheckout = source === 'match' && !!participantId && !!name && Number.isFinite(amount) && amount > 0;
  const isLessonCheckout = source === 'lesson' && !!ticketPlanId && !!name && Number.isFinite(amount) && amount >= 0;
  const isSupportedCheckout = isMatchCheckout || isLessonCheckout;
  const isProcessing =
    preparePayment.isPending ||
    confirmPayment.isPending ||
    purchaseLessonTicket.isPending ||
    confirmLessonTicketPayment.isPending;

  if (!source) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-5">
        <EmptyState
          icon={AlertCircle}
          title="결제 정보가 없어요"
          description="올바른 경로로 다시 접근해주세요"
          action={{ label: '홈으로 돌아가기', href: '/home' }}
        />
      </div>
    );
  }

  const handlePayment = async () => {
    if (!isSupportedCheckout || !agreedToTerms) {
      return;
    }

    try {
      if (isMatchCheckout && participantId) {
        const prepared = await preparePayment.mutateAsync({
          participantId,
          amount,
          method: selectedMethod,
        });

        const payment = await confirmPayment.mutateAsync({
          orderId: prepared.orderId,
          amount,
          paymentKey: `dev-${Date.now()}`,
        });

        toast('success', isMockMode ? '결제 시뮬레이션이 완료되었습니다' : '결제가 완료되었습니다');
        router.push(`/payments/${payment.id}`);
        return;
      }

      if (isLessonCheckout && ticketPlanId) {
        const prepared = await purchaseLessonTicket.mutateAsync(ticketPlanId);
        const confirmedTicket = await confirmLessonTicketPayment.mutateAsync({
          ticketId: prepared.payment.ticketId,
          paymentKey: prepared.payment.amount > 0 ? `mock-${Date.now()}` : undefined,
        });

        toast(
          'success',
          prepared.payment.amount === 0
            ? '무료 수강권 등록이 완료되었어요'
            : isMockMode
            ? '테스트 결제가 완료되어 수강권이 등록되었어요'
            : '수강권 결제가 완료되었어요',
        );
        router.push(`/my/lesson-tickets?ticketId=${confirmedTicket.id}`);
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast('error', axiosErr?.response?.data?.message || '결제를 완료하지 못했어요.');
    }
  };

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 pb-32">
      <MobileGlassHeader title={isMockMode ? '테스트 결제' : '결제하기'} showBack compact />

      <div className="hidden @3xl:block mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">{isMockMode ? '테스트 결제' : '결제하기'}</h2>
        <p className="text-xs text-gray-500 mt-1">
          {isMockMode
            ? '현재 환경에서는 결제 시뮬레이션만 기록되고 실제 청구는 발생하지 않습니다'
            : '실제 결제 컨텍스트가 있는 주문만 처리됩니다'}
        </p>
      </div>

      <div className="px-5 @3xl:px-0 max-w-lg mx-auto @3xl:mx-0 space-y-4 mt-4 @3xl:mt-0">
        {!isSupportedCheckout ? (
          <TrustSignalBanner
            tone="warning"
            label="지원 범위"
            title="현재는 매치 참가와 강좌 수강권 결제만 처리할 수 있어요"
            description="지원되지 않는 source는 가짜 성공 처리 없이 이 화면에서 중단됩니다."
          />
        ) : null}

        {isSupportedCheckout && isMockMode ? (
          <TrustSignalBanner
            tone={paymentMode.tone}
            label={paymentMode.label}
            title={paymentMode.title}
            description={paymentMode.description}
          />
        ) : null}

        <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <h3 className="text-base font-bold tracking-tight text-gray-900 dark:text-white mb-3">주문 정보</h3>
          <div className="space-y-3">
            <div>
              <span className="inline-block rounded-full px-2 py-0.5 text-xs font-normal bg-blue-50 text-blue-500 mb-1">
                {source === 'match' ? '매치' : source === 'lesson' ? '강좌' : '미지원'}
              </span>
              <p className="text-md font-semibold text-gray-900 dark:text-gray-100">{name || '미지원 주문'}</p>
            </div>
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3.5 space-y-2">
              {scheduledAt ? (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Calendar size={14} className="text-gray-500 shrink-0" />
                  {formatDateTime(scheduledAt)}
                </div>
              ) : null}
              {venue ? (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <MapPin size={14} className="text-gray-500 shrink-0" />
                  {venue}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <h3 className="text-base font-bold tracking-tight text-gray-900 dark:text-white mb-3">결제 수단</h3>
          <div className="space-y-2">
            {paymentMethods.map((method) => {
              const Icon = method.icon;
              const isSelected = selectedMethod === method.id;
              return (
                <button
                  key={method.id}
                  onClick={() => setSelectedMethod(method.id)}
                  disabled={!isSupportedCheckout || isProcessing}
                  className={`w-full flex items-center gap-3.5 rounded-xl p-4 transition-colors text-left ${
                    isSelected
                      ? 'ring-2 ring-blue-500 border border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                      : 'border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
                  } ${!isSupportedCheckout ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                    isSelected ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-500' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'
                  }`}>
                    <Icon size={20} />
                  </div>
                  <div className="flex-1">
                    <p className={`text-base font-semibold ${isSelected ? 'text-blue-600' : 'text-gray-900 dark:text-gray-100'}`}>
                      {method.label}
                    </p>
                    <p className="text-xs text-gray-500">{method.description}</p>
                  </div>
                  <div className={`flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
                    isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300 dark:border-gray-500'
                  }`}>
                    {isSelected && <div className="h-2 w-2 rounded-full bg-white dark:bg-gray-800" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <h3 className="text-base font-bold tracking-tight text-gray-900 dark:text-white mb-3">결제 금액</h3>
          <div className="border-t border-gray-100 dark:border-gray-700 pt-3 flex items-center justify-between">
            <span className="text-sm font-bold text-gray-900 dark:text-white">최종 결제 금액</span>
            <span className="text-xl font-bold text-blue-500">{formatAmount(Number.isFinite(amount) ? amount : 0)}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <button onClick={() => setAgreedToTerms(!agreedToTerms)} className="flex items-center gap-3 w-full text-left">
            <div className={`flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${
              agreedToTerms ? 'bg-blue-500 border-blue-500' : 'border-gray-300 dark:border-gray-500'
            }`}>
              {agreedToTerms && <CheckCircle size={12} className="text-white" />}
            </div>
            <span className="text-base text-gray-700 dark:text-gray-300">결제 및 취소 규정에 동의합니다</span>
          </button>
          <div className="mt-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3.5">
            <p className="text-xs text-gray-500 leading-relaxed">
              {isMockMode
                ? '현재는 테스트 결제로 동작하므로 환불도 시뮬레이션 상태 변경으로만 반영됩니다.'
                : '경기 시작 24시간 전: 전액 환불 / 1~24시간 전: 50% 환불 / 1시간 이내: 환불 불가.'}
            </p>
          </div>
        </div>
      </div>

      <div className="fixed bottom-[calc(80px+var(--safe-area-bottom))] @3xl:bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-700 px-5 py-4 @3xl:relative @3xl:border-0 @3xl:px-0 @3xl:mt-4 @3xl:pb-4 max-w-lg mx-auto @3xl:mx-0">
        <div className="flex items-center justify-between mb-3 @3xl:hidden">
          <span className="text-sm text-gray-500">최종 결제 금액</span>
          <span className="text-xl font-bold text-blue-500">{formatAmount(Number.isFinite(amount) ? amount : 0)}</span>
        </div>
        <button
          onClick={() => void handlePayment()}
          disabled={!isSupportedCheckout || !agreedToTerms || isProcessing}
          className={`w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold transition-colors ${
            isSupportedCheckout && agreedToTerms
              ? 'bg-blue-500 text-white hover:bg-blue-600'
              : 'bg-gray-200 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isProcessing ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              {isMockMode ? '테스트 결제 처리중...' : '결제 처리중...'}
            </>
          ) : (
            isLessonCheckout && amount === 0
              ? '무료 수강권 등록하기'
              : `${formatAmount(Number.isFinite(amount) ? amount : 0)} ${isMockMode ? '테스트 결제하기' : '결제하기'}`
          )}
        </button>
      </div>
    </div>
  );
}
