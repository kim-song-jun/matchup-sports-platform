'use client';

import { useState, useMemo } from 'react';
import { Wallet, Loader2, Info, CheckCircle } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { extractErrorMessage, formatAmount } from '@/lib/utils';

// Matches EligibleSettlement from types/payout.ts — one row per recipient (aggregated).
// GET /admin/payouts/eligible → EligibleSettlement[]
// Each row represents ALL releasable settlements for one recipient.
export interface PayoutEligibleSettlement {
  recipientId: string;
  recipientName: string;
  settlementCount: number;
  grossAmount: number;
  platformFee: number;
  netAmount: number;
  oldestReleasedAt: string;
}

// Matches CreatePayoutBatchInput from types/payout.ts
interface CreatePayoutBatchInput {
  recipientIds?: string[];
  cutoffDate?: string;
}

interface PayoutBatchBuilderProps {
  /** Settlements eligible for payout — one aggregated row per recipient */
  settlements: PayoutEligibleSettlement[];
  /** Injected mutation — allows vi.mock override in tests */
  createPayoutBatchMutation: {
    mutate: (
      vars: CreatePayoutBatchInput,
      callbacks: { onSuccess: () => void; onError: (err: unknown) => void },
    ) => void;
    isPending: boolean;
  };
  onSuccess?: () => void;
}

/**
 * Admin UI for creating payout batches from eligible settlements.
 * Each row represents one recipient's aggregated settlements.
 * Admin selects which recipients to include in the batch (one or more).
 * Server groups all settlements for the selected recipients into one batch.
 */
export function PayoutBatchBuilder({ settlements, createPayoutBatchMutation, onSuccess }: PayoutBatchBuilderProps) {
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const selectedSettlements = useMemo(
    () => settlements.filter((s) => selectedIds.includes(s.recipientId)),
    [settlements, selectedIds],
  );

  const totalSelected = selectedSettlements.reduce((sum, s) => sum + s.netAmount, 0);
  const totalCountSelected = selectedSettlements.reduce((sum, s) => sum + s.settlementCount, 0);

  const toggleRow = (recipientId: string) => {
    setSelectedIds((prev) =>
      prev.includes(recipientId)
        ? prev.filter((id) => id !== recipientId)
        : [...prev, recipientId],
    );
  };

  const toggleAll = () => {
    if (settlements.length === 0) return;
    const allIds = settlements.map((s) => s.recipientId);
    const allSelected = allIds.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected ? [] : allIds);
  };

  const handleCreateBatch = () => {
    if (selectedIds.length === 0 || createPayoutBatchMutation.isPending) return;

    createPayoutBatchMutation.mutate(
      { recipientIds: selectedIds },
      {
        onSuccess: () => {
          toast('success', `${selectedIds.length}명 수취인, ${totalCountSelected}건의 정산이 지급 배치로 묶였어요.`);
          setSelectedIds([]);
          onSuccess?.();
        },
        onError: (err) => {
          toast('error', extractErrorMessage(err, '배치 생성에 실패했어요. 다시 시도해주세요.'));
        },
      },
    );
  };

  if (settlements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Wallet size={36} className="text-gray-300 dark:text-gray-600 mb-3" aria-hidden="true" />
        <p className="text-base font-semibold text-gray-700 dark:text-gray-300">지급 대기 정산이 없어요</p>
        <p className="text-sm text-gray-400 mt-1">처리 완료된 정산이 생기면 여기에 표시돼요</p>
      </div>
    );
  }

  const allSelected =
    settlements.length > 0 && settlements.every((s) => selectedIds.includes(s.recipientId));

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="flex items-start gap-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900 px-4 py-3">
        <Info size={16} className="text-blue-500 shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-sm text-blue-700 dark:text-blue-300">
          수취인을 선택한 후 배치를 생성하면, 선택된 수취인의 모든 정산이 한 번에 처리돼요.
        </p>
      </div>

      {/* Batch action bar */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 px-5 py-3">
          <CheckCircle size={18} className="text-blue-500" aria-hidden="true" />
          <span className="text-base font-medium text-gray-800 dark:text-gray-200">
            {selectedIds.length}명 선택 · {totalCountSelected}건 · {formatAmount(totalSelected)}
          </span>
          <button
            type="button"
            onClick={handleCreateBatch}
            disabled={createPayoutBatchMutation.isPending}
            className="ml-auto flex items-center gap-2 min-h-[44px] rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            {createPayoutBatchMutation.isPending ? (
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
            ) : (
              <Wallet size={15} aria-hidden="true" />
            )}
            지급 배치 생성
          </button>
        </div>
      )}

      {/* Settlements table */}
      <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                <th className="px-4 py-3 w-10">
                  <button
                    onClick={toggleAll}
                    aria-label="전체 선택"
                    className={`flex h-5 w-5 items-center justify-center rounded border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                      allSelected
                        ? 'bg-blue-500 border-blue-500'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    {allSelected ? <CheckCircle size={12} className="text-white" aria-hidden="true" /> : null}
                  </button>
                </th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">수취인</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap text-right">정산 건수</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap text-right">총액</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap text-right">수수료</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap text-right">정산액</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">최초 해제일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {settlements.map((settlement) => {
                const isSelected = selectedIds.includes(settlement.recipientId);

                return (
                  <tr
                    key={settlement.recipientId}
                    onClick={() => toggleRow(settlement.recipientId)}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        toggleRow(settlement.recipientId);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-pressed={isSelected}
                    className={`transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-950/20 hover:bg-blue-50/80'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    }`}
                  >
                    <td className="px-4 py-3.5">
                      {/* Decorative visual checkbox — interaction handled by full row */}
                      <div
                        className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                          isSelected
                            ? 'bg-blue-500 border-blue-500'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}
                        aria-hidden="true"
                      >
                        {isSelected ? <CheckCircle size={12} className="text-white" aria-hidden="true" /> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">
                      {settlement.recipientName}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap text-right">
                      {settlement.settlementCount}건
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap text-right">
                      {formatAmount(settlement.grossAmount)}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-red-500 whitespace-nowrap text-right">
                      -{formatAmount(settlement.platformFee)}
                    </td>
                    <td className="px-4 py-3.5 text-base font-semibold text-blue-500 whitespace-nowrap text-right">
                      {formatAmount(settlement.netAmount)}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {new Date(settlement.oldestReleasedAt).toLocaleDateString('ko-KR')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
