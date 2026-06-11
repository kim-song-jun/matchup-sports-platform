'use client';

import { useState } from 'react';
import { Star, Inbox } from 'lucide-react';
import { useV1Reviews, useV1ReceivedReviews } from '@/hooks/use-v1-api';
import {
  AdminShell,
  AdminPageHeader,
  AdminKpiCard,
  AdminBadge,
  AdminRow,
  AdminEmpty,
  AdminListSkeleton,
} from '@/components/admin';

function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  } catch {
    return dateStr;
  }
}

type Tab = 'pending' | 'received';

export default function AdminReviewsPage() {
  const [tab, setTab] = useState<Tab>('pending');

  const reviewsQ = useV1Reviews({ limit: 30 });
  const receivedQ = useV1ReceivedReviews({ limit: 20 });

  const items = reviewsQ.data?.items ?? [];
  const received = receivedQ.data?.items ?? [];
  const pending = items.filter((r) => r.state === 'ready');
  const done = items.filter((r) => r.state === 'done');

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'pending', label: '작성할 리뷰', count: pending.length },
    { key: 'received', label: '받은 리뷰', count: received.length },
  ];

  return (
    <AdminShell>
      <AdminPageHeader
        eyebrow="리뷰 관리"
        title="리뷰"
        description="매치 후 리뷰를 작성하고 받은 리뷰를 확인하세요."
      />

      {/* KPI */}
      <div className="grid grid-cols-3 md:grid-cols-3 gap-3 mb-5">
        <AdminKpiCard
          label="미작성"
          value={pending.length}
          tone={pending.length > 0 ? 'warning' : 'neutral'}
          icon={<Star size={16} />}
        />
        <AdminKpiCard label="작성 완료" value={done.length} tone="positive" />
        <AdminKpiCard label="받은 리뷰" value={received.length} />
      </div>

      {/* Tab toggle */}
      <div className="flex gap-2 mb-4">
        {tabs.map(({ key, label, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={`flex items-center gap-1.5 px-4 min-h-[44px] md:min-h-[36px] rounded-xl text-[14px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 ${
              tab === key
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
            {count != null && count > 0 && (
              <span
                className={`text-[11px] font-bold rounded-full px-1.5 py-0.5 ${
                  tab === key ? 'bg-blue-400 text-white' : 'bg-white text-gray-500'
                }`}
              >
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Pending reviews tab */}
      {tab === 'pending' && (
        <>
          <div className="bg-white rounded-2xl border border-gray-100">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50">
              <Star size={16} className="text-amber-400" aria-hidden="true" />
              <span className="text-[15px] font-bold text-gray-900">작성할 리뷰</span>
              {pending.length > 0 && (
                <span className="bg-amber-50 text-amber-600 text-[11px] font-bold rounded-full px-2 py-0.5 ml-auto">
                  {pending.length}건 대기
                </span>
              )}
            </div>
            {reviewsQ.isPending ? (
              <AdminListSkeleton rows={3} />
            ) : reviewsQ.isError ? (
              <div className="px-5 py-8 text-center">
                <p className="text-[14px] text-gray-500 mb-2">
                  {getErrorMessage(reviewsQ.error, '리뷰 목록을 불러오지 못했어요.')}
                </p>
                <button
                  type="button"
                  onClick={() => void reviewsQ.refetch()}
                  className="text-[14px] text-blue-500 font-medium focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
                >
                  다시 시도
                </button>
              </div>
            ) : pending.length === 0 ? (
              <AdminEmpty
                icon={<Star size={36} />}
                title="작성할 리뷰가 없어요"
                description="매치에 참여하면 리뷰를 작성할 수 있어요."
              />
            ) : (
              pending.map((r) => (
                <AdminRow
                  key={r.sourceId}
                  title={r.title}
                  meta={`${r.remainingCount}명 대상 · ${formatDate(r.completedAt)}`}
                  badge={<AdminBadge status="ready" label="작성 대기" />}
                  href={`/reviews/${r.sourceType}/${r.sourceId}`}
                />
              ))
            )}
          </div>

          {done.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 mt-4">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
                <span className="text-[15px] font-bold text-gray-900">작성 완료</span>
                <span className="text-[13px] text-gray-400">{done.length}개</span>
              </div>
              {done.map((r) => (
                <AdminRow
                  key={r.sourceId}
                  title={r.title}
                  meta={`${r.reviewedCount}/${r.targetCount}명 작성 · ${formatDate(r.completedAt)}`}
                  badge={<AdminBadge status="completed" label="완료" />}
                  href={`/reviews/${r.sourceType}/${r.sourceId}`}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Received reviews tab */}
      {tab === 'received' && (
        <div className="bg-white rounded-2xl border border-gray-100">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <div className="flex items-center gap-2">
              <Star size={16} className="text-yellow-400" />
              <span className="text-[15px] font-bold text-gray-900">받은 리뷰</span>
            </div>
            <span className="text-[13px] text-gray-400">{received.length}개</span>
          </div>
          {receivedQ.isPending ? (
            <AdminListSkeleton rows={3} />
          ) : received.length === 0 ? (
            <AdminEmpty
              icon={<Inbox size={36} />}
              title="받은 리뷰가 없어요"
              description="매치에 참여하면 다른 플레이어로부터 리뷰를 받을 수 있어요."
            />
          ) : (
            received.map((r) => (
              <AdminRow
                key={r.reviewId}
                title={`${r.reviewerUser.name}님의 리뷰`}
                meta={`평점 ${r.rating}점 · ${formatDate(r.submittedAt)}`}
                badge={<AdminBadge status="completed" label={`★ ${r.rating}`} />}
              />
            ))
          )}
        </div>
      )}
    </AdminShell>
  );
}
