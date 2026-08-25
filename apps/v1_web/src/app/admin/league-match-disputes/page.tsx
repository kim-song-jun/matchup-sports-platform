'use client';

import { useState } from 'react';
import {
  AdminPageHeader,
  AdminFilterBar,
  AdminDataTable,
  AdminStatusPill,
  AdminEmpty,
  useAdminToast,
  AdminToasts,
} from '@/components/admin';
import { LeagueDisputeResolveModal } from '@/components/admin/league-dispute-resolve-modal';
import { LeagueDisputeRejectModal } from '@/components/admin/league-dispute-reject-modal';
import { useV1AdminLeagueDisputes, useV1ResolveLeagueDispute, useV1RejectLeagueDispute } from '@/hooks/use-v1-api';
import type { V1AdminLeagueMatchDisputeRow, V1LeagueMatchDisputeStatus } from '@/types/league-match';
import { extractErrorMessage } from '@/lib/error-message';

// D2 (E4, B안 확정): 어드민 이의 목록·처리 독립 페이지. 대진 표(league-match-fixtures-client)
// 안에 끼워 넣지 않고 별도 라우트로 둔 이유는 사용자 확정 사항 — 이의는 리그 하나에 갇히지
// 않고 운영자가 "지금 처리 대기 중인 게 몇 건인지"를 리그 전체에서 한눈에 봐야 한다.

function formatDateTime(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

const STATUS_OPTIONS: { value: V1LeagueMatchDisputeStatus; label: string }[] = [
  { value: 'open', label: '처리 대기' },
  { value: 'accepted', label: '수락됨' },
  { value: 'rejected', label: '거부됨' },
];

export default function AdminLeagueMatchDisputesPage() {
  const [activeStatus, setActiveStatus] = useState<V1LeagueMatchDisputeStatus>('open');
  const { data, isPending, isFetching, isError, error, refetch } = useV1AdminLeagueDisputes(activeStatus);
  const rows = data?.items ?? [];

  const [resolveRow, setResolveRow] = useState<V1AdminLeagueMatchDisputeRow | null>(null);
  const [rejectRow, setRejectRow] = useState<V1AdminLeagueMatchDisputeRow | null>(null);

  const resolveMutation = useV1ResolveLeagueDispute();
  const rejectMutation = useV1RejectLeagueDispute();
  const { toasts, showToast } = useAdminToast();

  const handleResolveSubmit = (
    resolution: 'correction' | 'void',
    note: string,
    homeScore?: number,
    awayScore?: number,
  ) => {
    if (!resolveRow) return;
    resolveMutation.mutate(
      { disputeId: resolveRow.id, body: { resolution, note, homeScore, awayScore } },
      {
        onSuccess: () => {
          setResolveRow(null);
          showToast(
            resolution === 'correction' ? '결과를 정정하고 이의를 수락했어요.' : '결과를 무효 처리하고 이의를 수락했어요.',
            'success',
          );
        },
        onError: (err) => {
          showToast(extractErrorMessage(err, '처리 중 오류가 발생했어요.'), 'error');
        },
      },
    );
  };

  const handleRejectSubmit = (note: string) => {
    if (!rejectRow) return;
    rejectMutation.mutate(
      { disputeId: rejectRow.id, body: { note } },
      {
        onSuccess: () => {
          setRejectRow(null);
          showToast('이의를 거부했어요.', 'success');
        },
        onError: (err) => {
          showToast(extractErrorMessage(err, '처리 중 오류가 발생했어요.'), 'error');
        },
      },
    );
  };

  const isInitialLoad = isPending && rows.length === 0;

  // 탭 카운트는 서버가 필터와 무관한 전체 분포로 내려준다 — 로딩 중에는 undefined 그대로
  // 두어 AdminFilterBar 의 "—" 플레이스홀더가 뜨게 한다.
  const statusOptions = STATUS_OPTIONS.map((option) => ({
    ...option,
    count: data?.counts?.[option.value],
  }));

  return (
    <>
      <AdminPageHeader
        eyebrow="플랫폼"
        title="결과 이의"
        description="확정된 리그 경기 결과에 팀이 제기한 이의를 검토하고 정정·무효·거부를 처리해요."
      />

      <div className="mb-4">
        <AdminFilterBar
          hideSearch
          searchValue=""
          onSearchChange={() => {}}
          statusOptions={statusOptions}
          activeStatus={activeStatus}
          onStatusChange={(value) => setActiveStatus(value as V1LeagueMatchDisputeStatus)}
        />
      </div>

      <AdminDataTable<V1AdminLeagueMatchDisputeRow>
        rows={rows}
        keyExtractor={(row) => row.id}
        tableMaxWidth="max-w-none"
        columns={[
          {
            key: 'matchup',
            header: '리그 / 대진',
            render: (row) => (
              <div className="min-w-0">
                <div className="truncate font-medium text-[var(--text-strong)]">
                  {row.homeTeamName} vs {row.awayTeamName}
                </div>
                <div className="truncate text-[length:var(--font-size-micro)] text-[var(--text-muted)]">
                  {row.leagueTitle}
                </div>
              </div>
            ),
          },
          {
            key: 'reason',
            header: '사유',
            render: (row) => (
              <span className="line-clamp-2 max-w-[280px] text-[var(--text-body)]" title={row.reason}>
                {row.reason}
              </span>
            ),
          },
          {
            key: 'raisedByTeamName',
            header: '제기 팀',
            width: 'w-[128px]',
            render: (row) => <span className="text-[var(--text-body)]">{row.raisedByTeamName}</span>,
          },
          {
            key: 'createdAt',
            header: '제기 시각',
            width: 'w-[148px]',
            render: (row) => (
              <span className="whitespace-nowrap text-[var(--text-muted)]">{formatDateTime(row.createdAt)}</span>
            ),
          },
          {
            key: 'status',
            header: '상태',
            width: 'w-[104px]',
            render: (row) => <AdminStatusPill status={`dispute_${row.status}`} />,
          },
        ]}
        renderActions={(row) =>
          row.status === 'open' ? (
            <>
              <button
                type="button"
                onClick={() => setResolveRow(row)}
                className="inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-lg bg-blue-500 px-3 text-[length:var(--font-size-label)] font-semibold text-white transition-colors hover:bg-blue-600 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
              >
                처리
              </button>
              <button
                type="button"
                onClick={() => setRejectRow(row)}
                className="inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-lg bg-[var(--surface-soft)] px-3 text-[length:var(--font-size-label)] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--border)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
              >
                거부
              </button>
            </>
          ) : null
        }
        loading={isInitialLoad}
        empty={
          <AdminEmpty
            title={activeStatus === 'open' ? '처리 대기 중인 이의가 없어요' : '해당 상태의 이의가 없어요'}
            description="다른 상태 필터를 선택해 보세요."
          />
        }
        error={isError && rows.length === 0 ? extractErrorMessage(error, '이의 목록을 불러오지 못했어요.') : undefined}
        onRetry={() => void refetch()}
        skeletonRows={6}
      />

      {isError && rows.length > 0 && (
        <div className="mt-4 flex flex-col items-center gap-1.5">
          <p className="text-[length:var(--font-size-label)] text-red-500" role="alert">
            {extractErrorMessage(error, '목록을 불러오지 못했어요.')}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="inline-flex items-center h-[44px] px-6 rounded-xl text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-body)] bg-[var(--card-surface)] border border-[var(--border)] hover:border-[var(--border-strong)] transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            {isFetching ? '불러오는 중…' : '다시 시도'}
          </button>
        </div>
      )}

      <LeagueDisputeResolveModal
        open={resolveRow !== null}
        leagueTitle={resolveRow?.leagueTitle ?? ''}
        homeTeamName={resolveRow?.homeTeamName ?? ''}
        awayTeamName={resolveRow?.awayTeamName ?? ''}
        reason={resolveRow?.reason ?? ''}
        currentHomeScore={resolveRow?.currentHomeScore ?? null}
        currentAwayScore={resolveRow?.currentAwayScore ?? null}
        onSubmit={handleResolveSubmit}
        onClose={() => setResolveRow(null)}
        pending={resolveMutation.isPending}
      />

      <LeagueDisputeRejectModal
        open={rejectRow !== null}
        leagueTitle={rejectRow?.leagueTitle ?? ''}
        homeTeamName={rejectRow?.homeTeamName ?? ''}
        awayTeamName={rejectRow?.awayTeamName ?? ''}
        reason={rejectRow?.reason ?? ''}
        onSubmit={handleRejectSubmit}
        onClose={() => setRejectRow(null)}
        pending={rejectMutation.isPending}
      />

      <AdminToasts toasts={toasts} />
    </>
  );
}
