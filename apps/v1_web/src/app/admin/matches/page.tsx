'use client';

import { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useV1AdminMatches,
  useV1ChangeMatchStatus,
} from '@/hooks/use-v1-api';
import { formatAdminDateTimeShort } from '@/lib/date-utils';
import { extractErrorMessage } from '@/lib/error-message';
import { useAdminCanWrite } from '@/hooks/use-admin-can-write';
import { useAdminUrlListQuery } from '../use-admin-url-list-query';
import { useAdminVisibilityParam } from '../use-admin-visibility-param';
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
import { AdminVisibilityFilter } from '@/components/admin/admin-visibility-filter';
import { AdminVisibilityBadge } from '@/components/admin/competition-visibility-row-action';
import type { V1AdminMatchRow } from '@/types/api';

// ── Status options for moderation modal ──────────────────────────────────────
const MATCH_STATUS_OPTIONS = (
  ['recruiting', 'closed', 'cancelled', 'archived'] as const
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
  const router = useRouter();
  const {
    search,
    setSearch,
    activeStatus,
    setActiveStatus,
    filters,
    resetToFirstPage,
    buildPagination,
  } = useAdminUrlListQuery(MATCH_STATUS_FILTER_OPTIONS, PAGE_SIZE);

  // 공개 여부 필터도 ?visibility= 로 URL 에 남긴다.
  const [visibility, setVisibility] = useAdminVisibilityParam(resetToFirstPage);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<V1AdminMatchRow | null>(null);

  const { toasts, showToast } = useAdminToast();

  // Capability check
  const canWrite = useAdminCanWrite();


  const {
    data: firstPage,
    isPending,
    isFetching,
    isError,
    error,
    refetch,
  } = useV1AdminMatches(visibility ? { ...filters, visibility } : filters);

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

      <div className="tm-content-enter flex flex-col gap-4">
        {/* Filter bar */}
        <AdminFilterBar
          searchLabel="제목·장소 검색"
          searchPlaceholder="제목·장소 검색"
          searchValue={search}
          onSearchChange={setSearch}
          statusOptions={statusOptions}
          activeStatus={activeStatus}
          onStatusChange={(v) => setActiveStatus(v)}
          rightSlot={<AdminVisibilityFilter value={visibility} onChange={setVisibility} />}
        />

        {/* Card list */}
        <AdminDataTable<V1AdminMatchRow>
          rows={rows}
          keyExtractor={(row) => row.matchId}
          // 상세 라우트는 있었는데 목록에서 갈 길이 없어 ⌘K 팔레트로만 도달 가능했다.
          onRowClick={(row) => router.push(`/admin/matches/${encodeURIComponent(row.matchId)}`)}
          rowClickLabel={(row) => `${row.title} 상세 보기`}
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
                <span className="whitespace-nowrap text-[var(--text-muted)]">{formatAdminDateTimeShort(row.startAt)}</span>
              ),
            },
            {
              key: 'status',
              header: '상태',
              width: 'w-[112px]',
              render: (row) => (
                <div className="flex flex-col items-start gap-1">
                  <AdminStatusPill status={row.status} />
                  {row.hiddenAt ? <AdminVisibilityBadge isPublic={false} /> : null}
                </div>
              ),
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
                    // 숨긴 매치는 서버가 상태 변경을 거절한다 — 상세의 '다시 공개하기'가 먼저다.
                    disabled={Boolean(row.hiddenAt)}
                    title={row.hiddenAt ? '숨긴 매치는 상태를 바꿀 수 없어요.' : undefined}
                    onClick={() => {
                      setSelectedRow(row);
                      setModalOpen(true);
                    }}
                    className={[
                      'tm-on-tint inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg text-[length:var(--font-size-label)] font-medium',
                      'text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-[var(--border)] transition-colors whitespace-nowrap',
                      'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                    ].join(' ')}
                    aria-label={row.hiddenAt ? `${row.title} 상태 변경 — 숨긴 매치는 바꿀 수 없어요` : `${row.title} 상태 변경`}
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
