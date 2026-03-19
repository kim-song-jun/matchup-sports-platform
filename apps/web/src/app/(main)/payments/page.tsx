'use client';

import { ArrowLeft, CreditCard, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import Link from 'next/link';

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle; color: string }> = {
  completed: { label: '결제 완료', icon: CheckCircle, color: 'text-green-600 bg-green-50' },
  pending: { label: '대기중', icon: Clock, color: 'text-amber-500 bg-amber-50' },
  refunded: { label: '환불됨', icon: XCircle, color: 'text-red-500 bg-red-50' },
  failed: { label: '실패', icon: XCircle, color: 'text-gray-500 bg-gray-100' },
};

function formatCurrency(n: number) { return new Intl.NumberFormat('ko-KR').format(n) + '원'; }
function formatDate(d: string) { return new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }); }

export default function PaymentsPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: async () => {
      const res = await api.get('/payments/me');
      return (res as any).data;
    },
    enabled: isAuthenticated,
  });

  const payments = Array.isArray(data) ? data : [];

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0">
      <header className="lg:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50">
        <button onClick={() => router.back()} className="rounded-lg p-1.5 -ml-1.5"><ArrowLeft size={20} className="text-gray-700" /></button>
        <h1 className="text-[16px] font-semibold text-gray-900">결제 내역</h1>
      </header>
      <div className="hidden lg:block mb-6">
        <h2 className="text-[24px] font-bold text-gray-900">결제 내역</h2>
      </div>

      <div className="px-5 lg:px-0">
        {!isAuthenticated ? (
          <div className="rounded-2xl bg-gray-50 p-16 text-center">
            <CreditCard size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-[15px] font-medium text-gray-600">로그인 후 확인할 수 있어요</p>
            <Link href="/login" className="mt-4 inline-block rounded-lg bg-gray-900 px-6 py-2.5 text-[14px] font-semibold text-white">로그인</Link>
          </div>
        ) : isLoading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-50" />)}</div>
        ) : payments.length === 0 ? (
          <div className="rounded-2xl bg-gray-50 p-16 text-center">
            <CreditCard size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-[15px] font-medium text-gray-600">결제 내역이 없어요</p>
            <p className="text-[13px] text-gray-400 mt-1">매치에 참가하면 여기서 확인할 수 있어요</p>
          </div>
        ) : (
          <div className="space-y-3">
            {payments.map((p: any) => {
              const s = statusConfig[p.status] || statusConfig.pending;
              const StatusIcon = s.icon;
              return (
                <div key={p.id} className="rounded-2xl bg-white border border-gray-100 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.color}`}>
                      <StatusIcon size={18} />
                    </div>
                    <div>
                      <p className="text-[14px] font-medium text-gray-900">{formatCurrency(p.amount)}</p>
                      <p className="text-[12px] text-gray-400">{formatDate(p.createdAt)}</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${s.color}`}>{s.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="h-8" />
    </div>
  );
}
