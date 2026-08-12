'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Calendar, Clock, Users, Coins } from 'lucide-react';
import {
  useV1AdminTournaments,
  useV1AdminMe,
} from '@/hooks/use-v1-api';
import type { V1Tournament, V1TournamentStatus } from '@/types/api';
import { extractErrorMessage } from '@/lib/error-message';
import {
  AdminPageHeader,
  AdminDataTable,
  AdminStatusPill,
  AdminFilterBar,
  AdminEmpty,
  AdminTableSkeleton,
  AdminToasts,
  useAdminToast,
} from '@/components/admin';

// ── Helpers ───────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
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

function formatDateRange(startStr: string | null, endStr: string | null): string {
  const start = formatDate(startStr);
  if (start === '—') return start;
  const end = formatDate(endStr);
  if (end === '—' || end === start) return start;
  return `${start} ~ ${end}`;
}

function formatCurrency(n: number): string {
  if (n === 0) return '무료';
  return `${n.toLocaleString('ko-KR')}원`;
}

// ── Status filter options ─────────────────────────────────────────────────

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '전체' },
  { value: 'draft', label: '초안' },
  { value: 'open', label: '접수 중' },
  { value: 'closed', label: '마감' },
  { value: 'in_progress', label: '진행 중' },
  { value: 'completed', label: '완료' },
  { value: 'cancelled', label: '취소됨' },
];

const PAGE_SIZE = 20;

// ── Page ──────────────────────────────────────────────────────────────────

export default function AdminTournamentsPage() {
  const { data: adminMe } = useV1AdminMe();
  const canWrite = adminMe?.capabilities.includes('status:write') ?? false;

  const [activeStatus, setActiveStatus] = useState<string>('');

  // URL pre-selection on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get('status') ?? '';
    if (s) setActiveStatus(s);
  }, []);

  // 커서 누적 대신 페이지 단위 교체다 — 목록 어디쯤인지와 총량이 보여야 한다.
  const [page, setPage] = useState(1);

  const { toasts, showToast: _showToast } = useAdminToast();
  // showToast is available for future use (e.g. after bulk actions)

  const handleStatusChange = (value: string) => {
    setActiveStatus(value);
    // 필터를 좁히면 보던 페이지에 결과가 없을 수 있어 첫 페이지로 되돌린다.
    setPage(1);
  };

  const filters = {
    ...(activeStatus ? { status: activeStatus as V1TournamentStatus } : {}),
    page,
    limit: PAGE_SIZE,
  };

  const { data, isPending, isFetching, isError, error, refetch } =
    useV1AdminTournaments(filters);
  const rows = data?.items ?? [];
  const pageInfo = data?.pageInfo;
  const statusOptions = STATUS_OPTIONS.map((option) => ({
    ...option,
    count: option.value ? data?.summary.byStatus[option.value] : data?.summary.total,
  }));

  const isInitialLoad = isPending && rows.length === 0;

  const errorMessage =
    isError && rows.length === 0
      ? extractErrorMessage(error, '대회 목록을 불러오지 못했어요.')
      : undefined;

  return (
    <>
      <AdminPageHeader
        eyebrow="플랫폼 관리"
        title="대회 관리"
        description="플랫폼 내 모든 대회의 상태를 필터링하고 관리해요."
        action={
          canWrite ? (
            <Link
              href="/admin/tournaments/new"
              className="inline-flex items-center gap-1.5 h-[44px] px-4 rounded-xl text-[var(--font-size-label)] font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
              aria-label="새 대회 만들기"
            >
              <Plus size={16} aria-hidden="true" />
              대회 만들기
            </Link>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-4">
        {/* Filter bar — no text search (backend has no q for tournaments) */}
        <AdminFilterBar
          hideSearch
          searchValue=""
          onSearchChange={() => undefined}
          statusOptions={statusOptions}
          activeStatus={activeStatus}
          onStatusChange={handleStatusChange}
        />

        {/* Card list */}
        {isInitialLoad ? (
          <AdminTableSkeleton rows={8} />
        ) : (
          <AdminDataTable<V1Tournament>
            rows={rows}
            keyExtractor={(r) => r.id}
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
            tableMaxWidth="max-w-none"
            rowTone={(row) =>
              row.status === 'cancelled' ? 'danger' : row.status === 'closed' ? 'warning' : undefined
            }
            columns={[
              {
                key: 'schedule',
                header: '일정',
                width: 'w-[168px]',
                render: (row) => (
                  <span className="whitespace-nowrap text-[var(--text-muted)]">
                    {formatDateRange(row.scheduledAt, row.scheduledEndAt)}
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
                key: 'title',
                header: '대회',
                render: (row) => (
                  <div className="min-w-0">
                    <span className="block truncate font-medium text-[var(--text-strong)]" title={row.title}>
                      {row.title}
                    </span>
                    {row.venue ? (
                      <span className="block truncate text-[var(--font-size-micro)] text-[var(--text-muted)]">
                        {row.venue}
                      </span>
                    ) : null}
                  </div>
                ),
              },
              {
                key: 'deadline',
                header: '접수 마감',
                width: 'w-[124px]',
                render: (row) => (
                  <span className="whitespace-nowrap text-[var(--text-muted)]">
                    {formatDate(row.registrationDeadlineAt)}
                  </span>
                ),
              },
              {
                key: 'registrationCount',
                header: '참가팀',
                align: 'center',
                width: 'w-[80px]',
                render: (row) => (
                  <span className="tabular-nums text-[var(--text-muted)]">{row.registrationCount}</span>
                ),
              },
              {
                key: 'entryFee',
                header: '참가비',
                align: 'right',
                width: 'w-[112px]',
                render: (row) => (
                  <span className="tabular-nums whitespace-nowrap text-[var(--text-muted)]">
                    {formatCurrency(row.entryFee)}
                  </span>
                ),
              },
            ]}
            renderActions={(row) => (
              <Link
                href={`/admin/tournaments/${row.id}`}
                aria-label={`${row.title} 상세 보기`}
                className={[
                  'inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg',
                  'text-[var(--font-size-label)] font-medium text-[var(--text-muted)] bg-[var(--surface-soft)]',
                  'hover:bg-[var(--grey300)] transition-colors whitespace-nowrap',
                  'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                ].join(' ')}
              >
                상세 보기
              </Link>
            )}
            loading={isInitialLoad}
            empty={
              <AdminEmpty
                title="검색 결과가 없어요"
                description="필터를 변경해 보세요."
              />
            }
            error={errorMessage}
            onRetry={() => void refetch()}
            skeletonRows={8}
          />
        )}

        {/* Load more */}
        {/* 페이지 이동 실패는 목록이 비어 보이지 않으므로 따로 알린다. */}
        {isError && rows.length > 0 && (
          <div className="flex flex-col items-center gap-1.5">
            <p className="text-[var(--font-size-label)] text-[var(--red700)]" role="alert">
              {extractErrorMessage(error, '목록을 불러오지 못했어요.')}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className={[
                'h-[44px] px-6 rounded-xl text-[var(--font-size-label)] font-semibold transition-colors',
                'border border-[var(--border)] text-[var(--text-body)] bg-[var(--card-surface)] hover:bg-[var(--surface-soft)]',
                'disabled:opacity-50',
                'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
              ].join(' ')}
            >
              {isFetching ? '불러오는 중…' : '다시 시도'}
            </button>
          </div>
        )}

      </div>

      <AdminToasts toasts={toasts} />
    </>
  );
}
