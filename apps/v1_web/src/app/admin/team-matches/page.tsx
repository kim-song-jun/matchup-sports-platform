'use client';

import { useEffect, useState } from 'react';
import {
  useV1AdminTeamMatches,
  useV1AdminMe,
  useV1ChangeTeamMatchStatus,
} from '@/hooks/use-v1-api';
import type { V1AdminTeamMatchRow } from '@/types/api';
import { extractErrorMessage } from '@/lib/error-message';
import { Activity, Clock, Calendar } from 'lucide-react';
import {
  AdminPageHeader,
  AdminFilterBar,
  AdminDataTable,
  AdminStatusPill,
  AdminReasonModal,
  AdminEmpty,
  STATUS_META,
  useAdminToast,
  AdminToasts,
} from '@/components/admin';

// ── Helpers ───────────────────────────────────────────────────────────────

function formatDateTime(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

// ── Status filter options ─────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: '', label: '전체' },
  { value: 'recruiting', label: '모집 중' },
  { value: 'closed', label: '마감' },
  { value: 'matched', label: '매칭됨' },
  { value: 'cancelled', label: '취소됨' },
  { value: 'completed', label: '완료' },
  { value: 'archived', label: '보관' },
];

const REASON_MODAL_STATUS_OPTIONS = [
  { value: 'recruiting', label: STATUS_META['recruiting']?.label ?? '모집 중' },
  { value: 'closed', label: STATUS_META['closed']?.label ?? '마감' },
  { value: 'matched', label: STATUS_META['matched']?.label ?? '매칭됨' },
  { value: 'cancelled', label: STATUS_META['cancelled']?.label ?? '취소됨' },
  { value: 'completed', label: STATUS_META['completed']?.label ?? '완료' },
  { value: 'archived', label: STATUS_META['archived']?.label ?? '보관' },
];

const PAGE_SIZE = 20;

// ── Page ──────────────────────────────────────────────────────────────────

export default function AdminTeamMatchesPage() {
  // ── Admin capabilities ─────────────────────────────────────────────
  const { data: adminMe } = useV1AdminMe();
  const canWrite = adminMe?.capabilities.includes('status:write') ?? false;

  // ── Filter state (no search — backend has no q for team-matches) ───
  const [activeStatus, setActiveStatus] = useState('');

  // URL searchParam pre-selection on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get('status') ?? '';
    if (s) setActiveStatus(s);
  }, []);

  const handleStatusChange = (value: string) => {
    setActiveStatus(value);
    setPage(1);
  };

  // 커서 누적 대신 페이지 단위 교체다 — 목록 어디쯤인지와 총량이 보여야 한다.
  const [page, setPage] = useState(1);

  const filters = {
    ...(activeStatus ? { status: activeStatus } : {}),
    page,
    limit: PAGE_SIZE,
  };

  const { data, isPending, isFetching, isError, error, refetch } = useV1AdminTeamMatches(filters);
  const rows = data?.items ?? [];
  const pageInfo = data?.pageInfo;
  const statusOptions = STATUS_OPTIONS.map((option) => ({
    ...option,
    count: option.value ? data?.summary.byStatus[option.value] : data?.summary.total,
  }));

  // ── Moderation modal ───────────────────────────────────────────────
  const [modalRow, setModalRow] = useState<V1AdminTeamMatchRow | null>(null);
  const mutation = useV1ChangeTeamMatchStatus();

  // ── Toast ──────────────────────────────────────────────────────────
  const { toasts, showToast } = useAdminToast();

  const handleModalSubmit = (status: string, reason: string) => {
    if (!modalRow) return;
    mutation.mutate(
      { id: modalRow.teamMatchId, status, reason },
      {
        onSuccess: () => {
          setModalRow(null);
          showToast('팀매치 상태를 변경했어요.', 'success');
          // 방금 바꾼 행이 최신 상태로 다시 그려지도록 첫 페이지부터 받아온다.
          setPage(1);
        },
        onError: (err) => {
          showToast(extractErrorMessage(err, '처리 중 오류가 발생했어요.'), 'error');
        },
      },
    );
  };

  // ── Loading / error for initial load ───────────────────────────────
  const isInitialLoad = isPending && rows.length === 0;

  return (
    <>
      <AdminPageHeader
        eyebrow="플랫폼 관리"
        title="팀매치 관리"
        description="플랫폼 내 모든 팀매치의 상태를 필터링하고 관리해요."
      />

      {/* Status chip filter — AdminFilterBar 재사용으로 chip 높이 min-h-[44px] + 페이지 간 리듬 통일.
          백엔드가 q 파라미터를 미지원하므로 hideSearch=true로 검색 입력란만 생략한다. */}
      <div className="mb-4">
        <AdminFilterBar
          hideSearch
          searchValue=""
          onSearchChange={() => undefined}
          statusOptions={statusOptions}
          activeStatus={activeStatus}
          onStatusChange={handleStatusChange}
        />
      </div>

      {/* Card list */}
      <AdminDataTable<V1AdminTeamMatchRow>
        rows={rows}
        keyExtractor={(r) => r.teamMatchId}
        tableMaxWidth="max-w-none"
        rowTone={(row) =>
          row.status === 'cancelled' ? 'danger' : row.status === 'archived' ? 'warning' : undefined
        }
        columns={[
          {
            key: 'startAt',
            header: '시작',
            width: 'w-[132px]',
            render: (row) => (
              <span className="whitespace-nowrap text-[var(--text-muted)]">{formatDateTime(row.startAt)}</span>
            ),
          },
          {
            key: 'status',
            header: '상태',
            width: 'w-[104px]',
            render: (row) => <AdminStatusPill status={row.status} />,
          },
          {
            key: 'title',
            header: '팀매칭',
            render: (row) => (
              <div className="min-w-0">
                <span className="block truncate font-medium text-[var(--text-strong)]" title={row.title}>
                  {row.title}
                </span>
                <span className="block truncate text-[var(--font-size-micro)] text-[var(--text-muted)]">
                  {row.hostTeamName}
                </span>
              </div>
            ),
          },
          {
            key: 'sportName',
            header: '종목',
            width: 'w-[96px]',
            render: (row) => <span className="text-[var(--text-muted)]">{row.sportName}</span>,
          },
          {
            key: 'createdAt',
            header: '생성',
            width: 'w-[132px]',
            render: (row) => (
              <span className="whitespace-nowrap text-[var(--text-muted)]">{formatDateTime(row.createdAt)}</span>
            ),
          },
        ]}
        renderActions={
          canWrite
            ? (row) => (
                <button
                  type="button"
                  onClick={() => setModalRow(row)}
                  aria-label={`${row.title} 상태 변경`}
                  className={[
                    'inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg text-[var(--font-size-label)] font-medium',
                    'text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-[var(--border)] transition-colors whitespace-nowrap',
                    'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                  ].join(' ')}
                >
                  상태 변경
                </button>
              )
            : undefined
        }
        loading={isInitialLoad}
        pagination={
          pageInfo?.totalPages
            ? {
                page: pageInfo.page ?? page,
                totalPages: pageInfo.totalPages,
                total: pageInfo.total ?? 0,
                limit: pageInfo.limit ?? PAGE_SIZE,
                onPageChange: setPage,
                loading: isFetching,
              }
            : undefined
        }
        empty={
          <AdminEmpty
            title="검색 결과가 없어요"
            description="필터를 변경해 보세요."
          />
        }
        error={
          isError && rows.length === 0
            ? extractErrorMessage(error, '팀매치 목록을 불러오지 못했어요.')
            : undefined
        }
        onRetry={() => void refetch()}
        skeletonRows={8}
      />

      {/* 페이지 이동 실패는 목록이 비어 보이지 않으므로 따로 알린다. */}
      {isError && rows.length > 0 && (
        <div className="mt-4 flex flex-col items-center gap-1.5">
          <p className="text-[var(--font-size-label)] text-red-500" role="alert">
            {extractErrorMessage(error, '목록을 불러오지 못했어요.')}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="inline-flex items-center h-[44px] px-6 rounded-xl text-[var(--font-size-body-sm)] font-medium text-[var(--text-body)] bg-[var(--card-surface)] border border-[var(--border)] hover:border-[var(--border-strong)] transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            {isFetching ? '불러오는 중…' : '다시 시도'}
          </button>
        </div>
      )}

      {/* Moderation modal */}
      <AdminReasonModal
        open={!!modalRow}
        title="팀매치 상태 변경"
        currentStatus={modalRow?.status}
        statusOptions={REASON_MODAL_STATUS_OPTIONS}
        onSubmit={handleModalSubmit}
        onClose={() => setModalRow(null)}
        pending={mutation.isPending}
      />

      {/* Toasts */}
      <AdminToasts toasts={toasts} />
    </>
  );
}
