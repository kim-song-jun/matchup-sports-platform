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
  AdminCardList,
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
  const statusOptions = STATUS_OPTIONS.map((option) => ({
    ...option,
    count: option.value ? data?.summary.byStatus[option.value] : data?.summary.total,
  }));

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
          showToast('팀매치 상태를 변경했어요.', 'success');
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

  // ── Loading / error for initial load ───────────────────────────────
  const isInitialLoad = isPending && accumulatedRows.length === 0;

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
      <AdminCardList<V1AdminTeamMatchRow>
        rows={accumulatedRows}
        keyExtractor={(r) => r.teamMatchId}
        card={(row) => ({
          title: row.title,
          subtitle: row.hostTeamName,
          status: row.status,
          meta: [
            { icon: <Activity size={14} aria-hidden="true" />, label: row.sportName },
            { icon: <Clock size={14} aria-hidden="true" />, label: formatDateTime(row.startAt) },
            { icon: <Calendar size={14} aria-hidden="true" />, label: formatDateTime(row.createdAt) },
          ],
          tone:
            row.status === 'cancelled'
              ? 'danger'
              : row.status === 'archived'
                ? 'warning'
                : undefined,
        })}
        renderActions={
          canWrite
            ? (row) => (
                <button
                  type="button"
                  onClick={() => setModalRow(row)}
                  aria-label={`${row.title} 상태 변경`}
                  className={[
                    'inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg text-[var(--font-size-label)] font-medium',
                    'text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors whitespace-nowrap',
                    'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                  ].join(' ')}
                >
                  상태 변경
                </button>
              )
            : undefined
        }
        loading={isInitialLoad}
        empty={
          <AdminEmpty
            title="검색 결과가 없어요"
            description="필터를 변경해 보세요."
          />
        }
        error={
          isError && accumulatedRows.length === 0
            ? extractErrorMessage(error, '팀매치 목록을 불러오지 못했어요.')
            : undefined
        }
        onRetry={() => void refetch()}
        skeletonCards={8}
      />

      {/* Load more */}
      {hasMore && !isInitialLoad && (
        <div className="mt-4 flex flex-col items-center gap-1.5">
          {loadMoreFailed && (
            <p className="text-[var(--font-size-label)] text-red-500" role="alert">
              {extractErrorMessage(error, '다음 목록을 불러오지 못했어요.')}
            </p>
          )}
          <button
            type="button"
            onClick={loadMoreFailed ? () => void refetch() : handleLoadMore}
            disabled={isFetching}
            className="inline-flex items-center h-[44px] px-6 rounded-xl text-[var(--font-size-body-sm)] font-medium text-gray-700 bg-white border border-gray-200 hover:border-gray-300 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
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
