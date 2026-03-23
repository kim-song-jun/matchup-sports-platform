'use client';

import { CreditCard } from 'lucide-react';
import { useAdminPayments } from '@/hooks/use-api';
import type { Payment } from '@/types/api';

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
  const { data, isLoading } = useAdminPayments();

  const apiPayments = data?.items ?? data ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payments: any[] = (Array.isArray(apiPayments) && apiPayments.length > 0) ? apiPayments : mockAdminPayments;

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
                {payments.map((p: any, idx: number) => {
                  const userName = (p.user as Record<string, unknown>)?.nickname || p.userName || '알 수 없음';
                  const userEmail = (p.user as Record<string, unknown>)?.email || '';
                  const itemName = p.itemName || p.orderId || '';
                  return (
                  <tr key={p.id as string || idx} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-[12px] font-bold text-blue-500">
                          {String(userName).charAt(0)}
                        </div>
                        <div>
                          <p className="text-[14px] font-medium text-gray-900">{String(userName)}</p>
                          <p className="text-[11px] text-gray-400">{String(itemName || userEmail)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-[14px] font-semibold text-gray-900">{formatCurrency(Number(p.amount) || 0)}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusColor[String(p.status)] || 'bg-gray-100 text-gray-400'}`}>
                        {statusLabel[String(p.status)] || String(p.status)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-gray-600">
                      {p.method ? methodLabel[String(p.method)] || String(p.method) : '-'}
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-gray-500">
                      {p.createdAt ? formatDate(String(p.createdAt)) : '-'}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-[12px] font-mono text-gray-400">{String(p.orderId || '-')}</span>
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
