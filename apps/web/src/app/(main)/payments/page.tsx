'use client';

import { useState } from 'react';
import { ArrowLeft, CreditCard, CheckCircle, XCircle, Clock, RotateCcw, Wallet, ShoppingBag, Trophy, GraduationCap, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePayments } from '@/hooks/use-api';
import { EmptyState } from '@/components/ui/empty-state';
import { formatAmount } from '@/lib/utils';

const tabs = [
  { id: 'all', label: '전체' },
  { id: 'match', label: '매치' },
  { id: 'lesson', label: '강좌' },
  { id: 'market', label: '장터' },
];

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle; color: string }> = {
  completed: { label: '결제 완료', icon: CheckCircle, color: 'text-green-600 bg-green-50' },
  pending: { label: '대기중', icon: Clock, color: 'text-amber-500 bg-amber-50' },
  refunded: { label: '환불됨', icon: RotateCcw, color: 'text-red-500 bg-red-50' },
  failed: { label: '실패', icon: XCircle, color: 'text-gray-500 bg-gray-100' },
};

const methodConfig: Record<string, { label: string; icon: typeof CreditCard }> = {
  card: { label: '카드', icon: CreditCard },
  tosspay: { label: '토스페이', icon: Wallet },
  naverpay: { label: '네이버페이', icon: Wallet },
  kakaopay: { label: '카카오페이', icon: Wallet },
};

const typeConfig: Record<string, { label: string; icon: typeof Trophy; color: string }> = {
  match: { label: '매치', icon: Trophy, color: 'bg-gray-100 text-gray-500' },
  lesson: { label: '강좌', icon: GraduationCap, color: 'bg-gray-100 text-gray-500' },
  market: { label: '장터', icon: ShoppingBag, color: 'bg-gray-100 text-gray-600' },
};

const mockPayments = [
  {
    id: 'pay_mock_001',
    type: 'match',
    name: '풋살 친선 매치',
    amount: 14500,
    status: 'completed',
    method: 'card',
    createdAt: '2026-03-20T10:30:00',
  },
  {
    id: 'pay_mock_002',
    type: 'match',
    name: '농구 3:3 매치',
    amount: 20000,
    status: 'refunded',
    method: 'tosspay',
    createdAt: '2026-03-15T14:20:00',
  },
  {
    id: 'pay_mock_003',
    type: 'lesson',
    name: '배드민턴 초급 강좌',
    amount: 35000,
    status: 'completed',
    method: 'kakaopay',
    createdAt: '2026-03-12T09:00:00',
  },
  {
    id: 'pay_mock_004',
    type: 'match',
    name: '풋살 리그전',
    amount: 18000,
    status: 'pending',
    method: 'naverpay',
    createdAt: '2026-03-19T16:45:00',
  },
  {
    id: 'pay_mock_005',
    type: 'market',
    name: '축구화 나이키 팬텀',
    amount: 85000,
    status: 'completed',
    method: 'card',
    createdAt: '2026-03-10T11:30:00',
  },
  {
    id: 'pay_mock_006',
    type: 'lesson',
    name: '아이스하키 입문반',
    amount: 60000,
    status: 'failed',
    method: 'card',
    createdAt: '2026-03-08T13:15:00',
  },
];

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function PaymentsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const { data: apiPayments } = usePayments();

  // API 데이터가 있으면 사용, 없으면 목업 데이터로 폴백
  // API Payment 타입과 목업 타입이 다르므로 공통 형태로 변환
  const payments = apiPayments
    ? apiPayments.map((p) => ({
        id: p.id,
        type: 'match' as string,
        name: p.orderId || '결제',
        amount: p.amount,
        status: p.status,
        method: p.method || 'card',
        createdAt: p.createdAt,
      }))
    : mockPayments;

  const tabFiltered = activeTab === 'all'
    ? payments
    : payments.filter((p) => p.type === activeTab);
  const filtered = tabFiltered.filter((p) => {
    if (dateFrom && p.createdAt < dateFrom) return false;
    if (dateTo && p.createdAt > dateTo + 'T23:59:59') return false;
    return true;
  });

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0 dark:bg-gray-900">
      {/* Header */}
      <header className="lg:hidden flex items-center gap-3 px-5 pt-4 pb-3">
        <button aria-label="뒤로 가기" onClick={() => router.back()} className="rounded-xl p-2 -ml-2 hover:bg-gray-100 active:scale-[0.98] transition-all min-w-[44px] min-h-[44px] flex items-center justify-center">
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">결제 내역</h1>
      </header>
      <div className="hidden lg:block px-5 lg:px-0 pt-4 pb-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">결제 내역</h1>
        <p className="text-sm text-gray-500 mt-0.5">매치, 강좌, 장터 결제 내역을 확인하세요</p>
      </div>

      <div className="px-5 lg:px-0">
        {/* 기간 필터 */}
        <div className="flex items-center gap-2 mb-4">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          <span className="text-sm text-gray-500">~</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 mb-5 rounded-xl bg-gray-100 p-1 overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Payment List */}
        {filtered.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="아직 결제 내역이 없어요"
            description="매치에 참가하면 여기서 확인할 수 있어요"
          />
        ) : (
          <div className="space-y-3 stagger-children">
            {filtered.map((p) => {
              const s = statusConfig[p.status] || statusConfig.pending;
              const m = methodConfig[p.method] || methodConfig.card;
              const t = typeConfig[p.type] || typeConfig.match;
              const StatusIcon = s.icon;
              const MethodIcon = m.icon;
              const TypeIcon = t.icon;
              return (
                <Link
                  key={p.id}
                  href={`/payments/${p.id}`}
                  className="block rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-[0.98] transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${t.color} shrink-0`}>
                        <TypeIcon size={20} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-base font-semibold text-gray-900 dark:text-white truncate">{p.name}</p>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold ${s.color}`}>
                            {s.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <MethodIcon size={12} />
                            {m.label}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{formatDate(p.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className="text-md font-bold text-gray-900 dark:text-white">{formatAmount(p.amount)}</span>
                      <ChevronRight size={16} className="text-gray-300" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
