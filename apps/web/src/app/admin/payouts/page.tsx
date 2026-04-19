'use client';

import { useMemo, useState } from 'react';
import { Wallet, CheckCircle, Clock, Ban, Loader2, XCircle, RefreshCw, AlertTriangle } from 'lucide-react';
import { AdminToolbar, downloadCSV } from '@/components/admin/admin-toolbar';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Modal } from '@/components/ui/modal';
import { PayoutBatchBuilder } from '@/components/admin/payout-batch-builder';
import { WeeklyPayoutBars } from '@/components/admin/weekly-payout-bars';
import { useToast } from '@/components/ui/toast';
import { formatAmount, extractErrorMessage } from '@/lib/utils';
import {
  useAdminPayouts,
  useAdminEligibleSettlements,
  useCreatePayoutBatch,
  useMarkPayoutPaid,
  useMarkPayoutFailed,
} from '@/hooks/use-api';
import { useRetryPayout } from '@/hooks/use-api';

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

function MarkFailedModal({
  payoutId,
  isOpen,
  onClose,
}: {
  payoutId: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const markFailed = useMarkPayoutFailed();

  const handleSubmit = () => {
    if (reason.trim().length < 10 || markFailed.isPending) return;
    markFailed.mutate(
      { id: payoutId, data: { reason: reason.trim() } },
      {
        onSuccess: () => {
          toast('success', '지급 실패로 처리됐어요.');
          setReason('');
          onClose();
        },
        onError: (err) => {
          toast('error', extractErrorMessage(err, '처리에 실패했어요. 다시 시도해주세요.'));
        },
      },
    );
  };

  const handleClose = () => {
    setReason('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="지급 실패 처리" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          지급 실패 사유를 입력하세요. 최소 10자 이상이어야 해요.
        </p>
        <div>
          <label htmlFor={`fail-reason-${payoutId}`} className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
            실패 사유 <span className="text-red-500" aria-hidden="true">*</span>
          </label>
          <textarea
            id={`fail-reason-${payoutId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="예: 계좌번호 불일치로 이체 반송됨"
            rows={4}
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 resize-none transition-colors"
          />
          <p className="mt-1 text-xs text-gray-400">{reason.length}/10자 이상</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={markFailed.isPending}
            className="flex-1 min-h-[44px] rounded-xl border border-gray-200 dark:border-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={reason.trim().length < 10 || markFailed.isPending}
            className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-red-500 py-3 text-base font-semibold text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
          >
            {markFailed.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
            실패 처리
          </button>
        </div>
      </div>
    </Modal>
  );
}

function MarkPaidRow({ payoutId }: { payoutId: string }) {
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

function aggregateWeeklyPayouts(payouts: { status: string; netAmount: number; createdAt: string }[]): { weekStart: string; total: number }[] {
  const paidPayouts = payouts.filter((p) => p.status === 'paid');
  const buckets: Record<string, number> = {};
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

  for (const p of paidPayouts) {
    const d = new Date(p.createdAt);
    if (d < fourWeeksAgo) continue;
    // Normalize to Monday of the week
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((day + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    buckets[key] = (buckets[key] ?? 0) + p.netAmount;
  }

  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-4)
    .map(([weekStart, total]) => ({ weekStart, total }));
}

export default function AdminPayoutsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<PayoutTab>('eligible');
  const [payoutFilter, setPayoutFilter] = useState('all');
  const [payoutSearch, setPayoutSearch] = useState('');
  const [failingPayoutId, setFailingPayoutId] = useState<string | null>(null);

  const { data: eligibleData, isLoading: eligibleLoading, isError: eligibleError, refetch: refetchEligible } = useAdminEligibleSettlements();
  const { data: payoutsData, isLoading: payoutsLoading, isError: payoutsError, refetch: refetchPayouts } = useAdminPayouts();
  const { data: failedPayoutsData, isLoading: failedPayoutsLoading } = useAdminPayouts({ status: 'failed' });
  const createPayoutBatch = useCreatePayoutBatch();
  const retryPayout = useRetryPayout();

  const eligibleSettlements: PayoutEligibleSettlement[] = useMemo(
    () => eligibleData ?? [],
    [eligibleData],
  );

  const allPayouts = payoutsData?.data ?? [];
  const failedPayouts = failedPayoutsData?.data ?? [];
  const weeklyBars = useMemo(() => aggregateWeeklyPayouts(allPayouts), [allPayouts]);

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

  const handleRetryPayout = (payoutId: string) => {
    retryPayout.mutate(payoutId, {
      onSuccess: () => {
        toast('success', '재대기열로 복원됐어요');
      },
      onError: (err) => {
        toast('error', extractErrorMessage(err, '재시도에 실패했어요. 다시 시도해주세요.'));
      },
    });
  };

  return (
    <div className="animate-fade-in space-y-8">
      <div className="flex items-center justify-between">
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

      {/* Failed payouts — pinned top section */}
      {!failedPayoutsLoading && failedPayouts.length > 0 && (
        <section
          aria-label="실패한 지급 목록"
          className="rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-5 space-y-4"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-red-500 shrink-0" aria-hidden="true" />
            <h2 className="text-base font-semibold text-red-700 dark:text-red-400">
              실패 payout ({failedPayouts.length}건)
            </h2>
          </div>
          <div className="space-y-2">
            {failedPayouts.map((payout) => (
              <div
                key={payout.id}
                className="flex items-center justify-between gap-4 rounded-xl bg-white dark:bg-gray-800 border border-red-100 dark:border-red-900/40 px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {payout.recipient?.nickname ?? payout.recipientId}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {formatAmount(payout.netAmount)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRetryPayout(payout.id)}
                  disabled={retryPayout.isPending}
                  aria-label={`${payout.recipient?.nickname ?? payout.recipientId} 지급 재대기열 복원`}
                  className="flex items-center gap-1.5 min-h-[44px] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900"
                >
                  {retryPayout.isPending ? (
                    <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw size={14} aria-hidden="true" />
                  )}
                  재대기열 복원
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Weekly payout bars */}
      {weeklyBars.length > 0 && (
        <section aria-label="주간 지급 합계">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">주간 지급 현황</h2>
          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <WeeklyPayoutBars weeks={weeklyBars} />
          </div>
        </section>
      )}

      {/* Tab switcher */}
      <div role="tablist" className="flex gap-0 rounded-xl bg-gray-100 dark:bg-gray-800 p-1 max-w-xs">
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
                      <th scope="col" className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">수취인</th>
                      <th scope="col" className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap text-right">총액</th>
                      <th scope="col" className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap text-right">수수료</th>
                      <th scope="col" className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap text-right">정산액</th>
                      <th scope="col" className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">상태</th>
                      <th scope="col" className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">생성일</th>
                      <th scope="col" className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                    {filteredPayouts.map((payout) => {
                      const sc = payoutStatusConfig[payout.status] ?? { label: payout.status, color: 'bg-gray-100 text-gray-500' };
                      const canAct = payout.status === 'pending' || payout.status === 'processing';
                      return (
                        <tr key={payout.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                          <td className="px-5 py-3.5">
                            <p className="text-base font-medium text-gray-900 dark:text-white whitespace-nowrap">
                              {payout.recipient?.nickname ?? payout.recipientId}
                            </p>
                            {payout.markedPaidByAdminId && (
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 font-mono">
                                처리자: {payout.markedPaidByAdminId}
                              </p>
                            )}
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
                            {canAct && (
                              <div className="flex items-center gap-2">
                                <MarkPaidRow payoutId={payout.id} />
                                <button
                                  type="button"
                                  onClick={() => setFailingPayoutId(payout.id)}
                                  className="flex items-center gap-1 text-sm font-medium text-red-500 hover:text-red-600 min-h-[44px] transition-colors"
                                  aria-label={`${payout.recipient?.nickname ?? payout.recipientId} 지급 실패 처리`}
                                >
                                  <XCircle size={14} aria-hidden="true" />
                                  지급 실패
                                </button>
                              </div>
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

      {/* Mark-failed modal — shown when user clicks 지급 실패 on a payout row */}
      {failingPayoutId && (
        <MarkFailedModal
          payoutId={failingPayoutId}
          isOpen={failingPayoutId !== null}
          onClose={() => setFailingPayoutId(null)}
        />
      )}
    </div>
  );
}
