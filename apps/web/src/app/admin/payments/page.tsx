'use client';

import { useMemo, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useAdminPayments } from '@/hooks/use-api';
import { AdminToolbar, downloadCSV } from '@/components/admin/admin-toolbar';
import { formatAmount, formatDateTime } from '@/lib/utils';
import type { Payment } from '@/types/api';

const paymentFilters = [
  { key: '', label: '전체' },
  { key: 'completed', label: '결제완료' },
  { key: 'pending', label: '대기' },
  { key: 'refunded', label: '환불' },
  { key: 'partial_refunded', label: '부분 환불' },
  { key: 'failed', label: '실패' },
];

const statusLabel: Record<string, string> = {
  completed: '결제완료',
  pending: '대기',
  refunded: '환불',
  partial_refunded: '부분 환불',
  failed: '실패',
};

const statusColor: Record<string, string> = {
  completed: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  pending: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  refunded: 'bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400',
  partial_refunded: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  failed: 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500',
};

const methodLabel: Record<string, string> = {
  card: '카드',
  toss_pay: '토스페이',
  naver_pay: '네이버페이',
  kakao_pay: '카카오페이',
  transfer: '계좌이체',
};

function toPaymentRow(payment: Payment) {
  return {
    id: payment.id,
    userName: payment.user?.nickname ?? '알 수 없음',
    userEmail: payment.user?.email ?? null,
    itemName: payment.participant?.match?.title ?? payment.sourceName ?? '연결된 주문 없음',
    amount: payment.amount,
    status: payment.status,
    method: payment.method ?? '',
    createdAt: payment.paidAt ?? payment.createdAt,
    orderId: payment.orderId,
    venueName: payment.participant?.match?.venue?.name ?? payment.participant?.match?.venueName ?? null,
  };
}

export default function AdminPaymentsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const { data = [], isLoading, isError, refetch } = useAdminPayments();

  const payments = useMemo(() => data.map(toPaymentRow), [data]);
  const filtered = useMemo(() => {
    return payments.filter((payment) => {
      const matchesSearch =
        !search ||
        payment.userName.toLowerCase().includes(search.toLowerCase()) ||
        payment.orderId.toLowerCase().includes(search.toLowerCase()) ||
        payment.itemName.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = !statusFilter || payment.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [payments, search, statusFilter]);

  const handleDownload = () => {
    downloadCSV(
      filtered.map((payment) => ({
        사용자: payment.userName,
        이메일: payment.userEmail ?? '',
        금액: payment.amount,
        상태: statusLabel[payment.status] ?? payment.status,
        결제수단: methodLabel[payment.method] ?? payment.method ?? '-',
        일시: payment.createdAt ? formatDateTime(payment.createdAt) : '-',
        주문번호: payment.orderId,
        주문항목: payment.itemName,
        장소: payment.venueName ?? '',
      })),
      'payments',
    );
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">결제 관리</h1>
        <p className="mt-1 text-base text-gray-400">저장된 실제 결제/환불 내역만 표시합니다</p>
      </div>

      <AdminToolbar
        search={{ value: search, onChange: setSearch, placeholder: '사용자, 주문번호 또는 매치명 검색' }}
        filters={paymentFilters}
        activeFilter={statusFilter}
        onFilterChange={setStatusFilter}
        count={filtered.length}
        countLabel="건"
        onDownload={handleDownload}
      />

      {isLoading ? (
        <div className="space-y-3 rounded-2xl border border-gray-100 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-12 animate-pulse rounded-lg bg-gray-50 dark:bg-gray-700" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState message="결제 목록을 불러오지 못했어요" onRetry={() => void refetch()} />
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white dark:border-gray-700 dark:bg-gray-800">
          <EmptyState
            icon={CreditCard}
            title={payments.length === 0 ? '아직 결제 내역이 없어요' : '검색 조건에 맞는 결제가 없어요'}
            description={
              payments.length === 0
                ? '실제 결제가 생성되면 여기에 표시돼요'
                : '다른 검색어 또는 상태로 다시 찾아보세요'
            }
            size="sm"
          />
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-100 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">사용자</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">금액</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">상태</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">결제수단</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">일시</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">주문번호</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {filtered.map((payment) => (
                  <tr key={payment.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-500 dark:bg-blue-900/30 dark:text-blue-400">
                          {payment.userName.charAt(0)}
                        </div>
                        <div>
                          <p className="text-base font-medium text-gray-900 dark:text-white">{payment.userName}</p>
                          <p className="text-xs text-gray-400">{payment.itemName}</p>
                          {payment.venueName ? <p className="text-xs text-gray-400">{payment.venueName}</p> : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-base font-semibold text-gray-900 dark:text-white">
                        {formatAmount(payment.amount)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`rounded-full px-2 py-0.5 text-2xs font-medium ${statusColor[payment.status] ?? 'bg-gray-100 text-gray-400'}`}>
                        {statusLabel[payment.status] ?? payment.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-300">
                      {payment.method ? methodLabel[payment.method] ?? payment.method : '-'}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                      {payment.createdAt ? formatDateTime(payment.createdAt) : '-'}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-mono text-gray-400 dark:text-gray-500">{payment.orderId}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
