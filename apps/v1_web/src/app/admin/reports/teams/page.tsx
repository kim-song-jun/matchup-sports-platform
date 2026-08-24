'use client';

import Link from 'next/link';
import { AdminDataTable, AdminEmpty, AdminPageHeader, AdminStatusPill } from '@/components/admin';
import type { AdminTableColumn } from '@/components/admin';
import { useV1AdminReportedTeams } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { formatAdminDateTime } from '@/lib/date-utils';
import { inquiryReportReasonLabel } from '@/lib/v1-status-labels';
import type { V1AdminReportedTeamRow } from '@/types/api';

// 목록에서 참조하는 건수만큼 가져온다 — 별도 페이지네이션 없이 한 화면에 다 보여준다
// (서버가 이미 건수 내림차순으로 정렬해 준다, 스펙 §7(b)).
const REPORTED_TEAMS_LIMIT = 50;

/** 색만으로 상태를 구분하지 않는다 — '정지됨'/'활성' 텍스트를 항상 함께 보여준다. */
function teamStatusLabel(status: string | null): string {
  if (status === 'suspended') return '정지됨';
  if (status === 'active') return '활성';
  return '알 수 없음';
}

/** 팀이 삭제됐을 수 있다(널) — 딥링크 자체는 teamId 만 있으면 여전히 유효하므로 링크는 유지한다. */
function teamNameLabel(row: V1AdminReportedTeamRow): string {
  return row.name ?? `삭제된 팀 (${row.teamId.slice(0, 8)})`;
}

export default function AdminReportedTeamsPage() {
  const { data, isPending, isError, error, refetch } = useV1AdminReportedTeams(REPORTED_TEAMS_LIMIT);

  const rows = data?.items ?? [];
  const windowDays = data?.windowDays ?? 30;
  const errorMessage = isError
    ? extractErrorMessage(error, '신고 누적 팀 목록을 불러오지 못했어요.')
    : undefined;

  const columns: AdminTableColumn<V1AdminReportedTeamRow>[] = [
    {
      key: 'team',
      header: '팀',
      render: (row) => (
        <div className="flex flex-col gap-1">
          {/* #657 딥링크 재사용 — 그 팀의 신고만 필터된 문의 목록으로 이동한다. */}
          <Link
            href={`/admin/inquiries?category=report&reportedTeamId=${encodeURIComponent(row.teamId)}`}
            className="font-medium text-[var(--text-strong)] hover:text-[var(--blue700)] hover:underline transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
          >
            {teamNameLabel(row)}
          </Link>
          {row.status ? (
            <AdminStatusPill status={row.status} label={teamStatusLabel(row.status)} />
          ) : (
            <span className="text-2xs text-[var(--text-muted)]">상태 알 수 없음</span>
          )}
        </div>
      ),
    },
    {
      key: 'recentCount',
      header: `최근 ${windowDays}일`,
      align: 'center',
      width: 'w-[104px]',
      render: (row) => <span className="tabular-nums text-[var(--text-body)]">{row.recentCount}</span>,
    },
    {
      key: 'totalCount',
      header: '전체',
      align: 'center',
      width: 'w-[80px]',
      render: (row) => (
        <span className="tabular-nums font-semibold text-[var(--text-strong)]">{row.totalCount}</span>
      ),
    },
    {
      key: 'topReason',
      header: '주요 사유',
      width: 'w-[120px]',
      render: (row) => (
        <span className="text-[var(--text-muted)]">
          {row.topReason ? inquiryReportReasonLabel(row.topReason) : '—'}
        </span>
      ),
    },
    {
      key: 'lastReportedAt',
      header: '마지막 신고',
      width: 'w-[140px]',
      render: (row) => (
        <span className="whitespace-nowrap text-[var(--text-muted)]">
          {row.lastReportedAt ? formatAdminDateTime(row.lastReportedAt) : '—'}
        </span>
      ),
    },
  ];

  return (
    <>
      <AdminPageHeader
        eyebrow="콘텐츠"
        title="신고 누적 팀"
        description={`최근 ${windowDays}일 동안 반복 신고된 팀을 건수 순으로 보여줘요.`}
      />

      <AdminDataTable<V1AdminReportedTeamRow>
        columns={columns}
        rows={rows}
        keyExtractor={(row) => row.teamId}
        loading={isPending && rows.length === 0}
        error={errorMessage}
        onRetry={() => void refetch()}
        empty={
          <AdminEmpty
            title="신고 누적된 팀이 없어요"
            description="같은 팀이 반복 신고되면 여기에 표시돼요."
          />
        }
        tableMaxWidth="max-w-none"
      />
    </>
  );
}
