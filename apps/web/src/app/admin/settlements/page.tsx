'use client';

import { useMemo, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import {
  Wallet,
  TrendingUp,
  Clock,
  RotateCcw,
  CheckCircle,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { AdminToolbar, downloadCSV } from '@/components/admin/admin-toolbar';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useAdminSettlements, useProcessSettlement, useSettlementsSummary } from '@/hooks/use-api';
import { formatAmount } from '@/lib/utils';

const settlementFilters = [
  { key: 'all', label: '전체' },
  { key: 'pending', label: '정산 대기' },
  { key: 'processed', label: '정산 완료' },
  { key: 'refunded', label: '환불' },
  { key: 'failed', label: '실패' },
];

const typeLabel: Record<string, { text: string; color: string }> = {
  match_fee: { text: '매치', color: 'bg-blue-50 text-blue-500' },
  lesson_fee: { text: '강좌', color: 'bg-gray-100 text-gray-600' },
  mercenary_fee: { text: '용병', color: 'bg-gray-100 text-gray-600' },
  venue_rental: { text: '대관', color: 'bg-gray-100 text-gray-600' },
};

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: '대기', color: 'bg-gray-100 text-gray-600' },
  processed: { label: '완료', color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
  refunded: { label: '환불', color: 'bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400' },
  failed: { label: '실패', color: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' },
};

export default function AdminSettlementsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const { data: settlements = [], isLoading, isError, refetch } = useAdminSettlements();
  const { data: summary } = useSettlementsSummary();
  const processSettlement = useProcessSettlement();

  const filtered = useMemo(() => {
    return settlements.filter((settlement) => {
      const matchesTab = activeTab === 'all' || settlement.status === activeTab;
      const matchesSearch = !search ||
        settlement.id.toLowerCase().includes(search.toLowerCase()) ||
        settlement.recipientName.toLowerCase().includes(search.toLowerCase()) ||
        settlement.payerName.toLowerCase().includes(search.toLowerCase());
      return matchesTab && matchesSearch;
    });
  }, [activeTab, search, settlements]);

  const summaryCards = [
    { label: '총 거래액', value: formatAmount(summary?.total ?? 0), icon: TrendingUp, color: 'text-blue-500 bg-blue-50' },
    { label: '수수료 수입', value: formatAmount(summary?.commission ?? 0), icon: ArrowUpRight, color: 'text-blue-500 bg-blue-50' },
    { label: '정산 대기금', value: formatAmount(summary?.pending ?? 0), icon: Clock, color: 'text-gray-500 bg-gray-100' },
    { label: '환불 총액', value: formatAmount(summary?.refunded ?? 0), icon: ArrowDownRight, color: 'text-red-500 bg-red-50' },
  ];

  const handleProcessSettlements = async () => {
    if (selectedRows.length === 0 || processSettlement.isPending) return;

    const results = await Promise.allSettled(
      selectedRows.map((id) =>
        processSettlement.mutateAsync({ id, data: { action: 'approve', note: 'bulk settlement approval' } }),
      ),
    );

    const succeeded = results.filter((result) => result.status === 'fulfilled').length;
    const failed = results.length - succeeded;

    if (succeeded > 0) {
      toast('success', failed > 0 ? `${succeeded}건 처리, ${failed}건 실패` : `${succeeded}건의 정산이 처리되었어요`);
    }
    if (failed > 0) {
      toast('error', '일부 정산은 처리되지 않았어요. 상태를 확인해주세요.');
    }

    setSelectedRows(results.flatMap((result, index) => (result.status === 'rejected' ? [selectedRows[index]] : [])));
  };

  const handleDownloadCSV = () => {
    downloadCSV(
      filtered.map((settlement) => ({
        거래ID: settlement.id,
        유형: typeLabel[settlement.type]?.text ?? settlement.type,
        내용: settlement.description,
        지급대상: settlement.recipientName,
        결제자: settlement.payerName,
        금액: settlement.amount,
        수수료: settlement.commission,
        정산액: settlement.netAmount,
        상태: statusConfig[settlement.status]?.label ?? settlement.status,
        최근액션: settlement.history?.[settlement.history.length - 1]?.action ?? '-',
      })),
      '정산'
    );
  };

  const toggleRow = (id: string) => {
    setSelectedRows((prev) => (prev.includes(id) ? prev.filter((row) => row !== id) : [...prev, id]));
  };

  const toggleAll = () => {
    if (selectedRows.length === filtered.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(filtered.map((settlement) => settlement.id));
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">정산 관리</h1>
          <p className="text-base text-gray-400 mt-1">실제 정산 상태와 운영 이력을 함께 검토하세요</p>
        </div>
      </div>

      <div className="grid grid-cols-2 @3xl:grid-cols-4 gap-4 mb-6">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.color}`}>
                <card.icon size={20} />
              </div>
            </div>
            <dl>
              <dt className="text-sm text-gray-400 mt-0.5">{card.label}</dt>
              <dd className="text-2xl font-bold text-gray-900 dark:text-white">{card.value}</dd>
            </dl>
          </div>
        ))}
      </div>

      <AdminToolbar
        search={{ value: search, onChange: setSearch, placeholder: '거래 ID 또는 당사자 검색' }}
        filters={settlementFilters}
        activeFilter={activeTab}
        onFilterChange={(key) => {
          setActiveTab(key);
          setSelectedRows([]);
        }}
        onDownload={handleDownloadCSV}
        count={filtered.length}
        countLabel="건"
      />

      {activeTab === 'pending' && selectedRows.length > 0 ? (
        <div className="flex items-center gap-3 mb-4 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 px-5 py-3">
          <CheckCircle size={18} className="text-blue-500" />
          <span className="text-base font-medium text-blue-700 dark:text-blue-300">{selectedRows.length}건 선택됨</span>
          <button
            onClick={() => void handleProcessSettlements()}
            disabled={processSettlement.isPending}
            className="ml-auto flex items-center gap-2 rounded-xl bg-blue-500 px-4 py-2 text-sm font-bold text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            <Wallet size={16} />
            정산 승인
          </button>
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-16 rounded-2xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState message="정산 목록을 불러오지 못했어요" onRetry={() => void refetch()} />
      ) : (
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                  {activeTab === 'pending' ? (
                    <th className="px-4 py-3 w-10">
                      <button onClick={toggleAll} className={`flex h-4.5 w-4.5 items-center justify-center rounded border transition-colors ${
                        selectedRows.length === filtered.length && filtered.length > 0
                          ? 'bg-blue-500 border-blue-500'
                          : 'border-gray-300 dark:border-gray-600'
                      }`}>
                        {selectedRows.length === filtered.length && filtered.length > 0 ? (
                          <CheckCircle size={10} className="text-white" />
                        ) : null}
                      </button>
                    </th>
                  ) : null}
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">거래 ID</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">유형</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">내용</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">지급대상</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider text-right">정산액</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">상태</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">최근 액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {filtered.map((settlement) => (
                  <tr key={settlement.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    {activeTab === 'pending' ? (
                      <td className="px-4 py-3.5">
                        <button onClick={() => toggleRow(settlement.id)} className={`flex h-4.5 w-4.5 items-center justify-center rounded border transition-colors ${
                          selectedRows.includes(settlement.id)
                            ? 'bg-blue-500 border-blue-500'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}>
                          {selectedRows.includes(settlement.id) ? <CheckCircle size={10} className="text-white" /> : null}
                        </button>
                      </td>
                    ) : null}
                    <td className="px-5 py-3.5 text-xs font-mono text-gray-400 dark:text-gray-500">{settlement.id}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${typeLabel[settlement.type]?.color ?? 'bg-gray-100 text-gray-500'}`}>
                        {typeLabel[settlement.type]?.text ?? settlement.type}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">{settlement.description}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{settlement.recipientName}</td>
                    <td className="px-5 py-3.5 text-right text-base font-semibold text-blue-500">{formatAmount(settlement.netAmount)}</td>
                    <td className="px-5 py-3.5">
                      <span className={`rounded-full px-2 py-0.5 text-2xs font-medium ${statusConfig[settlement.status]?.color ?? 'bg-gray-100 text-gray-500'}`}>
                        {statusConfig[settlement.status]?.label ?? settlement.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400">
                      {settlement.history?.length
                        ? `${settlement.history[settlement.history.length - 1].action} · ${new Date(settlement.history[settlement.history.length - 1].createdAt).toLocaleDateString('ko-KR')}`
                        : '기록 없음'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="해당 상태의 정산 내역이 없어요"
              description="다른 필터를 선택해보세요"
              size="sm"
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
