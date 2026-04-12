'use client';

import { useState } from 'react';
import { TrustSignalBanner } from '@/components/ui/trust-signal-banner';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useConfirmPayment, usePreparePayment } from '@/hooks/use-api';
import { getCheckoutPaymentMode } from '@/lib/payment-ui';
import { CreditCard, Wallet, Loader2, CheckCircle } from 'lucide-react';
import type { Payment } from '@/types/api';
import { formatAmount, extractErrorMessage } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  participantId: string;
  amount: number;
  itemName: string;
  onSuccess: (payment: Payment) => void;
  onError: (error: string) => void;
}

const paymentMethods = [
  { key: 'card', label: '카드', icon: CreditCard, description: '신용/체크카드' },
  { key: 'tosspay', label: '토스페이', icon: Wallet, description: '토스로 간편결제' },
  { key: 'naverpay', label: '네이버페이', icon: Wallet, description: '네이버 간편결제' },
  { key: 'kakaopay', label: '카카오페이', icon: Wallet, description: '카카오 간편결제' },
] as const;

type PaymentMethod = typeof paymentMethods[number]['key'];

export function CheckoutModal({
  isOpen,
  onClose,
  participantId,
  amount,
  itemName,
  onSuccess,
  onError,
}: CheckoutModalProps) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('card');
  const { toast } = useToast();
  const preparePayment = usePreparePayment();
  const confirmPayment = useConfirmPayment();
  const paymentMode = getCheckoutPaymentMode();
  const isMockMode = paymentMode.state === 'mock';

  const isProcessing = preparePayment.isPending || confirmPayment.isPending;

  const handlePayment = async () => {
    try {
      const prepared = await preparePayment.mutateAsync({
        participantId,
        amount,
        method: selectedMethod,
      });

      const confirmed = await confirmPayment.mutateAsync({
        orderId: prepared.orderId,
        amount,
        paymentKey: `dev-${Date.now()}`,
      });

      toast('success', isMockMode ? '결제 시뮬레이션이 완료되었어요' : '결제가 완료되었어요');
      onSuccess(confirmed);
      onClose();
    } catch (err: unknown) {
      const message = extractErrorMessage(err, '결제 처리 중 오류가 발생했습니다.');
      toast('error', message);
      onError(message);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isMockMode ? '테스트 결제' : '결제하기'} size="md">
      <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4 mb-5">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">주문 내역</p>
        <p className="text-md font-semibold text-gray-900 dark:text-gray-100">{itemName}</p>
        <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-2">{formatAmount(amount)}</p>
      </div>

      {isMockMode ? (
        <div className="mb-5">
          <TrustSignalBanner
            tone={paymentMode.tone}
            label={paymentMode.label}
            title={paymentMode.title}
            description={paymentMode.description}
          />
        </div>
      ) : null}

      <div className="mb-6">
        <p className="text-base font-semibold text-gray-900 dark:text-white mb-3">결제 수단</p>
        <div className="space-y-2">
          {paymentMethods.map((method) => {
            const isSelected = selectedMethod === method.key;
            return (
              <button
                key={method.key}
                onClick={() => setSelectedMethod(method.key)}
                disabled={isProcessing}
                className={`w-full flex items-center gap-3.5 rounded-xl border p-4 text-left transition-colors ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500/20 dark:bg-blue-900/20 dark:ring-blue-500/30'
                    : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600 dark:hover:bg-gray-700'
                } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  isSelected ? 'bg-blue-100 text-blue-500 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                }`}>
                  <method.icon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-base font-semibold ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-gray-100'}`}>
                    {method.label}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{method.description}</p>
                </div>
                <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300 dark:border-gray-500'
                }`}>
                  {isSelected && <CheckCircle size={12} className="text-white" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <Button
        onClick={handlePayment}
        disabled={isProcessing || !participantId}
        fullWidth
        size="lg"
      >
        {isProcessing ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            {isMockMode ? '테스트 결제 처리 중...' : '결제 처리 중...'}
          </>
        ) : (
          `${isMockMode ? '테스트 결제' : '결제하기'} · ${formatAmount(amount)}`
        )}
      </Button>
    </Modal>
  );
}
