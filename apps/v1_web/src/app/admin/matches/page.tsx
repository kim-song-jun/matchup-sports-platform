'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  useV1AdminMe,
  useV1AdminMatches,
  useV1ChangeMatchStatus,
} from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { useAdminListQuery } from '@/hooks/use-admin-list-query';
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
import type { V1AdminMatchRow } from '@/types/api';

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

const PAGE_SIZE = 20;

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

  // 검색 debounce·상태 필터·page 리셋·페이지네이션 조립은 공용 훅이 담당한다.
  // (커서 누적 대신 페이지 단위 교체 — 목록 어디쯤인지와 총량이 보여야 한다.)
  const {
    search,
    setSearch,
    activeStatus,
    setActiveStatus,
    filters,
    resetToFirstPage,
    buildPagination,
  } = useAdminListQuery({ initialStatus, pageSize: PAGE_SIZE });

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<V1AdminMatchRow | null>(null);

  const { toasts, showToast } = useAdminToast();

  // Capability check
  const { data: adminMe } = useV1AdminMe();
  const canWrite = adminMe?.capabilities.includes('status:write') ?? false;


  const {
    data: firstPage,
    isPending,
    isFetching,
    isError,
    error,
    refetch,
  } = useV1AdminMatches(filters);

  // Mutation
  const changeStatusMutation = useV1ChangeMatchStatus();

  const rows = firstPage?.items ?? [];
  const pageInfo = firstPage?.pageInfo;
  const statusOptions = MATCH_STATUS_FILTER_OPTIONS.map((option) => ({
    ...option,
    count: option.value ? firstPage?.summary.byStatus[option.value] : firstPage?.summary.total,
  }));

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
          resetToFirstPage();
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
        eyebrow="플랫폼"
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
          statusOptions={statusOptions}
          activeStatus={activeStatus}
          onStatusChange={(v) => setActiveStatus(v)}
        />

        {/* Card list */}
        <AdminDataTable<V1AdminMatchRow>
          rows={rows}
          keyExtractor={(row) => row.matchId}
          tableMaxWidth="max-w-none"
          rowTone={(row) =>
            row.status === 'cancelled' ? 'danger' : row.status === 'closed' ? 'warning' : undefined
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
              header: '매치',
              render: (row) => (
                <div className="min-w-0">
                  <span className="block truncate font-medium text-[var(--text-strong)]" title={row.title}>
                    {row.title}
                  </span>
                  <span className="block truncate text-[length:var(--font-size-micro)] text-[var(--text-muted)]">
                    {row.placeName}
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
              key: 'hostName',
              header: '호스트',
              width: 'w-[124px]',
              render: (row) => (
                <span className="block truncate text-[var(--text-muted)]">{row.hostName ?? '—'}</span>
              ),
            },
            {
              key: 'participants',
              header: '참가',
              align: 'center',
              width: 'w-[88px]',
              render: (row) => (
                <span className="tabular-nums whitespace-nowrap text-[var(--text-muted)]">
                  {row.participantCount}/{row.maxParticipants}
                </span>
              ),
            },
          ]}
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
                      'inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg text-[length:var(--font-size-label)] font-medium',
                      'text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-[var(--border)] transition-colors whitespace-nowrap',
                      'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                    ].join(' ')}
                    aria-label={`${row.title} 상태 변경`}
                  >
                    상태 변경
                  </button>
                )
              : undefined
          }
          loading={isPending && rows.length === 0}
          empty={
            <AdminEmpty
              title="조건에 맞는 매치가 없어요"
              description="검색어나 상태 필터를 변경해 보세요."
            />
          }
          error={errorMessage}
          onRetry={() => void refetch()}
          skeletonRows={8}
          pagination={buildPagination(pageInfo, isFetching)}
        />
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
