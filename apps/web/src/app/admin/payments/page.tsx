'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { CreditCard } from 'lucide-react';

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

function formatCurrency(n: number) {
  return new Intl.NumberFormat('ko-KR').format(n) + '원';
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminPaymentsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'payments'],
    queryFn: async () => {
      const res = await api.get('/admin/payments');
      return (res as any).data;
    },
  });

  const payments = data?.items ?? [];

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[24px] font-bold text-gray-900">결제 관리</h1>
          <p className="text-[14px] text-gray-400 mt-1">전체 결제 내역을 관리하세요</p>
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-50" />
            ))}
          </div>
        ) : payments.length === 0 ? (
          <div className="p-16 text-center">
            <CreditCard size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-[15px] font-medium text-gray-600">결제 내역이 없습니다</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-5 py-3 text-[12px] font-semibold text-gray-500 uppercase tracking-wider">사용자</th>
                  <th className="px-5 py-3 text-[12px] font-semibold text-gray-500 uppercase tracking-wider">금액</th>
                  <th className="px-5 py-3 text-[12px] font-semibold text-gray-500 uppercase tracking-wider">상태</th>
                  <th className="px-5 py-3 text-[12px] font-semibold text-gray-500 uppercase tracking-wider">결제수단</th>
                  <th className="px-5 py-3 text-[12px] font-semibold text-gray-500 uppercase tracking-wider">일시</th>
                  <th className="px-5 py-3 text-[12px] font-semibold text-gray-500 uppercase tracking-wider">주문번호</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {payments.map((p: any) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-[12px] font-bold text-blue-500">
                          {p.user?.nickname?.charAt(0) || '?'}
                        </div>
                        <div>
                          <p className="text-[14px] font-medium text-gray-900">{p.user?.nickname || '알 수 없음'}</p>
                          <p className="text-[11px] text-gray-400">{p.user?.email || ''}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-[14px] font-semibold text-gray-900">{formatCurrency(p.amount)}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusColor[p.status] || 'bg-gray-100 text-gray-400'}`}>
                        {statusLabel[p.status] || p.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-gray-600">
                      {methodLabel[p.method] || p.method || '-'}
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-gray-500">
                      {p.createdAt ? formatDate(p.createdAt) : '-'}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-[12px] font-mono text-gray-400">{p.orderId || '-'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
