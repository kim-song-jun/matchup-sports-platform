'use client';

import { useEffect, useState } from 'react';
import {
  useV1AdminTeamMatches,
  useV1AdminMe,
  useV1ChangeTeamMatchStatus,
} from '@/hooks/use-v1-api';
import type { V1AdminTeamMatchRow } from '@/types/api';
import { extractErrorMessage } from '@/lib/error-message';
import {
  AdminPageHeader,
  AdminDataTable,
  AdminStatusPill,
  AdminReasonModal,
  AdminEmpty,
  AdminTableSkeleton,
  STATUS_META,
  useAdminToast,
  AdminToasts,
} from '@/components/admin';
import type { AdminTableColumn } from '@/components/admin';

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
  { value: 'recruiting', label: '모집중' },
  { value: 'matched', label: '매칭됨' },
  { value: 'cancelled', label: '취소' },
  { value: 'completed', label: '완료' },
  { value: 'archived', label: '보관' },
];

const REASON_MODAL_STATUS_OPTIONS = [
  { value: 'recruiting', label: STATUS_META['recruiting']?.label ?? '모집중' },
  { value: 'matched', label: STATUS_META['matched']?.label ?? '매칭됨' },
  { value: 'cancelled', label: STATUS_META['cancelled']?.label ?? '취소됨' },
  { value: 'completed', label: STATUS_META['completed']?.label ?? '완료' },
  { value: 'archived', label: STATUS_META['archived']?.label ?? '보관' },
];

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
    setAccumulatedRows([]);
    setCursor(null);
    setNextCursor(null);
  };

  // ── Cursor pagination ──────────────────────────────────────────────
  const [cursor, setCursor] = useState<string | null>(null);
  const [accumulatedRows, setAccumulatedRows] = useState<V1AdminTeamMatchRow[]>([]);
  // Persisted so the "더 보기" button survives the next-page fetch (data is
  // briefly undefined) and a failed fetch (data stays undefined) — otherwise
  // the button would vanish mid-load and permanently on error, blocking retry.
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const filters = {
    ...(activeStatus ? { status: activeStatus } : {}),
    ...(cursor ? { cursor } : {}),
    limit: 20,
  };

  const { data, isPending, isFetching, isError, error, refetch } = useV1AdminTeamMatches(filters);

  // Accumulate rows as pages load
  useEffect(() => {
    if (!data?.items) return;
    if (!cursor) {
      setAccumulatedRows(data.items);
    } else {
      setAccumulatedRows((prev) => [...prev, ...data.items]);
    }
    setNextCursor(data.nextCursor ?? data.pageInfo?.nextCursor ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const hasMore = !!nextCursor;
  const loadMoreFailed = isError && accumulatedRows.length > 0;

  const handleLoadMore = () => {
    if (nextCursor) setCursor(nextCursor);
  };

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
          showToast('처리했어요.', 'success');
          setAccumulatedRows([]);
          setCursor(null);
          setNextCursor(null);
        },
        onError: (err) => {
          showToast(extractErrorMessage(err, '처리 중 오류가 발생했어요.'), 'error');
        },
      },
    );
  };

  // ── Table columns ──────────────────────────────────────────────────
  const columns: AdminTableColumn<V1AdminTeamMatchRow>[] = [
    {
      key: 'title',
      header: '팀매치',
      render: (row) => (
        <span className="font-medium text-gray-900">{row.title}</span>
      ),
    },
    {
      key: 'hostTeamName',
      header: '호스트팀',
      render: (row) => (
        <span className="text-gray-600">{row.hostTeamName}</span>
      ),
    },
    {
      key: 'sportName',
      header: '종목',
      render: (row) => <span className="text-gray-600">{row.sportName}</span>,
    },
    {
      key: 'startAt',
      header: '일시',
      render: (row) => (
        <span className="text-gray-600 tabular-nums">{formatDateTime(row.startAt)}</span>
      ),
    },
    {
      key: 'status',
      header: '상태',
      render: (row) => <AdminStatusPill status={row.status} />,
    },
  ];

  // ── Loading / error for initial load ───────────────────────────────
  const isInitialLoad = isPending && accumulatedRows.length === 0;

  return (
    <>
      <AdminPageHeader
        eyebrow="플랫폼 관리"
        title="팀매치 관리"
        description="플랫폼 내 모든 팀매치의 상태를 필터링하고 관리해요."
      />

      {/* Status chip filter — no search box (backend has no q for team-matches) */}
      <div className="mb-4">
        <div role="group" aria-label="상태 필터" className="flex items-center gap-1.5 flex-wrap">
          {STATUS_OPTIONS.map((opt) => {
            const active = activeStatus === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleStatusChange(opt.value)}
                aria-pressed={active}
                className={[
                  'inline-flex items-center px-3 h-[34px] rounded-full text-[13px] font-medium transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                  active
                    ? 'bg-blue-500 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600',
                ].join(' ')}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Data table */}
      {isInitialLoad ? (
        <AdminTableSkeleton />
      ) : isError && accumulatedRows.length === 0 ? (
        <AdminDataTable<V1AdminTeamMatchRow>
          columns={columns}
          rows={[]}
          keyExtractor={(r) => r.teamMatchId}
          error={extractErrorMessage(error, '팀매치 목록을 불러오지 못했어요.')}
          onRetry={() => void refetch()}
        />
      ) : (
        <AdminDataTable<V1AdminTeamMatchRow>
          columns={columns}
          rows={accumulatedRows}
          keyExtractor={(r) => r.teamMatchId}
          actionsHeader="작업"
          renderActions={
            canWrite
              ? (row) => (
                  <button
                    type="button"
                    onClick={() => setModalRow(row)}
                    aria-label={`${row.title} 상태 변경`}
                    className="inline-flex items-center min-h-[44px] px-3 rounded-lg text-[13px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 whitespace-nowrap min-w-[80px] justify-center"
                  >
                    상태 변경
                  </button>
                )
              : undefined
          }
          empty={
            <AdminEmpty
              title="검색 결과가 없어요"
              description="필터를 변경해 보세요."
            />
          }
        />
      )}

      {/* Load more */}
      {hasMore && !isInitialLoad && (
        <div className="mt-4 flex flex-col items-center gap-1.5">
          {loadMoreFailed && (
            <p className="text-[13px] text-red-500" role="alert">
              {extractErrorMessage(error, '다음 목록을 불러오지 못했어요.')}
            </p>
          )}
          <button
            type="button"
            onClick={loadMoreFailed ? () => void refetch() : handleLoadMore}
            disabled={isFetching}
            className="inline-flex items-center h-[44px] px-6 rounded-xl text-[14px] font-medium text-gray-700 bg-white border border-gray-200 hover:border-gray-300 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            {isFetching ? '불러오는 중…' : loadMoreFailed ? '다시 시도' : '더 보기'}
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
