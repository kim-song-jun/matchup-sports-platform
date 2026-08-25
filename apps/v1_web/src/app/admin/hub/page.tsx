'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { useV1AdminHubInbox } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { AdminPageHeader, AdminKpiCard, AdminKpiGridSkeleton } from '@/components/admin';
import type { V1AdminHubTournamentCount } from '@/types/api';

/**
 * 할 일 인박스 (M3) — 운영자 액션을 기다리는 항목을 한 화면에 모은다.
 * 단일 허브 구성(사용자 결정): 미승인 대회 신청 · 결과 검토 대기(신규 집계) +
 * 미답변 문의 · 진행중 대회(기존 집계 재사용).
 */

function TournamentBreakdownCard({
  title,
  rows,
  hrefFor,
  linkLabel,
}: {
  title: string;
  rows: V1AdminHubTournamentCount[];
  hrefFor: (tournamentId: string) => string;
  linkLabel: string;
}) {
  if (rows.length === 0) return null;
  return (
    <section
      aria-label={title}
      className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)]"
    >
      <h2 className="px-5 py-4 border-b border-[var(--border)] text-[length:var(--font-size-body)] font-bold text-[var(--text-strong)]">
        {title}
      </h2>
      <ul>
        {rows.map((row) => (
          <li
            key={row.tournamentId}
            className="flex items-center gap-3 px-5 py-3 border-b border-[var(--border)] last:border-b-0"
          >
            <span className="flex-1 min-w-0 truncate text-[13.5px] text-[var(--text-strong)]">
              {row.title || '(제목 없음)'}
            </span>
            <span className="shrink-0 rounded-full bg-[var(--tint-red)] px-2 py-0.5 text-[length:var(--font-size-caption)] font-bold tabular-nums text-[var(--red700)]">
              {row.count}건
            </span>
            <Link
              href={hrefFor(row.tournamentId)}
              aria-label={`${row.title || '(제목 없음)'} ${linkLabel}`}
              className="shrink-0 inline-flex items-center gap-0.5 min-h-[44px] px-2 text-[length:var(--font-size-label)] font-medium text-blue-500 hover:text-[var(--blue700)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
            >
              {linkLabel}
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function AdminHubPage() {
  const { data, isPending, isError, error, refetch } = useV1AdminHubInbox();

  const totalTodo =
    (data?.pendingRegistrations.total ?? 0) +
    (data?.resultReviewPending.total ?? 0) +
    (data?.pendingInquiries ?? 0);

  return (
    <>
      <AdminPageHeader
        eyebrow="할 일"
        title="할 일"
        description="운영자 처리가 필요한 항목을 한곳에서 확인해요."
      />

      {isPending ? (
        <AdminKpiGridSkeleton count={4} />
      ) : isError ? (
        <div className="p-4 bg-[var(--red50)] border border-[var(--tint-red-border)] rounded-xl flex items-center gap-3">
          <p className="text-sm text-[var(--red700)] flex-1">
            {extractErrorMessage(error, '할 일 목록을 불러오지 못했어요.')}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="text-sm text-[var(--red700)] font-semibold underline underline-offset-2 min-h-[44px] px-2 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
          >
            다시 시도
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* 요약 KPI — 0이면 중립, 남아 있으면 warning 톤으로 격상 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <AdminKpiCard
              label="미승인 대회 신청"
              value={data.pendingRegistrations.total}
              tone={data.pendingRegistrations.total > 0 ? 'warning' : 'neutral'}
              href="/admin/tournaments"
              ariaLabel={`미승인 대회 신청: ${data.pendingRegistrations.total}건`}
            />
            <AdminKpiCard
              label="결과 검토 대기"
              value={data.resultReviewPending.total}
              tone={data.resultReviewPending.total > 0 ? 'warning' : 'neutral'}
              href="/admin/ops/tournaments"
              ariaLabel={`결과 검토 대기: ${data.resultReviewPending.total}건`}
            />
            <AdminKpiCard
              label="미답변 문의"
              value={data.pendingInquiries}
              tone={data.pendingInquiries > 0 ? 'warning' : 'neutral'}
              href="/admin/inquiries"
              ariaLabel={`미답변 문의: ${data.pendingInquiries}건`}
            />
            <AdminKpiCard
              label="진행중 대회"
              value={data.tournamentsInProgress}
              tone="neutral"
              href="/admin/tournaments?status=in_progress"
              ariaLabel={`진행중 대회: ${data.tournamentsInProgress}개`}
            />
          </div>

          {totalTodo === 0 && (
            <div className="flex items-center gap-2.5 p-4 bg-[var(--green50)] border border-green-100 rounded-xl">
              <CheckCircle2 size={18} className="text-green-500 shrink-0" aria-hidden="true" />
              <p className="text-[length:var(--font-size-body-sm)] text-[var(--text-strong)]">
                지금은 처리할 일이 없어요.
              </p>
            </div>
          )}

          <TournamentBreakdownCard
            title="대회별 미승인 신청"
            rows={data.pendingRegistrations.tournaments}
            hrefFor={(id) => `/admin/tournaments/${id}/registrations`}
            linkLabel="신청 관리"
          />
          <TournamentBreakdownCard
            title="대회별 결과 검토 대기"
            rows={data.resultReviewPending.tournaments}
            hrefFor={(id) => `/admin/live/${id}/result-review`}
            linkLabel="검토하기"
          />
        </div>
      )}
    </>
  );
}
