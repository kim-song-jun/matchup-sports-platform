'use client';

import { useEffect, useRef, useState } from 'react';
import {
  useV1AdminTeams,
  useV1AdminMe,
  useV1ChangeTeamStatus,
} from '@/hooks/use-v1-api';
import type { V1AdminTeamRow } from '@/types/api';
import { extractErrorMessage } from '@/lib/error-message';
import {
  AdminPageHeader,
  AdminDataTable,
  AdminFilterBar,
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

function formatDate(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

// ── Status filter options ─────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: '', label: '전체' },
  { value: 'active', label: '활성' },
  { value: 'suspended', label: '정지' },
  { value: 'archived', label: '보관' },
];

const REASON_MODAL_STATUS_OPTIONS = [
  { value: 'active', label: STATUS_META['active']?.label ?? '활성' },
  { value: 'suspended', label: STATUS_META['suspended']?.label ?? '정지' },
  { value: 'archived', label: STATUS_META['archived']?.label ?? '보관' },
];

// ── Page ──────────────────────────────────────────────────────────────────

export default function AdminTeamsPage() {
  // ── Admin capabilities ─────────────────────────────────────────────
  const { data: adminMe } = useV1AdminMe();
  const canWrite = adminMe?.capabilities.includes('status:write') ?? false;

  // ── Filter state ───────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [activeStatus, setActiveStatus] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // URL searchParam pre-selection on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get('status') ?? '';
    if (s) setActiveStatus(s);
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQ(value);
      setAccumulatedRows([]);
      setCursor(null);
    }, 300);
  };

  const handleStatusChange = (value: string) => {
    setActiveStatus(value);
    setAccumulatedRows([]);
    setCursor(null);
  };

  // ── Cursor pagination ──────────────────────────────────────────────
  const [cursor, setCursor] = useState<string | null>(null);
  const [accumulatedRows, setAccumulatedRows] = useState<V1AdminTeamRow[]>([]);

  const filters = {
    ...(debouncedQ ? { q: debouncedQ } : {}),
    ...(activeStatus ? { status: activeStatus } : {}),
    ...(cursor ? { cursor } : {}),
    limit: 20,
  };

  const { data, isPending, isError, error, refetch } = useV1AdminTeams(filters);

  // Accumulate rows as pages load
  useEffect(() => {
    if (!data?.items) return;
    if (!cursor) {
      // First page (filters changed) — replace
      setAccumulatedRows(data.items);
    } else {
      // Subsequent pages — append
      setAccumulatedRows((prev) => [...prev, ...data.items]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const nextCursor = data?.nextCursor ?? data?.pageInfo?.nextCursor ?? null;
  const hasMore = !!nextCursor;

  const handleLoadMore = () => {
    if (nextCursor) setCursor(nextCursor);
  };

  // ── Moderation modal ───────────────────────────────────────────────
  const [modalRow, setModalRow] = useState<V1AdminTeamRow | null>(null);
  const mutation = useV1ChangeTeamStatus();

  // ── Toast ──────────────────────────────────────────────────────────
  const { toasts, showToast } = useAdminToast();

  const handleModalSubmit = (status: string, reason: string) => {
    if (!modalRow) return;
    mutation.mutate(
      { id: modalRow.teamId, status, reason },
      {
        onSuccess: () => {
          setModalRow(null);
          showToast('처리했어요.', 'success');
          // Reset to first page so updated row is re-fetched
          setAccumulatedRows([]);
          setCursor(null);
        },
        onError: (err) => {
          showToast(extractErrorMessage(err, '처리 중 오류가 발생했어요.'), 'error');
        },
      },
    );
  };

  // ── Table columns ──────────────────────────────────────────────────
  const columns: AdminTableColumn<V1AdminTeamRow>[] = [
    {
      key: 'name',
      header: '팀',
      render: (row) => (
        <span className="font-medium text-gray-900">{row.name}</span>
      ),
    },
    {
      key: 'sportName',
      header: '종목',
      render: (row) => <span className="text-gray-600">{row.sportName}</span>,
    },
    {
      key: 'ownerName',
      header: '소유자',
      render: (row) => (
        <span className="text-gray-600">{row.ownerName ?? '—'}</span>
      ),
    },
    {
      key: 'members',
      header: '인원',
      align: 'right',
      className: 'tabular-nums',
      render: (row) => (
        <span className="text-gray-600">
          멤버 {row.memberCount} · 운영 {row.managerCount}
        </span>
      ),
    },
    {
      key: 'status',
      header: '상태',
      render: (row) => <AdminStatusPill status={row.status} />,
    },
    {
      key: 'createdAt',
      header: '생성일',
      render: (row) => (
        <span className="text-gray-500 text-[13px]">{formatDate(row.createdAt)}</span>
      ),
    },
  ];

  // ── Loading / error for initial load ───────────────────────────────
  const isInitialLoad = isPending && accumulatedRows.length === 0;

  return (
    <>
      <AdminPageHeader
        eyebrow="플랫폼 관리"
        title="팀 관리"
        description="플랫폼 내 모든 팀의 상태를 검색하고 관리해요."
      />

      {/* Filter bar */}
      <div className="mb-4">
        <AdminFilterBar
          searchLabel="팀명 검색"
          searchPlaceholder="팀명 검색"
          searchValue={searchInput}
          onSearchChange={handleSearchChange}
          statusOptions={STATUS_OPTIONS}
          activeStatus={activeStatus}
          onStatusChange={handleStatusChange}
        />
      </div>

      {/* Data table */}
      {isInitialLoad ? (
        <AdminTableSkeleton />
      ) : isError && accumulatedRows.length === 0 ? (
        <AdminDataTable<V1AdminTeamRow>
          columns={columns}
          rows={[]}
          keyExtractor={(r) => r.teamId}
          error={extractErrorMessage(error, '팀 목록을 불러오지 못했어요.')}
          onRetry={() => void refetch()}
        />
      ) : (
        <AdminDataTable<V1AdminTeamRow>
          columns={columns}
          rows={accumulatedRows}
          keyExtractor={(r) => r.teamId}
          actionsHeader="작업"
          renderActions={
            canWrite
              ? (row) => (
                  <button
                    type="button"
                    onClick={() => setModalRow(row)}
                    aria-label={`${row.name} 상태 변경`}
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
              description="검색어나 필터를 변경해 보세요."
            />
          }
        />
      )}

      {/* Load more */}
      {hasMore && !isInitialLoad && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={isPending}
            className="inline-flex items-center h-[44px] px-6 rounded-xl text-[14px] font-medium text-gray-700 bg-white border border-gray-200 hover:border-gray-300 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            {isPending ? '불러오는 중…' : '더 보기'}
          </button>
        </div>
      )}

      {/* Moderation modal */}
      <AdminReasonModal
        open={!!modalRow}
        title="팀 상태 변경"
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
