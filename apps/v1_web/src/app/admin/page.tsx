'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { useV1AdminOverview } from '@/hooks/use-v1-api';
import {
  AdminKpiCard,
  AdminKpiGridSkeleton,
  AdminPageHeader,
  AdminStatusPill,
} from '@/components/admin';
import { adminActionLabel } from '@/lib/admin-labels';

// ── Date helpers ──────────────────────────────────────────────────────────
function formatRelativeTime(dateStr: string): string {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
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

function targetTypeLabel(targetType: string): string {
  const map: Record<string, string> = {
    user: '회원',
    match: '매치',
    team: '팀',
    team_match: '팀매치',
  };
  return map[targetType] ?? targetType;
}

// ── Warning card ──────────────────────────────────────────────────────────
interface WarningCardProps {
  label: string;
  value: number;
  tone: 'warning' | 'danger';
  href: string;
}

function WarningCard({ label, value, tone, href }: WarningCardProps) {
  return (
    <AdminKpiCard
      label={label}
      value={value}
      tone={value > 0 ? tone : 'neutral'}
      href={href}
      ariaLabel={`${label}: ${value}건`}
    />
  );
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function AdminOverviewPage() {
  const { data: overview, isPending, isError, refetch } = useV1AdminOverview();

  // Warning items require attention
  const warningSuspendedBlocked =
    (overview?.users.suspended ?? 0) + (overview?.users.blocked ?? 0);
  const warningWithdrawalPending = overview?.users.withdrawalPending ?? 0;
  const warningCancelledMatches = overview?.matches.cancelled ?? 0;
  const totalWarnings = warningSuspendedBlocked + warningWithdrawalPending + warningCancelledMatches;

  return (
    <>
      <AdminPageHeader
        eyebrow="운영 대시보드"
        title="운영 개요"
        description="플랫폼 현황을 한눈에 확인해요."
      />

      {/* ── Primary KPIs ─────────────────────────────────────────────── */}
      {isPending ? (
        <AdminKpiGridSkeleton count={4} />
      ) : isError ? (
        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3">
          <p className="text-sm text-red-600 flex-1">현황 데이터를 불러오지 못했어요.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-sm text-red-600 font-semibold underline underline-offset-2 min-h-[44px] px-2 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
          >
            다시 시도
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
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
            label="모집중 팀매치"
            value={overview?.teamMatches.recruiting ?? 0}
            tone="neutral"
            href="/admin/team-matches?status=recruiting"
            ariaLabel={`모집중 팀매치: ${overview?.teamMatches.recruiting ?? 0}건`}
          />
        </div>
      )}

      {/* ── Warning section ───────────────────────────────────────────── */}
      {!isPending && !isError && (
        <section aria-label="주의 필요 항목" className="mb-6">
          <h2 className="text-[14px] font-semibold text-gray-700 mb-3">주의 필요</h2>
          {totalWarnings === 0 ? (
            <div className="flex items-center gap-2.5 p-4 bg-green-50 border border-green-100 rounded-xl">
              <CheckCircle2 size={18} className="text-green-500 shrink-0" aria-hidden="true" />
              <p className="text-[14px] text-green-700">지금은 조치가 필요한 항목이 없어요.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <WarningCard
                label="정지·차단 회원"
                value={warningSuspendedBlocked}
                tone="danger"
                href="/admin/users?status=suspended"
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
            </div>
          )}
        </section>
      )}

      {/* ── Recent actions panel ──────────────────────────────────────── */}
      {!isPending && !isError && (
        <section aria-label="최근 운영 활동" className="bg-white rounded-2xl border border-gray-100">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <h2 className="text-[15px] font-bold text-gray-900">최근 운영 활동</h2>
            <Link
              href="/admin/audit"
              className="flex items-center gap-0.5 text-[13px] text-blue-500 font-medium hover:text-blue-600 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded min-h-[44px] px-1"
            >
              전체 보기
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>

          {!overview?.recentActions?.length ? (
            <div className="py-10 text-center">
              <p className="text-[14px] text-gray-400">최근 운영 활동이 없어요.</p>
            </div>
          ) : (
            <ul role="list">
              {overview.recentActions.map((action) => (
                <li
                  key={action.actionLogId}
                  className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-50 last:border-0"
                >
                  {/* Status pill for targetType */}
                  <AdminStatusPill status={action.targetType} label={targetTypeLabel(action.targetType)} />

                  {/* Action description */}
                  <span className="flex-1 text-[13px] text-gray-700 truncate">
                    {adminActionLabel(action.actionType)}
                  </span>

                  {/* Relative time */}
                  <time
                    dateTime={action.createdAt}
                    className="text-[12px] text-gray-400 shrink-0 tabular-nums"
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
