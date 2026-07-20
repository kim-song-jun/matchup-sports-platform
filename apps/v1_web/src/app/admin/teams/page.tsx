'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  useV1AdminTeams,
  useV1AdminMe,
  useV1ChangeTeamStatus,
} from '@/hooks/use-v1-api';
import type { V1AdminTeamRow } from '@/types/api';
import { extractErrorMessage } from '@/lib/error-message';
import { User, Users, Calendar } from 'lucide-react';
import {
  AdminPageHeader,
  AdminCardList,
  AdminFilterBar,
  AdminReasonModal,
  AdminEmpty,
  AdminTableSkeleton,
  STATUS_META,
  useAdminToast,
  AdminToasts,
} from '@/components/admin';

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

  // ── Cursor pagination ──────────────────────────────────────────────
  const [cursor, setCursor] = useState<string | null>(null);
  const [accumulatedRows, setAccumulatedRows] = useState<V1AdminTeamRow[]>([]);

  // URL searchParam pre-selection on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get('status') ?? '';
    if (s) setActiveStatus(s);
  }, []);

  // Debounce search input ~300ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset pagination whenever an applied filter changes
  useEffect(() => {
    setAccumulatedRows([]);
    setCursor(null);
  }, [debouncedQ, activeStatus]);

  const handleSearchChange = (value: string) => setSearchInput(value);
  const handleStatusChange = (value: string) => setActiveStatus(value);

  const filters = {
    ...(debouncedQ ? { q: debouncedQ } : {}),
    ...(activeStatus ? { status: activeStatus } : {}),
    ...(cursor ? { cursor } : {}),
    limit: 20,
  };

  const { data, isPending, isError, error, refetch } = useV1AdminTeams(filters);
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
          showToast('팀 상태를 변경했어요.', 'success');
          setAccumulatedRows([]);
          setCursor(null);
        },
        onError: (err) => {
          showToast(extractErrorMessage(err, '처리 중 오류가 발생했어요.'), 'error');
        },
      },
    );
  };

  // ── Loading / error for initial load ───────────────────────────────
  const isInitialLoad = isPending && accumulatedRows.length === 0;
  const errorMessage =
    isError && accumulatedRows.length === 0
      ? extractErrorMessage(error, '팀 목록을 불러오지 못했어요.')
      : undefined;

  return (
    <>
      <AdminPageHeader
        eyebrow="플랫폼 관리"
        title="팀 관리"
        description="플랫폼 내 모든 팀의 상태를 검색하고 관리해요."
      />

      <div className="flex flex-col gap-4">
        {/* Filter bar */}
        <AdminFilterBar
          searchLabel="팀명 검색"
          searchPlaceholder="팀명 검색"
          searchValue={searchInput}
          onSearchChange={handleSearchChange}
          statusOptions={statusOptions}
          activeStatus={activeStatus}
          onStatusChange={handleStatusChange}
        />

        {/* Card list */}
        <AdminCardList<V1AdminTeamRow>
          rows={accumulatedRows}
          keyExtractor={(r) => r.teamId}
          card={(row) => ({
            title: row.name,
            subtitle: row.sportName,
            status: row.status,
            meta: [
              {
                icon: <User size={14} aria-hidden="true" />,
                label: row.ownerName ?? '—',
              },
              {
                icon: <Users size={14} aria-hidden="true" />,
                label: `멤버 ${row.memberCount} · 매니저 ${row.managerCount}`,
              },
              {
                icon: <Calendar size={14} aria-hidden="true" />,
                label: formatDate(row.createdAt),
              },
            ],
            tone:
              row.status === 'suspended' || row.status === 'archived'
                ? 'warning'
                : undefined,
          })}
          renderActions={(row) => (
            <>
              <Link
                href={`/admin/teams/${row.teamId}`}
                aria-label={`${row.name} 상세 보기`}
                className={[
                  'inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg text-[var(--font-size-label)] font-medium',
                  'text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors whitespace-nowrap',
                  'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                ].join(' ')}
              >
                상세 보기
              </Link>
              {canWrite ? (
                  <button
                    type="button"
                    onClick={() => setModalRow(row)}
                    aria-label={`${row.name} 상태 변경`}
                    className={[
                      'inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg text-[var(--font-size-label)] font-medium',
                      'text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors whitespace-nowrap',
                      'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                    ].join(' ')}
                  >
                    상태 변경
                  </button>
              ) : null}
            </>
          )}
          loading={isInitialLoad}
          empty={
            <AdminEmpty
              title="검색 결과가 없어요"
              description="검색어나 필터를 변경해 보세요."
            />
          }
          error={errorMessage}
          onRetry={() => void refetch()}
          skeletonCards={8}
        />

        {/* Load more */}
        {hasMore && !isInitialLoad && !isPending && (
          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={handleLoadMore}
              className={[
                'h-[44px] px-6 rounded-xl text-[var(--font-size-body-sm)] font-semibold transition-colors',
                'border border-gray-200 text-gray-700 bg-white hover:bg-gray-50',
                'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
              ].join(' ')}
            >
              더 보기
            </button>
          </div>
        )}

        {/* Loading more skeleton */}
        {isPending && accumulatedRows.length > 0 && <AdminTableSkeleton rows={4} />}
      </div>

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
