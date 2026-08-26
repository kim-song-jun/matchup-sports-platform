'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useV1AdminHubInbox, useV1AdminOpsSummary, useV1AdminOverview } from '@/hooks/use-v1-api';
import {
  AdminKpiCard,
  AdminKpiGridSkeleton,
  AdminPageHeader,
  AdminStatusPill,
} from '@/components/admin';
import { adminActionLabel, adminTargetTypeLabel } from '@/lib/admin-labels';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1AdminHubTournamentCount } from '@/types/api';

// ── Date helpers ──────────────────────────────────────────────────────────
function formatRelativeTime(dateStr: string): string {
  try {
    const ts = new Date(dateStr).getTime();
    if (Number.isNaN(ts)) return dateStr; // unparseable → show raw, not "NaN일 전"
    const diff = Date.now() - ts;
    if (diff < 0) return '방금 전'; // future (clock skew) → clamp, not "-5분 전"
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return '방금 전';
    if (minutes < 60) return `${minutes}분 전`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours / 24);
    return `${days}일 전`;
  } catch {
    return dateStr;
  }
}


// ── Warning card ──────────────────────────────────────────────────────────
interface WarningCardProps {
  label: string;
  value: number;
  tone: 'warning' | 'danger';
  href: string;
  /** 집계 구간처럼 값만으론 알 수 없는 단서(예: "최근 5분"). aria-label 에도 함께 실린다. */
  sub?: string;
}

function WarningCard({ label, value, tone, href, sub }: WarningCardProps) {
  return (
    <AdminKpiCard
      label={label}
      value={value}
      sub={sub}
      tone={value > 0 ? tone : 'neutral'}
      href={href}
      ariaLabel={sub ? `${label}(${sub}): ${value}건` : `${label}: ${value}건`}
    />
  );
}

// ── 할 일 breakdown card (구 /admin/hub 에서 이식) ─────────────────────────
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
      <h3 className="px-5 py-4 border-b border-[var(--border)] text-[length:var(--font-size-body)] font-bold text-[var(--text-strong)]">
        {title}
      </h3>
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

/**
 * 할 일 섹션 (구 /admin/hub 본문 이식 — B안 단일 대시보드, 2026-08-25 사용자 확정).
 * 처리 대기 신호는 숨기면 가치가 사라지므로 대시보드 최상단에 둔다. 조회 실패는
 * 조용히 숨기지 않고 명시적으로 알린다('실패 시 무신호 금지' 계약 — 주의 필요와 동일).
 */
function InboxSection() {
  const { data, isPending, isError, error, refetch } = useV1AdminHubInbox();

  const totalTodo =
    (data?.pendingRegistrations.total ?? 0) +
    (data?.resultReviewPending.total ?? 0) +
    (data?.pendingInquiries ?? 0);

  return (
    <section aria-label="할 일" className="mb-6">
      <h2 className="text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-body)] mb-3">할 일</h2>
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
        <div className="flex flex-col gap-4">
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
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function AdminOverviewPage() {
  const { data: overview, isPending, isError, refetch } = useV1AdminOverview();
  const {
    data: opsSummary,
    isPending: opsPending,
    isError: opsError,
    refetch: opsRefetch,
  } = useV1AdminOpsSummary();

  // Warning items require attention
  const warningSuspendedBlocked =
    (overview?.users.suspended ?? 0) + (overview?.users.blocked ?? 0);
  const warningWithdrawalPending = overview?.users.withdrawalPending ?? 0;
  const warningCancelledMatches = overview?.matches.cancelled ?? 0;
  // 운영 실패 KPI는 별도 쿼리라 아직 안 왔거나 실패했을 수 있다. 그때 0으로 접어 넣으면
  // "조치 필요 없음"(초록 상태)을 근거 없이 주장하게 되므로, 값이 확정된 경우에만
  // 카드를 띄우고 합계에도 반영한다 — 미확정일 땐 기존 4개 경고만 그대로 보여준다.
  const opsCountsReady = !opsPending && !opsError;
  const warningPushFailures = opsSummary?.pushFailures5m ?? 0;
  const warningSmsFailures = opsSummary?.smsFailures5m ?? 0;
  const totalWarnings =
    warningSuspendedBlocked +
    warningWithdrawalPending +
    warningCancelledMatches +
    (opsCountsReady ? warningPushFailures + warningSmsFailures : 0);

  return (
    <>
      <AdminPageHeader
        title="대시보드"
        description="처리할 일과 플랫폼 현황을 한 화면에서 확인해요."
      />

      {/* ── 할 일 (최상단 — 처리 대기 신호가 항상 첫눈에) ─────────────── */}
      <InboxSection />

      {/* ── Warning section ───────────────────────────────────────────── */}
      {!isPending && !isError && (
        <section aria-label="주의 필요 항목" className="mb-6">
          <h2 className="text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-body)] mb-3">주의 필요</h2>
          {/* 운영 실패 지표(웹 푸시·SMS) 로딩 실패는 카드를 조용히 숨기는 대신 명시적으로
              알린다 — 숨기면 "조치 필요 없음"(초록)이 실패를 가리는 무신호 상태가 된다.
              이 '실패 시 무신호 금지' 계약은 이후 대시보드 개편(M6 WS 전환)에서도 유지해야 한다. */}
          {opsError && (
            <div
              role="alert"
              className="mb-3 flex flex-wrap items-center gap-2.5 p-4 bg-[var(--red50)] border border-[var(--tint-red-border)] rounded-xl"
            >
              <AlertTriangle size={18} className="text-[var(--red700)] shrink-0" aria-hidden="true" />
              <p className="flex-1 min-w-[200px] text-[length:var(--font-size-body-sm)] text-[var(--red700)]">
                운영 실패 지표(웹 푸시 · SMS)를 불러오지 못했어요. 아래 상태에는 반영되지 않았어요.
              </p>
              <button
                type="button"
                onClick={() => void opsRefetch()}
                className="text-sm text-[var(--red700)] font-semibold underline underline-offset-2 min-h-[44px] px-2 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
              >
                다시 시도
              </button>
            </div>
          )}
          {totalWarnings === 0 ? (
            <div className="flex items-center gap-2.5 p-4 bg-[var(--green50)] border border-green-100 rounded-xl">
              <CheckCircle2 size={18} className="text-green-500 shrink-0" aria-hidden="true" />
              {/* text-green-700은 dark: 변형이 없는 고정값이라 --green50(dark) 배경 위에서 2.70~3.07:1로 AA 미달.
                  admin-status-pill.tsx와 동일하게 --green700 토큰 부재 시 중립 강조 토큰(--text-strong)으로 대체. */}
              <p className="text-[length:var(--font-size-body-sm)] text-[var(--text-strong)]">지금은 조치가 필요한 항목이 없어요.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Split 정지/차단 into separate cards so each value matches its
                  status filter link (a combined card linked only to ?status=suspended
                  would undercount blocked users). */}
              <WarningCard
                label="정지 회원"
                value={overview?.users.suspended ?? 0}
                tone="danger"
                href="/admin/users?status=suspended"
              />
              <WarningCard
                label="차단 회원"
                value={overview?.users.blocked ?? 0}
                tone="danger"
                href="/admin/users?status=blocked"
              />
              <WarningCard
                label="탈퇴 대기"
                value={warningWithdrawalPending}
                tone="warning"
                href="/admin/users?status=withdrawal_pending"
              />
              <WarningCard
                label="취소 매치"
                value={warningCancelledMatches}
                tone="warning"
                href="/admin/matches?status=cancelled"
              />
              {opsCountsReady && (
                <>
                  <WarningCard
                    label="웹 푸시 실패"
                    value={warningPushFailures}
                    tone="warning"
                    href="/admin/monitoring?tab=push"
                    sub="최근 5분"
                  />
                  <WarningCard
                    label="SMS · 인증 실패"
                    value={warningSmsFailures}
                    tone="warning"
                    href="/admin/monitoring?tab=sms"
                    sub="최근 5분"
                  />
                </>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── Primary KPIs (현황) ──────────────────────────────────────── */}
      {!isPending && !isError && (
        <h2 className="text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-body)] mb-3">현황</h2>
      )}
      {isPending ? (
        <AdminKpiGridSkeleton count={4} />
      ) : isError ? (
        <div className="mb-6 p-4 bg-[var(--red50)] border border-[var(--tint-red-border)] rounded-xl flex items-center gap-3">
          <p className="text-sm text-[var(--red700)] flex-1">현황 데이터를 불러오지 못했어요.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-sm text-[var(--red700)] font-semibold underline underline-offset-2 min-h-[44px] px-2 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
          >
            다시 시도
          </button>
        </div>
      ) : (
        /* lg:grid-cols-4: 어드민 사이드바가 1024+에서만 나타나므로 4열은 lg부터 (fix #16) */
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <AdminKpiCard
            label="활성 회원"
            value={overview?.users.active ?? 0}
            tone="neutral"
            href="/admin/users?status=active"
            ariaLabel={`활성 회원: ${overview?.users.active ?? 0}명`}
          />
          <AdminKpiCard
            label="활성 매치"
            value={overview?.matches.recruiting ?? 0}
            tone="neutral"
            href="/admin/matches?status=recruiting"
            ariaLabel={`활성 매치: ${overview?.matches.recruiting ?? 0}건`}
          />
          <AdminKpiCard
            label="활성 팀"
            value={overview?.teams.active ?? 0}
            tone="neutral"
            href="/admin/teams?status=active"
            ariaLabel={`활성 팀: ${overview?.teams.active ?? 0}개`}
          />
          <AdminKpiCard
            label="모집 중 팀매치"
            value={overview?.teamMatches.recruiting ?? 0}
            tone="neutral"
            href="/admin/team-matches?status=recruiting"
            ariaLabel={`모집 중 팀매치: ${overview?.teamMatches.recruiting ?? 0}건`}
          />
        </div>
      )}

      {/* ── Recent actions panel ──────────────────────────────────────── */}
      {!isPending && !isError && (
        <section aria-label="최근 운영 활동" className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
            <h2 className="text-[length:var(--font-size-body)] font-bold text-[var(--text-strong)]">최근 운영 활동</h2>
            <Link
              href="/admin/monitoring?tab=audit"
              className="flex items-center gap-0.5 text-[length:var(--font-size-label)] text-blue-500 font-medium hover:text-[var(--blue700)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded min-h-[44px] px-1"
            >
              전체 보기
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>

          {!overview?.recentActions?.length ? (
            <div className="py-10 text-center">
              <p className="text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">최근 운영 활동이 없어요.</p>
            </div>
          ) : (
            <ul role="list">
              {overview.recentActions.map((action) => (
                <li
                  key={action.actionLogId}
                  className="flex items-center gap-3 px-5 py-3.5 border-b border-[var(--border)] last:border-0"
                >
                  {/* Status pill for targetType */}
                  <AdminStatusPill status={action.targetType} label={adminTargetTypeLabel(action.targetType)} />

                  {/* Action description */}
                  <span className="flex-1 text-[length:var(--font-size-label)] text-[var(--text-body)] truncate">
                    {adminActionLabel(action.actionType)}
                  </span>

                  {/* Relative time */}
                  <time
                    dateTime={action.createdAt}
                    className="text-[length:var(--font-size-caption)] text-[var(--text-muted)] shrink-0 tabular-nums"
                  >
                    {formatRelativeTime(action.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
