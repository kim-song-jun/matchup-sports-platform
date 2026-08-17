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
  // ── Admin capabilities ─────────────────────────────────────────────
  const { data: adminMe } = useV1AdminMe();
  const canWrite = adminMe?.capabilities.includes('status:write') ?? false;

  // ── Filter state ───────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [activeStatus, setActiveStatus] = useState('');

  // ── Cursor pagination ──────────────────────────────────────────────
  // 커서 누적 대신 페이지 단위 교체다 — 목록 어디쯤인지와 총량이 보여야 한다.
  const [page, setPage] = useState(1);

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
    setPage(1);
  }, [debouncedQ, activeStatus]);

  const handleSearchChange = (value: string) => setSearchInput(value);
  const handleStatusChange = (value: string) => setActiveStatus(value);

  const filters = {
    ...(debouncedQ ? { q: debouncedQ } : {}),
    ...(activeStatus ? { status: activeStatus } : {}),
    page,
    limit: PAGE_SIZE,
  };

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
          searchValue={searchInput}
          onSearchChange={handleSearchChange}
          statusOptions={statusOptions}
          activeStatus={activeStatus}
          onStatusChange={handleStatusChange}
        />

        {/* Card list */}
        <AdminDataTable<V1AdminTeamRow>
          rows={rows}
          keyExtractor={(r) => r.teamId}
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
                  'inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg text-[var(--font-size-label)] font-medium',
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
                      'inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg text-[var(--font-size-label)] font-medium',
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
