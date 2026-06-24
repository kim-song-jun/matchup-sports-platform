'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  useV1AdminMe,
  useV1AdminMatches,
  useV1ChangeMatchStatus,
} from '@/hooks/use-v1-api';
import { v1Get } from '@/lib/api-client';
import { extractErrorMessage } from '@/lib/error-message';
import { Activity, User, Clock, Users } from 'lucide-react';
import {
  AdminPageHeader,
  AdminFilterBar,
  AdminCardList,
  AdminReasonModal,
  AdminEmpty,
  AdminTableSkeleton,
  STATUS_META,
  useAdminToast,
  AdminToasts,
} from '@/components/admin';
import type { V1AdminMatchRow, CursorPage } from '@/types/api';

// ── Date formatter ────────────────────────────────────────────────────────────
function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    const mo = d.getMonth() + 1;
    const day = d.getDate();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${mo}/${day} ${hh}:${mm}`;
  } catch {
    return dateStr ?? '—';
  }
}

// ── Status options for moderation modal ──────────────────────────────────────
const MATCH_STATUS_OPTIONS = (
  ['recruiting', 'closed', 'cancelled', 'completed', 'archived'] as const
).map((v) => ({
  value: v,
  label: STATUS_META[v]?.label ?? v,
}));

// ── Status filter chips ───────────────────────────────────────────────────────
const MATCH_STATUS_FILTER_OPTIONS = [
  { value: '', label: '전체' },
  { value: 'recruiting', label: '모집 중' },
  { value: 'closed', label: '마감' },
  { value: 'cancelled', label: '취소됨' },
  { value: 'completed', label: '완료' },
  { value: 'archived', label: '보관' },
];

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AdminMatchesPage() {
  return (
    <Suspense fallback={null}>
      <AdminMatchesPageContent />
    </Suspense>
  );
}

function AdminMatchesPageContent() {
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get('status') ?? '';

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeStatus, setActiveStatus] = useState(initialStatus);

  // Accumulated rows across cursor pages
  const [extraRows, setExtraRows] = useState<V1AdminMatchRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<V1AdminMatchRow | null>(null);

  const { toasts, showToast } = useAdminToast();

  // Debounce search ~300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset extra pages when filters change
  useEffect(() => {
    setExtraRows([]);
    setNextCursor(null);
  }, [debouncedSearch, activeStatus]);

  // Capability check
  const { data: adminMe } = useV1AdminMe();
  const canWrite = adminMe?.capabilities.includes('status:write') ?? false;

  // Build filters
  const filters = {
    ...(debouncedSearch ? { q: debouncedSearch } : {}),
    ...(activeStatus ? { status: activeStatus } : {}),
    limit: 20,
  };

  // First page via React Query
  const {
    data: firstPage,
    isPending,
    isError,
    error,
    refetch,
  } = useV1AdminMatches(filters);

  // Sync cursor from first page
  useEffect(() => {
    if (firstPage) {
      setNextCursor(
        firstPage.nextCursor ?? firstPage.pageInfo?.nextCursor ?? null,
      );
    }
  }, [firstPage]);

  // Mutation
  const changeStatusMutation = useV1ChangeMatchStatus();

  // Combined rows: first page + loaded extras
  const firstRows = firstPage?.items ?? [];
  const rows = [...firstRows, ...extraRows];

  // Load more handler
  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await v1Get<CursorPage<V1AdminMatchRow>>('/admin/matches', {
        ...filters,
        cursor: nextCursor,
      });
      setExtraRows((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor ?? page.pageInfo?.nextCursor ?? null);
    } catch (err) {
      showToast(extractErrorMessage(err, '추가 데이터를 불러오지 못했어요.'), 'error');
    } finally {
      setLoadingMore(false);
    }
  }

  // Submit moderation modal
  function handleModalSubmit(status: string, reason: string) {
    if (!selectedRow) return;
    changeStatusMutation.mutate(
      { id: selectedRow.matchId, status, reason },
      {
        onSuccess: () => {
          setModalOpen(false);
          setSelectedRow(null);
          // Reset to first page so the updated row (incl. page2+ extras) is
          // re-fetched fresh instead of left stale in extraRows.
          setExtraRows([]);
          setNextCursor(null);
          showToast('매치 상태를 변경했어요.', 'success');
        },
        onError: (err) => {
          showToast(extractErrorMessage(err, '상태 변경에 실패했어요.'), 'error');
        },
      },
    );
  }

  const errorMessage = isError
    ? extractErrorMessage(error, '매치 목록을 불러오지 못했어요.')
    : undefined;

  return (
    <>
      <AdminPageHeader
        title="매치 관리"
        description="플랫폼 전체 매치의 상태를 검색하고 관리해요."
      />

      <div className="flex flex-col gap-4">
        {/* Filter bar */}
        <AdminFilterBar
          searchLabel="제목·장소 검색"
          searchPlaceholder="제목·장소 검색"
          searchValue={search}
          onSearchChange={setSearch}
          statusOptions={MATCH_STATUS_FILTER_OPTIONS}
          activeStatus={activeStatus}
          onStatusChange={(v) => setActiveStatus(v)}
        />

        {/* Card list */}
        <AdminCardList<V1AdminMatchRow>
          rows={rows}
          keyExtractor={(row) => row.matchId}
          card={(row) => ({
            title: row.title,
            subtitle: row.placeName,
            status: row.status,
            meta: [
              { icon: <Activity size={14} aria-hidden="true" />, label: row.sportName },
              { icon: <User size={14} aria-hidden="true" />, label: row.hostName ?? '—' },
              { icon: <Clock size={14} aria-hidden="true" />, label: formatDateTime(row.startAt) },
              {
                icon: <Users size={14} aria-hidden="true" />,
                label: `${row.participantCount}/${row.maxParticipants}`,
              },
            ],
            tone:
              row.status === 'cancelled'
                ? 'danger'
                : row.status === 'closed'
                  ? 'warning'
                  : undefined,
          })}
          renderActions={
            canWrite
              ? (row) => (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRow(row);
                      setModalOpen(true);
                    }}
                    className={[
                      'inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg text-[var(--font-size-label)] font-medium',
                      'text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors whitespace-nowrap',
                      'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                    ].join(' ')}
                    aria-label={`${row.title} 상태 변경`}
                  >
                    상태 변경
                  </button>
                )
              : undefined
          }
          loading={isPending}
          empty={
            <AdminEmpty
              title="조건에 맞는 매치가 없어요"
              description="검색어나 상태 필터를 변경해 보세요."
            />
          }
          error={errorMessage}
          onRetry={() => void refetch()}
          skeletonCards={8}
        />

        {/* Load more trigger */}
        {nextCursor && !isPending && !isError && !loadingMore && (
          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={() => void loadMore()}
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
        {loadingMore && <AdminTableSkeleton rows={4} />}
      </div>

      {/* Reason modal */}
      <AdminReasonModal
        open={modalOpen}
        title="매치 상태 변경"
        currentStatus={selectedRow?.status}
        statusOptions={MATCH_STATUS_OPTIONS}
        onSubmit={handleModalSubmit}
        onClose={() => {
          if (!changeStatusMutation.isPending) {
            setModalOpen(false);
            setSelectedRow(null);
          }
        }}
        pending={changeStatusMutation.isPending}
      />

      {/* Toasts */}
      <AdminToasts toasts={toasts} />
    </>
  );
}
