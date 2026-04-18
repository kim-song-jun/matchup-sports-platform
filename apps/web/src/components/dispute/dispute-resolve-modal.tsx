'use client';

import { useState } from 'react';
import { Scale, Loader2, AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { extractErrorMessage, formatAmount } from '@/lib/utils';

// Expected hook contract (frontend-data-dev owns the implementation):
// useResolveDispute(): UseMutationResult<void, Error, ResolveDisputeVars>
// interface ResolveDisputeVars {
//   id: string;
//   decision: 'refund' | 'release' | 'partial' | 'dismiss';
//   amount?: number;   // required when decision === 'partial'
//   note?: string;
// }

export type DisputeDecision = 'refund' | 'release' | 'partial' | 'dismiss';

interface ResolveDisputeVars {
  id: string;
  decision: DisputeDecision;
  amount?: number;
  note?: string;
}

interface DisputeResolveModalProps {
  isOpen: boolean;
  onClose: () => void;
  disputeId: string;
  /** Total payment amount — used to validate partial refund ceiling */
  totalAmount: number;
  /** Injected mutation — allows vi.mock override in tests without touching hooks/ */
  resolveDisputeMutation: {
    mutate: (vars: ResolveDisputeVars, callbacks: { onSuccess: () => void; onError: (err: unknown) => void }) => void;
    isPending: boolean;
  };
}

const decisionOptions: { value: DisputeDecision; label: string; description: string; color: string }[] = [
  {
    value: 'refund',
    label: '전액 환불',
    description: '에스크로 보유금을 구매자에게 전액 반환합니다',
    color: 'border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900',
  },
  {
    value: 'release',
    label: '대금 지급',
    description: '에스크로 보유금을 판매자에게 전액 지급합니다',
    color: 'border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900',
  },
  {
    value: 'partial',
    label: '부분 환불',
    description: '지정한 금액을 구매자에게 환불하고, 나머지는 판매자에게 지급합니다',
    color: 'border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900',
  },
  {
    value: 'dismiss',
    label: '기각',
    description: '분쟁을 기각합니다. 현재 상태가 유지됩니다',
    color: 'border-gray-200 bg-gray-50 dark:bg-gray-800 dark:border-gray-700',
  },
];

/**
 * Admin-only modal to resolve a marketplace dispute.
 * Supports 4 decisions: refund / release / partial / dismiss.
 * Note: task §3.3 specifies binary (refund/release) only — implementation includes all 4
 * per orchestrator brief; flagged for backend reconciliation.
 */
export function DisputeResolveModal({
  isOpen,
  onClose,
  disputeId,
  totalAmount,
  resolveDisputeMutation,
}: DisputeResolveModalProps) {
  const { toast } = useToast();
  const [decision, setDecision] = useState<DisputeDecision | ''>('');
  const [partialAmount, setPartialAmount] = useState('');
  const [note, setNote] = useState('');

  const partialAmountNum = parseFloat(partialAmount);
  const isPartialValid =
    decision !== 'partial' ||
    (!isNaN(partialAmountNum) && partialAmountNum > 0 && partialAmountNum <= totalAmount);

  const isValid = decision !== '' && isPartialValid;

  const handleSubmit = () => {
    if (!isValid || !decision) return;

    resolveDisputeMutation.mutate(
      {
        id: disputeId,
        decision,
        amount: decision === 'partial' ? partialAmountNum : undefined,
        note: note.trim() || undefined,
      },
      {
        onSuccess: () => {
          const decisionLabel = decisionOptions.find((o) => o.value === decision)?.label ?? decision;
          toast('success', `분쟁이 '${decisionLabel}'로 처리되었어요.`);
          handleClose();
        },
        onError: (err) => {
          toast('error', extractErrorMessage(err, '분쟁 처리에 실패했어요. 다시 시도해주세요.'));
        },
      },
    );
  };

  const handleClose = () => {
    if (resolveDisputeMutation.isPending) return;
    setDecision('');
    setPartialAmount('');
    setNote('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="md" title="분쟁 처리">
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900 p-4">
          <Scale size={18} className="text-blue-500 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">에스크로 보유금</p>
            <p className="text-base font-bold text-blue-700 dark:text-blue-400 mt-0.5">{formatAmount(totalAmount)}</p>
          </div>
        </div>

        {/* Decision selection */}
        <div>
          <fieldset>
            <legend className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              처리 방식 <span className="text-red-500" aria-hidden="true">*</span>
            </legend>
            <div className="space-y-2">
              {decisionOptions.map((option) => (
                <label
                  key={option.value}
                  className={`flex items-start gap-3 rounded-xl p-3 cursor-pointer border transition-colors ${
                    decision === option.value
                      ? option.color
                      : 'border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:border-gray-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="dispute-decision"
                    value={option.value}
                    checked={decision === option.value}
                    onChange={() => setDecision(option.value)}
                    className="mt-0.5 accent-blue-500"
                  />
                  <div>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{option.label}</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{option.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        {/* Partial amount input */}
        {decision === 'partial' && (
          <div>
            <label htmlFor="partial-amount" className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
              환불 금액 <span className="text-red-500" aria-hidden="true">*</span>
            </label>
            <div className="relative">
              <input
                id="partial-amount"
                type="number"
                min={1}
                max={totalAmount}
                value={partialAmount}
                onChange={(e) => setPartialAmount(e.target.value)}
                placeholder="환불할 금액을 입력하세요"
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 pr-10 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">원</span>
            </div>
            {!isNaN(partialAmountNum) && partialAmountNum > totalAmount && (
              <p className="mt-1 flex items-center gap-1 text-xs text-red-500">
                <AlertTriangle size={12} aria-hidden="true" />
                에스크로 보유금({formatAmount(totalAmount)})을 초과할 수 없어요
              </p>
            )}
          </div>
        )}

        {/* Admin note */}
        <div>
          <label htmlFor="resolve-note" className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
            처리 메모 <span className="text-gray-400 font-normal">(선택)</span>
          </label>
          <textarea
            id="resolve-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="처리 사유나 참고 사항을 기록해주세요"
            rows={3}
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 resize-none transition-colors"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={resolveDisputeMutation.isPending}
            className="flex-1 min-h-[44px] rounded-xl bg-gray-100 dark:bg-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || resolveDisputeMutation.isPending}
            className="flex-1 min-h-[44px] rounded-xl bg-blue-500 py-3 text-base font-semibold text-white hover:bg-blue-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {resolveDisputeMutation.isPending ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : null}
            처리 확정
          </button>
        </div>
      </div>
    </Modal>
  );
}
