'use client';

import Link from 'next/link';
import { useV1Reviews } from '@/hooks/use-v1-api';
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

export default function AdminReviewsPage() {
  const { data, isPending, isError, error, refetch } = useV1Reviews({ limit: 30 });
  const items = data?.items ?? [];

  const pending = items.filter(r => r.state === 'ready');
  const done = items.filter(r => r.state === 'done');

  return (
    <AdminShell activeTab="reviews">
      <AdminPageHeader
        eyebrow="리뷰 관리"
        title="리뷰"
        description="매치 후 작성할 리뷰를 관리하세요."
      />

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <AdminKpiCard
          label="미작성"
          value={pending.length}
          tone={pending.length > 0 ? 'warning' : 'neutral'}
        />
        <AdminKpiCard label="작성 완료" value={done.length} tone="positive" />
      </div>

      {/* Pending reviews */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
          <span className="text-[16px] font-bold text-gray-900">작성할 리뷰</span>
          {pending.length > 0 && (
            <span className="bg-amber-50 text-amber-600 text-[11px] font-bold rounded-full px-2 py-0.5">
              {pending.length}건 대기
            </span>
          )}
        </div>
        {isPending ? (
          <AdminListSkeleton rows={3} />
        ) : isError ? (
          <div className="px-5 py-8 text-center">
            <p className="text-[14px] text-gray-500 mb-3">
              {getErrorMessage(error, '리뷰 목록을 불러오지 못했어요.')}
            </p>
            <button
              onClick={() => refetch()}
              className="text-[14px] text-blue-500 font-medium hover:underline"
            >
              다시 시도
            </button>
          </div>
        ) : pending.length === 0 ? (
          <AdminEmpty
            icon="⭐"
            title="작성할 리뷰가 없어요"
            description="매치에 참여하면 리뷰를 작성할 수 있어요."
          />
        ) : (
          pending.map(review => (
            <AdminRow
              key={review.sourceId}
              title={review.title}
              meta={`${review.targetCount}명 대상 · ${review.remainingCount}명 미작성`}
              badge={<AdminBadge status="ready" label="작성 대기" />}
              href={`/reviews/${review.sourceType}/${review.sourceId}`}
            />
          ))
        )}
      </div>

      {/* Completed reviews */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
          <span className="text-[16px] font-bold text-gray-900">작성 완료</span>
          <span className="text-[13px] text-gray-400">{done.length}개</span>
        </div>
        {isPending ? (
          <AdminListSkeleton />
        ) : done.length === 0 && !isError ? (
          <div className="px-5 py-8 text-center text-[14px] text-gray-400">
            완료된 리뷰가 없어요.
          </div>
        ) : (
          done.map(review => (
            <AdminRow
              key={review.sourceId}
              title={review.title}
              meta={`${review.reviewedCount}/${review.targetCount}명 작성`}
              badge={<AdminBadge status="completed" label="완료" />}
              href={`/reviews/${review.sourceType}/${review.sourceId}`}
            />
          ))
        )}
      </div>

      {/* Link to full reviews page */}
      <div className="mt-4 text-center">
        <Link href="/reviews" className="text-[14px] text-blue-500 font-medium hover:underline">
          리뷰 전체 보기
        </Link>
      </div>
    </AdminShell>
  );
}
