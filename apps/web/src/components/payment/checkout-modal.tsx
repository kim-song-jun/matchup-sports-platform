'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { CreditCard, Wallet, Loader2, CheckCircle } from 'lucide-react';
import type { ApiResponse, CheckoutResult } from '@/types/api';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  amount: number;
  itemName: string;
  onSuccess: (paymentKey: string) => void;
  onError: (error: string) => void;
}

const paymentMethods = [
  { key: 'card', label: '카드', icon: CreditCard, description: '신용/체크카드' },
  { key: 'tosspay', label: '토스페이', icon: Wallet, description: '토스로 간편결제' },
  { key: 'naverpay', label: '네이버페이', icon: Wallet, description: '네이버페이 결제' },
  { key: 'kakaopay', label: '카카오페이', icon: Wallet, description: '카카오페이 결제' },
] as const;

type PaymentMethod = typeof paymentMethods[number]['key'];

function formatCurrency(n: number) {
  return new Intl.NumberFormat('ko-KR').format(n) + '원';
}

export function CheckoutModal({ isOpen, onClose, orderId, amount, itemName, onSuccess, onError }: CheckoutModalProps) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('card');
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const handlePayment = async () => {
    setIsProcessing(true);
    try {
      const res = await api.post('/payments/checkout', {
        orderId,
        amount,
        method: selectedMethod,
        itemName,
      });
      const paymentKey = (res as unknown as ApiResponse<CheckoutResult>).data?.paymentKey;
      toast('success', '결제가 완료되었어요');
      onSuccess(paymentKey);
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      const message = axiosErr?.response?.data?.message || '결제 처리 중 오류가 발생했습니다';
      toast('error', message);
      onError(message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="결제하기" size="md">
      {/* 주문 요약 */}
      <div className="rounded-xl bg-gray-50 p-4 mb-5">
        <p className="text-[12px] text-gray-400 mb-1">주문 내역</p>
        <p className="text-[15px] font-semibold text-gray-900">{itemName}</p>
        <p className="text-[20px] font-bold text-gray-900 mt-2">{formatCurrency(amount)}</p>
      </div>

      {/* 결제 수단 선택 */}
      <div className="mb-6">
        <p className="text-[14px] font-semibold text-gray-900 mb-3">결제 수단</p>
        <div className="space-y-2">
          {paymentMethods.map((method) => {
            const isSelected = selectedMethod === method.key;
            return (
              <button
                key={method.key}
                onClick={() => setSelectedMethod(method.key)}
                disabled={isProcessing}
                className={`w-full flex items-center gap-3.5 rounded-xl border p-4 text-left transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500/20'
                    : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50'
                } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  isSelected ? 'bg-blue-100 text-blue-500' : 'bg-gray-100 text-gray-400'
                }`}>
                  <method.icon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[14px] font-semibold ${isSelected ? 'text-blue-600' : 'text-gray-900'}`}>
                    {method.label}
                  </p>
                  <p className="text-[12px] text-gray-400">{method.description}</p>
                </div>
                <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                  isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                }`}>
                  {isSelected && <CheckCircle size={12} className="text-white" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 결제 버튼 */}
      <button
        onClick={handlePayment}
        disabled={isProcessing}
        className={`w-full rounded-xl py-4 text-[15px] font-semibold text-white transition-all ${
          isProcessing
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-blue-500 hover:bg-blue-600 active:scale-[0.98]'
        }`}
      >
        {isProcessing ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 size={18} className="animate-spin" />
            결제 처리 중...
          </span>
        ) : (
          `결제하기 · ${formatCurrency(amount)}`
        )}
      </button>
    </Modal>
  );
}
