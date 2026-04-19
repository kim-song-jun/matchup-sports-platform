'use client';

import { useState } from 'react';
import { CheckCircle, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { extractErrorMessage } from '@/lib/utils';

// Expected hook contract (frontend-data-dev owns the implementation):
// useConfirmReceipt(): UseMutationResult<void, Error, { orderId: string }>

interface ConfirmReceiptButtonProps {
  orderId: string;
  status: string;
  /** Injected mutation — allows vi.mock override in tests without touching hooks/ */
  confirmReceiptMutation: {
    mutate: (vars: { orderId: string }, callbacks: { onSuccess: () => void; onError: (err: unknown) => void }) => void;
    isPending: boolean;
  };
}

/**
 * Button visible only when order status is 'shipped' or 'delivered'.
 * Requires confirmation via modal before triggering escrow release.
 */
export function ConfirmReceiptButton({ orderId, status, confirmReceiptMutation }: ConfirmReceiptButtonProps) {
  const { toast } = useToast();
  const [showConfirm, setShowConfirm] = useState(false);

  const isVisible = status === 'shipped' || status === 'delivered';

  if (!isVisible) return null;

  const handleConfirm = () => {
    confirmReceiptMutation.mutate(
      { orderId },
      {
        onSuccess: () => {
          toast('success', '수령을 확인했어요. 판매자에게 대금이 지급돼요.');
          setShowConfirm(false);
        },
        onError: (err) => {
          toast('error', extractErrorMessage(err, '수령 확인에 실패했어요. 다시 시도해주세요.'));
          setShowConfirm(false);
        },
      },
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        className="w-full min-h-[44px] rounded-xl bg-blue-500 py-3 text-base font-semibold text-white hover:bg-blue-600 active:scale-[0.98] transition-[colors,transform] flex items-center justify-center gap-2"
        aria-label="수령 확인하기"
      >
        <CheckCircle size={18} aria-hidden="true" />
        수령 확인
      </button>

      <Modal isOpen={showConfirm} onClose={() => setShowConfirm(false)} size="sm" title="수령 확인">
        <p className="text-base text-gray-600 dark:text-gray-300 leading-relaxed">
          상품을 실제로 받으셨나요?<br />
          확인 후에는 취소할 수 없으며, 판매자에게 즉시 대금이 지급돼요.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => setShowConfirm(false)}
            className="flex-1 min-h-[44px] rounded-xl bg-gray-100 dark:bg-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirmReceiptMutation.isPending}
            className="flex-1 min-h-[44px] rounded-xl bg-blue-500 py-3 text-base font-semibold text-white hover:bg-blue-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {confirmReceiptMutation.isPending ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : null}
            네, 받았어요
          </button>
        </div>
      </Modal>
    </>
  );
}
