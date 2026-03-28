'use client';

import { useState } from 'react';
import { CreditCard } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useAdminPayments } from '@/hooks/use-api';
import { AdminToolbar, downloadCSV } from '@/components/admin/admin-toolbar';
import { formatAmount, formatDateTime } from '@/lib/utils';

interface AdminPayment {
  id: string;
  userName: string;
  itemName: string;
  amount: number;
  status: string;
  method: string;
  createdAt: string;
  orderId: string;
}

const paymentFilters = [
  { key: '', label: '전체' },
  { key: 'completed', label: '결제완료' },
  { key: 'pending', label: '대기' },
  { key: 'refunded', label: '환불' },
  { key: 'failed', label: '실패' },
];

const statusLabel: Record<string, string> = {
  completed: '결제완료', pending: '대기', refunded: '환불', failed: '실패',
};
const statusColor: Record<string, string> = {
  completed: 'bg-green-50 text-green-500',
  pending: 'bg-gray-100 text-gray-500',
  refunded: 'bg-red-50 text-red-500',
  failed: 'bg-gray-100 text-gray-400',
};
const methodLabel: Record<string, string> = {
  card: '카드', tosspay: '토스페이', naverpay: '네이버페이', kakaopay: '카카오페이',
};

const mockAdminPayments = [
  { id: 'pay_001', amount: 15000, status: 'completed', method: 'card', orderId: 'MU-20260320-001', createdAt: '2026-03-20T10:30:00', paidAt: '2026-03-20T10:30:00', userId: 'user-1', userName: '축구왕민수', type: 'match', itemName: '주말 풋살 매치' },
  { id: 'pay_002', amount: 20000, status: 'completed', method: 'tosspay', orderId: 'MU-20260318-002', createdAt: '2026-03-18T14:20:00', paidAt: '2026-03-18T14:20:00', userId: 'user-2', userName: '농구러버지영', type: 'match', itemName: '농구 3:3 매치' },
  { id: 'pay_003', amount: 35000, status: 'completed', method: 'kakaopay', orderId: 'MU-20260315-003', createdAt: '2026-03-15T09:00:00', paidAt: '2026-03-15T09:00:00', userId: 'user-3', userName: '배드민턴소희', type: 'lesson', itemName: '배드민턴 초급 강좌' },
  { id: 'pay_004', amount: 18000, status: 'pending', method: 'naverpay', orderId: 'MU-20260319-004', createdAt: '2026-03-19T16:45:00', paidAt: null, userId: 'user-1', userName: '축구왕민수', type: 'match', itemName: '풋살 리그전' },
  { id: 'pay_005', amount: 85000, status: 'completed', method: 'card', orderId: 'MU-20260310-005', createdAt: '2026-03-10T11:30:00', paidAt: '2026-03-10T11:30:00', userId: 'user-4', userName: '하키마스터준호', type: 'market', itemName: '축구화 나이키 팬텀' },
  { id: 'pay_006', amount: 60000, status: 'refunded', method: 'card', orderId: 'MU-20260308-006', createdAt: '2026-03-08T13:15:00', paidAt: '2026-03-08T13:15:00', userId: 'user-2', userName: '농구러버지영', type: 'lesson', itemName: '아이스하키 입문반' },
  { id: 'pay_007', amount: 25000, status: 'completed', method: 'tosspay', orderId: 'MU-20260322-007', createdAt: '2026-03-22T18:00:00', paidAt: '2026-03-22T18:00:00', userId: 'user-5', userName: '테스트유저', type: 'match', itemName: '축구 11:11 팀 매칭' },
  { id: 'pay_008', amount: 50000, status: 'failed', method: 'kakaopay', orderId: 'MU-20260321-008', createdAt: '2026-03-21T20:30:00', paidAt: null, userId: 'user-3', userName: '배드민턴소희', type: 'market', itemName: '요넥스 라켓' },
];

export default function AdminPaymentsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const { data, isLoading } = useAdminPayments();

  const apiPayments = data?.items ?? data ?? [];
  const allPayments: AdminPayment[] = (Array.isArray(apiPayments) && apiPayments.length > 0) ? (apiPayments as unknown as AdminPayment[]) : mockAdminPayments;

  const payments = allPayments.filter((p: AdminPayment) => {
    const userName = p.userName || '';
    const orderId = p.orderId || '';
    const matchesSearch = !search ||
      userName.toLowerCase().includes(search.toLowerCase()) ||
      orderId.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !statusFilter || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleDownload = () => {
    downloadCSV(
      payments.map((p: AdminPayment) => ({
        사용자: p.userName || '알 수 없음',
        금액: p.amount || 0,
        상태: statusLabel[p.status] || p.status,
        결제수단: p.method ? (methodLabel[p.method] || p.method) : '-',
        일시: p.createdAt ? formatDateTime(p.createdAt) : '-',
        주문번호: p.orderId || '-',
      })),
      'payments',
    );
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">결제 관리</h1>
          <p className="text-base text-gray-400 mt-1">전체 결제 내역을 관리하세요</p>
        </div>
      </div>

      <AdminToolbar
        search={{ value: search, onChange: setSearch, placeholder: '사용자 또는 주문번호 검색' }}
        filters={paymentFilters}
        activeFilter={statusFilter}
        onFilterChange={setStatusFilter}
        count={payments.length}
        countLabel="건"
        onDownload={handleDownload}
      />

      <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-50 dark:bg-gray-700" />
            ))}
          </div>
        ) : payments.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="아직 결제 내역이 없어요"
            description="매치에 참가하면 여기서 확인할 수 있어요"
            size="sm"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">사용자</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">금액</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">상태</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">결제수단</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">일시</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">주문번호</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {payments.map((p: AdminPayment, idx: number) => {
                  const userName = p.userName || '알 수 없음';
                  const itemName = p.itemName || p.orderId || '';
                  return (
                  <tr key={p.id || idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900/30 text-xs font-bold text-blue-500 dark:text-blue-400">
                          {userName.charAt(0)}
                        </div>
                        <div>
                          <p className="text-base font-medium text-gray-900 dark:text-white">{userName}</p>
                          <p className="text-xs text-gray-400">{itemName}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-base font-semibold text-gray-900 dark:text-white">{formatAmount(p.amount || 0)}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor[p.status] || 'bg-gray-100 text-gray-400'}`}>
                        {statusLabel[p.status] || p.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-300">
                      {p.method ? methodLabel[p.method] || p.method : '-'}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                      {p.createdAt ? formatDateTime(p.createdAt) : '-'}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-mono text-gray-400 dark:text-gray-500">{p.orderId || '-'}</span>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
