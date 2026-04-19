'use client';

import { useMemo, useState } from 'react';
import { Wallet, CheckCircle, Clock, Ban, Loader2 } from 'lucide-react';
import { AdminToolbar, downloadCSV } from '@/components/admin/admin-toolbar';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { PayoutBatchBuilder } from '@/components/admin/payout-batch-builder';
import { useToast } from '@/components/ui/toast';
import { formatAmount, extractErrorMessage } from '@/lib/utils';
import {
  useAdminPayouts,
  useAdminEligibleSettlements,
  useCreatePayoutBatch,
  useMarkPayoutPaid,
} from '@/hooks/use-api';

// Hook shapes (actual — matches use-admin.ts + types/payout.ts):
// useAdminPayouts(params?) → { data: CursorPage<Payout>; isLoading; isError; refetch }
// useAdminEligibleSettlements() → { data: EligibleSettlement[]; isLoading; isError; refetch }
// useCreatePayoutBatch() → mutation.mutate({ recipientIds?, cutoffDate? })
// useMarkPayoutPaid() → mutation.mutate({ id, data?: MarkPayoutPaidInput })
//
// Payout: { id, batchId, recipientId, grossAmount, platformFee, netAmount, status, processedAt, createdAt, recipient? }
// EligibleSettlement: { recipientId, recipientName, settlementCount, grossAmount, platformFee, netAmount, oldestReleasedAt }

import type { PayoutEligibleSettlement } from '@/components/admin/payout-batch-builder';

type PayoutTab = 'eligible' | 'payouts';

const payoutStatusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: '지급 대기', color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' },
  processing: { label: '처리중', color: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300' },
  paid: { label: '지급 완료', color: 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400' },
  failed: { label: '실패', color: 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400' },
  cancelled: { label: '취소', color: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
};

const payoutFilters = [
  { key: 'all', label: '전체' },
  { key: 'pending', label: '지급 대기' },
  { key: 'paid', label: '지급 완료' },
  { key: 'failed', label: '실패' },
];

function MarkPaidRow({ payoutId, refetch }: { payoutId: string; refetch: () => void }) {
  const { toast } = useToast();
  const [externalRef, setExternalRef] = useState('');
  const [expanded, setExpanded] = useState(false);
  const markPaid = useMarkPayoutPaid();

  const handleMark = () => {
    if (markPaid.isPending) return;
    markPaid.mutate(
      { id: payoutId, data: { externalRef: externalRef.trim() || undefined } },
      {
        onSuccess: () => {
          toast('success', '지급 완료로 처리됐어요.');
          setExpanded(false);
          setExternalRef('');
          refetch();
        },
        onError: (err) => {
          toast('error', extractErrorMessage(err, '처리에 실패했어요. 다시 시도해주세요.'));
        },
      },
    );
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex items-center gap-1 text-sm font-medium text-blue-500 hover:text-blue-600 min-h-[44px] transition-colors"
      >
        <CheckCircle size={14} aria-hidden="true" />
        지급 확인
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <label htmlFor={`ext-ref-${payoutId}`} className="sr-only">이체 참조번호</label>
      <input
        id={`ext-ref-${payoutId}`}
        type="text"
        value={externalRef}
        onChange={(e) => setExternalRef(e.target.value)}
        placeholder="이체 참조번호 (선택)"
        className="w-36 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-900 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      />
      <button
        type="button"
        onClick={handleMark}
        disabled={markPaid.isPending}
        className="flex items-center gap-1 rounded-lg bg-blue-500 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-blue-600 disabled:opacity-50 transition-colors min-h-[44px]"
      >
        {markPaid.isPending ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : '확인'}
      </button>
      <button
        type="button"
        onClick={() => { setExpanded(false); setExternalRef(''); }}
        className="flex items-center justify-center min-h-[44px] min-w-[44px] text-gray-400 hover:text-gray-600 transition-colors"
        aria-label="취소"
      >
        <Ban size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

export default function AdminPayoutsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<PayoutTab>('eligible');
  const [payoutFilter, setPayoutFilter] = useState('all');
  const [payoutSearch, setPayoutSearch] = useState('');

  const { data: eligibleData, isLoading: eligibleLoading, isError: eligibleError, refetch: refetchEligible } = useAdminEligibleSettlements();
  const { data: payoutsData, isLoading: payoutsLoading, isError: payoutsError, refetch: refetchPayouts } = useAdminPayouts();
  const createPayoutBatch = useCreatePayoutBatch();

  // EligibleSettlement from types/payout.ts
  const eligibleSettlements: PayoutEligibleSettlement[] = useMemo(
    () => eligibleData ?? [],
    [eligibleData],
  );

  // Payout[] from CursorPage<Payout> — `.data` is the array field
  const allPayouts = payoutsData?.data ?? [];

  const filteredPayouts = useMemo(() => {
    return allPayouts.filter((p) => {
      const matchesStatus = payoutFilter === 'all' || p.status === payoutFilter;
      const q = payoutSearch.toLowerCase();
      const matchesSearch = !q ||
        (p.recipient?.nickname?.toLowerCase().includes(q) ?? false) ||
        p.id.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [allPayouts, payoutFilter, payoutSearch]);

  const pendingCount = allPayouts.filter((p) => p.status === 'pending').length;

  const handleDownloadCSV = () => {
    downloadCSV(
      filteredPayouts.map((p) => ({
        ID: p.id,
        배치ID: p.batchId,
        수취인: p.recipient?.nickname ?? p.recipientId,
        총액: p.grossAmount,
        수수료: p.platformFee,
        정산액: p.netAmount,
        상태: payoutStatusConfig[p.status]?.label ?? p.status,
        생성일: p.createdAt,
        처리일: p.processedAt ?? '-',
      })),
      '지급관리',
    );
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">지급 관리</h1>
          <p className="text-base text-gray-500 mt-1">처리 완료된 정산을 배치로 묶어 지급하세요</p>
        </div>
        {pendingCount > 0 && (
          <span className="flex items-center gap-1.5 rounded-full bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
            <Clock size={13} aria-hidden="true" />
            대기 {pendingCount}건
          </span>
        )}
      </div>

      {/* Tab switcher */}
      <div role="tablist" className="flex gap-0 rounded-xl bg-gray-100 dark:bg-gray-800 p-1 mb-6 max-w-xs">
        {([
          { key: 'eligible', label: '지급 대기 정산' },
          { key: 'payouts', label: '지급 목록' },
        ] as { key: PayoutTab; label: string }[]).map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 min-h-[44px] rounded-lg text-sm font-semibold transition-colors ${
              activeTab === tab.key
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Eligible settlements → batch builder */}
      {activeTab === 'eligible' && (
        <>
          {eligibleLoading ? (
            <div className="space-y-3 animate-pulse">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={`es-skeleton-${i}`} className="h-14 rounded-2xl bg-gray-100 dark:bg-gray-800" />
              ))}
            </div>
          ) : eligibleError ? (
            <ErrorState message="지급 대기 정산을 불러오지 못했어요" onRetry={() => void refetchEligible()} />
          ) : (
            <PayoutBatchBuilder
              settlements={eligibleSettlements}
              createPayoutBatchMutation={{
                mutate: (vars, callbacks) => createPayoutBatch.mutate(vars, callbacks),
                isPending: createPayoutBatch.isPending,
              }}
              onSuccess={() => {
                toast('success', '지급 배치가 생성됐어요. 지급 목록 탭에서 확인하세요.');
                void refetchEligible();
                void refetchPayouts();
              }}
            />
          )}
        </>
      )}

      {/* Tab: Payouts list */}
      {activeTab === 'payouts' && (
        <>
          <AdminToolbar
            search={{ value: payoutSearch, onChange: setPayoutSearch, placeholder: '수취인 또는 ID 검색', id: 'admin-payouts-search' }}
            filters={payoutFilters}
            activeFilter={payoutFilter}
            onFilterChange={setPayoutFilter}
            onDownload={handleDownloadCSV}
            count={filteredPayouts.length}
            countLabel="건"
          />

          {payoutsLoading ? (
            <div className="space-y-3 animate-pulse">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={`payout-skeleton-${i}`} className="h-16 rounded-2xl bg-gray-100 dark:bg-gray-800" />
              ))}
            </div>
          ) : payoutsError ? (
            <ErrorState message="지급 목록을 불러오지 못했어요" onRetry={() => void refetchPayouts()} />
          ) : (
            <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                      <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">수취인</th>
                      <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap text-right">총액</th>
                      <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap text-right">수수료</th>
                      <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap text-right">정산액</th>
                      <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">상태</th>
                      <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">생성일</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                    {filteredPayouts.map((payout) => {
                      const sc = payoutStatusConfig[payout.status] ?? { label: payout.status, color: 'bg-gray-100 text-gray-500' };
                      return (
                        <tr key={payout.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                          <td className="px-5 py-3.5 text-base font-medium text-gray-900 dark:text-white whitespace-nowrap">
                            {payout.recipient?.nickname ?? payout.recipientId}
                          </td>
                          <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap text-right">
                            {formatAmount(payout.grossAmount)}
                          </td>
                          <td className="px-5 py-3.5 text-sm text-red-500 dark:text-red-400 whitespace-nowrap text-right">
                            -{formatAmount(payout.platformFee)}
                          </td>
                          <td className="px-5 py-3.5 text-right text-base font-semibold text-blue-500">
                            {formatAmount(payout.netAmount)}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${sc.color}`}>
                              {sc.label}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            {new Date(payout.createdAt).toLocaleDateString('ko-KR')}
                          </td>
                          <td className="px-5 py-3.5">
                            {payout.status === 'pending' && (
                              <MarkPaidRow payoutId={payout.id} refetch={() => void refetchPayouts()} />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredPayouts.length === 0 && (
                      <tr>
                        <td colSpan={7}>
                          <EmptyState
                            icon={Wallet}
                            title="해당 조건의 지급이 없어요"
                            description="다른 필터를 선택해보세요"
                            size="sm"
                          />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
