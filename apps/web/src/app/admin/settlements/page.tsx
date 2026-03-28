'use client';

import { useState, useCallback } from 'react';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
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
import { formatAmount } from '@/lib/utils';

const settlementFilters = [
  { key: 'all', label: '전체' },
  { key: 'pending', label: '정산 대기' },
  { key: 'completed', label: '정산 완료' },
  { key: 'refunded', label: '환불' },
];

const typeLabel: Record<string, { text: string; color: string }> = {
  match: { text: '매치', color: 'bg-blue-50 text-blue-500' },
  lesson: { text: '강좌', color: 'bg-gray-100 text-gray-600' },
  market: { text: '장터', color: 'bg-gray-100 text-gray-600' },
};

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: '대기', color: 'bg-gray-100 text-gray-600' },
  completed: { label: '완료', color: 'bg-green-50 text-green-500' },
  refunded: { label: '환불', color: 'bg-red-50 text-red-500' },
};

const mockSettlements = [
  { id: 'STL-001', type: 'match', description: '풋살 친선 매치 (5인)', amount: 75000, fee: 7500, settled: 67500, status: 'pending', date: '2026-03-19', user: '김민수' },
  { id: 'STL-002', type: 'lesson', description: '농구 기초 강좌', amount: 50000, fee: 5000, settled: 45000, status: 'pending', date: '2026-03-19', user: '이코치' },
  { id: 'STL-003', type: 'match', description: '배드민턴 복식 매치', amount: 40000, fee: 4000, settled: 36000, status: 'pending', date: '2026-03-18', user: '박지원' },
  { id: 'STL-004', type: 'market', description: '축구화 나이키 팬텀', amount: 85000, fee: 8500, settled: 76500, status: 'completed', date: '2026-03-17', user: '최영진' },
  { id: 'STL-005', type: 'match', description: '농구 3:3 매치', amount: 60000, fee: 6000, settled: 54000, status: 'completed', date: '2026-03-16', user: '정대현' },
  { id: 'STL-006', type: 'lesson', description: '아이스하키 입문반', amount: 120000, fee: 12000, settled: 108000, status: 'completed', date: '2026-03-15', user: '한지훈' },
  { id: 'STL-007', type: 'match', description: '풋살 리그전', amount: 90000, fee: 9000, settled: 81000, status: 'refunded', date: '2026-03-14', user: '윤서연' },
  { id: 'STL-008', type: 'market', description: '배드민턴 라켓 요넥스', amount: 45000, fee: 4500, settled: 40500, status: 'refunded', date: '2026-03-13', user: '오준혁' },
  { id: 'STL-009', type: 'match', description: '농구 5:5 매치', amount: 100000, fee: 10000, settled: 90000, status: 'completed', date: '2026-03-12', user: '장민호' },
  { id: 'STL-010', type: 'lesson', description: '풋살 전술 마스터클래스', amount: 200000, fee: 20000, settled: 180000, status: 'pending', date: '2026-03-19', user: '송프로' },
];

const summaryCards = [
  { label: '총 거래액', value: '865,000원', icon: TrendingUp, color: 'text-blue-500 bg-blue-50', trend: '+12.5%' },
  { label: '수수료 수입', value: '86,500원', icon: ArrowUpRight, color: 'text-blue-500 bg-blue-50', trend: '+8.3%' },
  { label: '정산 대기금', value: '396,000원', icon: Clock, color: 'text-gray-500 bg-gray-100', trend: null },
  { label: '환불 총액', value: '135,000원', icon: ArrowDownRight, color: 'text-red-500 bg-red-50', trend: '-2.1%' },
];

export default function AdminSettlementsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleProcessSettlements = useCallback(async () => {
    if (selectedRows.length === 0 || isProcessing) return;
    setIsProcessing(true);
    try {
      for (const id of selectedRows) {
        await api.patch(`/admin/settlements/${id}/process`, { action: 'process' });
      }
      toast('success', `${selectedRows.length}건의 정산이 처리되었어요`);
      setSelectedRows([]);
    } catch {
      toast('error', '정산 처리에 실패했어요. 다시 시도해주세요');
    } finally {
      setIsProcessing(false);
    }
  }, [selectedRows, isProcessing, toast]);

  const filtered = mockSettlements.filter((s) => {
    const matchesTab = activeTab === 'all' || s.status === activeTab;
    const matchesSearch = !search ||
      s.id.toLowerCase().includes(search.toLowerCase()) ||
      s.user.toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const handleDownloadCSV = () => {
    downloadCSV(
      filtered.map((s) => ({
        거래ID: s.id,
        유형: typeLabel[s.type].text,
        내용: s.description,
        판매자: s.user,
        금액: s.amount,
        수수료: s.fee,
        정산액: s.settled,
        상태: statusConfig[s.status].label,
        날짜: s.date,
      })),
      '정산'
    );
  };

  const toggleRow = (id: string) => {
    setSelectedRows((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedRows.length === filtered.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(filtered.map((s) => s.id));
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">정산 관리</h1>
          <p className="text-base text-gray-400 mt-1">거래 정산 현황을 관리하세요</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 hover:shadow-[0_2px_16px_rgba(0,0,0,0.04)] transition-[colors,shadow]">
            <div className="flex items-center justify-between mb-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.color}`}>
                <card.icon size={20} />
              </div>
              {card.trend && (
                <span className={`text-xs font-medium ${card.trend.startsWith('+') ? 'text-green-500' : 'text-red-500'}`}>
                  {card.trend}
                </span>
              )}
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{card.value}</p>
            <p className="text-sm text-gray-400 mt-0.5">{card.label}</p>
          </div>
        ))}
      </div>

      <AdminToolbar
        search={{ value: search, onChange: setSearch, placeholder: '거래 ID 또는 판매자 검색' }}
        filters={settlementFilters}
        activeFilter={activeTab}
        onFilterChange={(key) => { setActiveTab(key); setSelectedRows([]); }}
        onDownload={handleDownloadCSV}
        count={filtered.length}
        countLabel="건"
      />

      {/* Bulk Action */}
      {activeTab === 'pending' && selectedRows.length > 0 && (
        <div className="flex items-center gap-3 mb-4 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 px-5 py-3">
          <CheckCircle size={18} className="text-blue-500" />
          <span className="text-base font-medium text-blue-700 dark:text-blue-300">{selectedRows.length}건 선택됨</span>
          <button onClick={handleProcessSettlements} disabled={isProcessing} className="ml-auto flex items-center gap-2 rounded-xl bg-blue-500 px-4 py-2 text-sm font-bold text-white hover:bg-blue-600 disabled:opacity-50 transition-colors">
            <Wallet size={16} />
            정산 처리
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                {activeTab === 'pending' && (
                  <th className="px-4 py-3 w-10">
                    <button onClick={toggleAll} className={`flex h-4.5 w-4.5 items-center justify-center rounded border-2 transition-colors ${
                      selectedRows.length === filtered.length && filtered.length > 0
                        ? 'bg-blue-500 border-blue-500'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}>
                      {selectedRows.length === filtered.length && filtered.length > 0 && (
                        <CheckCircle size={10} className="text-white" />
                      )}
                    </button>
                  </th>
                )}
                <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">거래 ID</th>
                <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">유형</th>
                <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">내용</th>
                <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">판매자</th>
                <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider text-right">금액</th>
                <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider text-right">수수료</th>
                <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider text-right">정산액</th>
                <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">상태</th>
                <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">날짜</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {filtered.map((s) => {
                const sType = typeLabel[s.type];
                const sStatus = statusConfig[s.status];
                return (
                  <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    {activeTab === 'pending' && (
                      <td className="px-4 py-3.5">
                        <button onClick={() => toggleRow(s.id)} className={`flex h-4.5 w-4.5 items-center justify-center rounded border-2 transition-colors ${
                          selectedRows.includes(s.id)
                            ? 'bg-blue-500 border-blue-500'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}>
                          {selectedRows.includes(s.id) && (
                            <CheckCircle size={10} className="text-white" />
                          )}
                        </button>
                      </td>
                    )}
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-mono text-gray-400 dark:text-gray-500">{s.id}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${sType.color}`}>
                        {sType.text}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">{s.description}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900/30 text-xs font-bold text-blue-500 dark:text-blue-400">
                          {s.user.charAt(0)}
                        </div>
                        <span className="text-sm text-gray-700 dark:text-gray-300">{s.user}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="text-base font-semibold text-gray-900 dark:text-white">{formatAmount(s.amount)}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="text-sm text-gray-500 dark:text-gray-400">{formatAmount(s.fee)}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="text-base font-semibold text-blue-500">{formatAmount(s.settled)}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${sStatus.color}`}>
                        {sStatus.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{s.date}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <EmptyState
            icon={Wallet}
            title="해당 상태의 정산 내역이 없어요"
            description="다른 필터를 선택해보세요"
            size="sm"
          />
        )}
      </div>
    </div>
  );
}
