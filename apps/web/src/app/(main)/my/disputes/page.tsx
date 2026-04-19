'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle, ChevronRight, Clock } from 'lucide-react';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useMyDisputes } from '@/hooks/use-api';
import {
  USER_DISPUTE_STATUS_LABELS,
  DISPUTE_TYPE_LABELS,
  ACTIVE_DISPUTE_STATUSES,
} from '@/lib/dispute-labels';

// useMyDisputes(role?: 'buyer' | 'seller' | 'all') → InfiniteQuery<CursorPage<Dispute>>
// Dispute.status: DisputeStatus union from types/dispute.ts

type DisputeTab = 'active' | 'resolved';
type RoleTab = 'buyer' | 'seller';

export default function MyDisputesPage() {
  const router = useRouter();
  useRequireAuth();
  const [activeTab, setActiveTab] = useState<DisputeTab>('active');
  const [roleTab, setRoleTab] = useState<RoleTab>('buyer');

  // useMyDisputes returns an infinite query — we access all pages flat
  const { data, isLoading, isError, refetch } = useMyDisputes(roleTab);

  // Flatten all pages — CursorPage<T> stores the array in `.data`
  const allDisputes = data?.pages?.flatMap((page) => page.data ?? []) ?? [];

  // Filter by tab: active vs resolved
  const disputes = allDisputes.filter((d) =>
    activeTab === 'active'
      ? ACTIVE_DISPUTE_STATUSES.has(d.status)
      : !ACTIVE_DISPUTE_STATUSES.has(d.status),
  );

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      {/* Mobile header */}
      <header className="@3xl:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50 dark:border-gray-800">
        <button
          aria-label="뒤로 가기"
          onClick={() => router.back()}
          className="rounded-xl p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-[0.98] transition-[colors,transform] min-w-11 min-h-[44px] flex items-center justify-center"
        >
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">분쟁 내역</h1>
      </header>

      {/* Desktop title */}
      <div className="hidden @3xl:block mb-2 px-5 @3xl:px-0 pt-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">분쟁 내역</h2>
        <p className="text-base text-gray-500 mt-1">분쟁 처리 현황을 확인하세요</p>
      </div>

      {/* Role tab: buyer vs seller */}
      <div className="px-5 @3xl:px-0 mt-4 mb-2">
        <div role="tablist" className="flex gap-0 rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
          {([
            { key: 'buyer', label: '신고한 분쟁' },
            { key: 'seller', label: '응답 중인 분쟁' },
          ] as { key: RoleTab; label: string }[]).map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={roleTab === tab.key}
              onClick={() => setRoleTab(tab.key)}
              className={`flex-1 min-h-[44px] rounded-lg text-sm font-semibold transition-colors ${
                roleTab === tab.key
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Status tab: active vs resolved */}
      <div className="px-5 @3xl:px-0 mb-4">
        <div role="tablist" className="flex gap-0 rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
          {([
            { key: 'active', label: '진행중' },
            { key: 'resolved', label: '해결됨' },
          ] as { key: DisputeTab; label: string }[]).map((tab) => (
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
      </div>

      <div className="px-5 @3xl:px-0 pb-10 space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, idx) => (
            <div
              key={`dispute-skeleton-${idx}`}
              className="h-24 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse"
            />
          ))
        ) : isError ? (
          <ErrorState
            message="분쟁 내역을 불러오지 못했어요"
            onRetry={() => void refetch()}
          />
        ) : disputes.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title={activeTab === 'active' ? '진행 중인 분쟁이 없어요' : '해결된 분쟁이 없어요'}
            description={
              activeTab === 'active'
                ? '주문 상세에서 문제가 생기면 분쟁 신청을 해주세요'
                : '처리된 분쟁이 생기면 여기에 표시돼요'
            }
          />
        ) : (
          disputes.map((dispute) => {
            const statusConfig = USER_DISPUTE_STATUS_LABELS[dispute.status] ?? USER_DISPUTE_STATUS_LABELS.filed;
            const isActive = ACTIVE_DISPUTE_STATUSES.has(dispute.status);
            return (
              <Link
                key={dispute.id}
                href={`/my/disputes/${dispute.id}`}
                className="block rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 hover:border-gray-200 dark:hover:border-gray-600 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold shrink-0 ${statusConfig.color}`}>
                        {statusConfig.text}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                        {DISPUTE_TYPE_LABELS[dispute.type] ?? dispute.type}
                      </span>
                    </div>
                    <p className="text-base font-semibold text-gray-900 dark:text-white truncate">
                      {/* reason serves as the short description until listing title is in the shape */}
                      {dispute.reason || dispute.description}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                      <Clock size={11} aria-hidden="true" />
                      <span>신청일 {new Date(dispute.createdAt).toLocaleDateString('ko-KR')}</span>
                      {dispute.resolvedAt && (
                        <span>· 해결일 {new Date(dispute.resolvedAt).toLocaleDateString('ko-KR')}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isActive && (
                      <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" aria-hidden="true" />
                    )}
                    <ChevronRight size={16} className="text-gray-400" aria-hidden="true" />
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
