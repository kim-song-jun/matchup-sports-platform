'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useV1AdminTeams,
  useV1AdminMe,
  useV1ChangeTeamStatus,
} from '@/hooks/use-v1-api';
import type { V1AdminTeamRow } from '@/types/api';
import { extractErrorMessage } from '@/lib/error-message';
import { useAdminListQuery } from '@/hooks/use-admin-list-query';
import {
  AdminPageHeader,
  AdminDataTable,
  AdminStatusPill,
  AdminFilterBar,
  AdminReasonModal,
  AdminEmpty,
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

const PAGE_SIZE = 20;

// ── Page ──────────────────────────────────────────────────────────────────

export default function AdminTeamsPage() {
  const router = useRouter();
  // ── Admin capabilities ─────────────────────────────────────────────
  const { data: adminMe } = useV1AdminMe();
  const canWrite = adminMe?.capabilities.includes('status:write') ?? false;

  // ── Filter state — 검색 debounce·상태 필터·page 리셋은 공용 훅이 담당 ─────
  const {
    search,
    setSearch,
    activeStatus,
    setActiveStatus,
    filters,
    resetToFirstPage,
    buildPagination,
  } = useAdminListQuery({ pageSize: PAGE_SIZE });

  // URL searchParam pre-selection on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get('status') ?? '';
    if (s) setActiveStatus(s);
  }, [setActiveStatus]);

  const { data, isPending, isFetching, isError, error, refetch } = useV1AdminTeams(filters);
  const rows = data?.items ?? [];
  const pageInfo = data?.pageInfo;
  const statusOptions = STATUS_OPTIONS.map((option) => ({
    ...option,
    count: option.value ? data?.summary.byStatus[option.value] : data?.summary.total,
  }));


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
          resetToFirstPage();
        },
        onError: (err) => {
          showToast(extractErrorMessage(err, '처리 중 오류가 발생했어요.'), 'error');
        },
      },
    );
  };

  // ── Loading / error for initial load ───────────────────────────────
  const isInitialLoad = isPending && rows.length === 0;
  const errorMessage =
    isError && rows.length === 0
      ? extractErrorMessage(error, '팀 목록을 불러오지 못했어요.')
      : undefined;

  return (
    <>
      <AdminPageHeader
        eyebrow="플랫폼"
        title="팀 관리"
        description="플랫폼 내 모든 팀의 상태를 검색하고 관리해요."
      />

      <div className="flex flex-col gap-4">
        {/* Filter bar */}
        <AdminFilterBar
          searchLabel="팀명 검색"
          searchPlaceholder="팀명 검색"
          searchValue={search}
          onSearchChange={setSearch}
          statusOptions={statusOptions}
          activeStatus={activeStatus}
          onStatusChange={setActiveStatus}
        />

        {/* Card list */}
        <AdminDataTable<V1AdminTeamRow>
          rows={rows}
          keyExtractor={(r) => r.teamId}
          // 자매 목록(matches·team-matches)과 같은 행 진입 계약 — "상세 보기" 버튼으로만
          // 진입 가능하던 유일한 목록 2개(users·teams) 중 하나였다.
          onRowClick={(row) => router.push(`/admin/teams/${encodeURIComponent(row.teamId)}`)}
          rowClickLabel={(row) => `${row.name} 상세 보기`}
          tableMaxWidth="max-w-none"
          rowTone={(row) =>
            row.status === 'suspended' || row.status === 'archived' ? 'warning' : undefined
          }
          columns={[
            {
              key: 'name',
              header: '팀',
              render: (row) => (
                <span className="block truncate font-medium text-[var(--text-strong)]" title={row.name}>
                  {row.name}
                </span>
              ),
            },
            {
              key: 'status',
              header: '상태',
              width: 'w-[104px]',
              render: (row) => <AdminStatusPill status={row.status} />,
            },
            {
              key: 'sportName',
              header: '종목',
              width: 'w-[104px]',
              render: (row) => <span className="text-[var(--text-muted)]">{row.sportName}</span>,
            },
            {
              key: 'ownerName',
              header: '팀장',
              width: 'w-[132px]',
              render: (row) => (
                <span className="block truncate text-[var(--text-muted)]">{row.ownerName ?? '—'}</span>
              ),
            },
            {
              key: 'members',
              header: '멤버 / 매니저',
              align: 'center',
              width: 'w-[116px]',
              render: (row) => (
                <span className="tabular-nums whitespace-nowrap text-[var(--text-muted)]">
                  {row.memberCount} / {row.managerCount}
                </span>
              ),
            },
            {
              key: 'createdAt',
              header: '생성',
              width: 'w-[112px]',
              render: (row) => (
                <span className="whitespace-nowrap text-[var(--text-muted)]">{formatDate(row.createdAt)}</span>
              ),
            },
          ]}
          renderActions={(row) => (
            <>
              <Link
                href={`/admin/teams/${row.teamId}`}
                aria-label={`${row.name} 상세 보기`}
                className={[
                  'inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg text-[length:var(--font-size-label)] font-medium',
                  'text-[var(--blue700)] bg-[var(--blue50)] hover:bg-[var(--blue100)] transition-colors whitespace-nowrap',
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
                      'inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg text-[length:var(--font-size-label)] font-medium',
                      'text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-[var(--border)] transition-colors whitespace-nowrap',
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
          skeletonRows={8}
          pagination={buildPagination(pageInfo, isFetching)}
        />

        {/* Load more */}

        {/* Loading more skeleton */}
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
