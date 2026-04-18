'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { extractErrorMessage } from '@/lib/utils';

// Expected hook contract (frontend-data-dev owns the implementation):
// useResolveDispute(): UseMutationResult<void, Error, ResolveDisputeVars>
// interface ResolveDisputeVars {
//   id: string;
//   decision: 'refund' | 'release' | 'dismiss';
//   note?: string;
// }

export type DisputeDecision = 'refund' | 'release' | 'dismiss';

interface ResolveDisputeVars {
  id: string;
  decision: DisputeDecision;
  note?: string;
}

interface DisputeResolveModalProps {
  isOpen: boolean;
  onClose: () => void;
  disputeId: string;
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
    description: '에스크로 보유금을 구매자에게 전액 반환해요',
    color: 'border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900',
  },
  {
    value: 'release',
    label: '대금 지급',
    description: '에스크로 보유금을 판매자에게 전액 지급해요',
    color: 'border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900',
  },
  {
    value: 'dismiss',
    label: '기각',
    description: '분쟁을 기각해요. 현재 상태가 유지돼요',
    color: 'border-gray-200 bg-gray-50 dark:bg-gray-800 dark:border-gray-700',
  },
];

/** Admin-only modal to resolve a marketplace dispute. Supports 3 decisions: refund / release / dismiss. */
export function DisputeResolveModal({
  isOpen,
  onClose,
  disputeId,
  resolveDisputeMutation,
}: DisputeResolveModalProps) {
  const { toast } = useToast();
  const [decision, setDecision] = useState<DisputeDecision | ''>('');
  const [note, setNote] = useState('');

  const isValid = decision !== '';

  const handleSubmit = () => {
    if (!isValid || !decision) return;

    resolveDisputeMutation.mutate(
      {
        id: disputeId,
        decision,
        note: note.trim() || undefined,
      },
      {
        onSuccess: () => {
          const decisionLabel = decisionOptions.find((o) => o.value === decision)?.label ?? decision;
          toast('success', `분쟁이 '${decisionLabel}'로 처리됐어요.`);
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
    setNote('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="md" title="분쟁 처리">
      <div className="space-y-5">
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
                  className={`flex items-start gap-3 rounded-xl p-3 cursor-pointer border transition-colors focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 ${
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
