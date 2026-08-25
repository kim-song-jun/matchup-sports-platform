'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Plus, Calendar, Clock, Users, Coins } from 'lucide-react';
import {
  useV1AdminTournaments,
  useV1AdminMe,
} from '@/hooks/use-v1-api';
import type { V1Tournament } from '@/types/api';
import { formatAdminDateTimeShort, formatEntryFee } from '@/lib/date-utils';
import { extractErrorMessage } from '@/lib/error-message';
import { useAdminListQuery } from '@/hooks/use-admin-list-query';
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
import { MockSeedPanel } from '@/components/admin/tournaments/mock-seed-panel';

// ── Helpers ───────────────────────────────────────────────────────────────

function formatDateRange(startStr: string | null, endStr: string | null): string {
  const start = formatAdminDateTimeShort(startStr);
  if (start === '—') return start;
  const end = formatAdminDateTimeShort(endStr);
  if (end === '—' || end === start) return start;
  return `${start} ~ ${end}`;
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

  // 검색 debounce·상태 필터·page 리셋은 공용 훅이 담당 (M1 표준 — users/teams와 동일)
  const { search, setSearch, activeStatus, setActiveStatus, filters, buildPagination } =
    useAdminListQuery({ pageSize: PAGE_SIZE });

  // URL pre-selection on mount (?status= 딥링크 — 기존 동작 유지)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get('status') ?? '';
    if (s) setActiveStatus(s);
  }, [setActiveStatus]);

  const { toasts, showToast: _showToast } = useAdminToast();
  // showToast is available for future use (e.g. after bulk actions)

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
      <MockSeedPanel />
      <AdminPageHeader
        eyebrow="플랫폼"
        title="대회 관리"
        description="플랫폼 내 모든 대회의 상태를 필터링하고 관리해요."
        action={
          canWrite ? (
            <Link
              href="/admin/tournaments/new"
              className="inline-flex items-center gap-1.5 h-[44px] px-4 rounded-xl text-[length:var(--font-size-label)] font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
              aria-label="새 대회 만들기"
            >
              <Plus size={16} aria-hidden="true" />
              대회 만들기
            </Link>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-4">
        {/* "backend has no q" 주석 때문에 검색이 죽어 있었다 — 백엔드는 처음부터
            q(제목 contains, insensitive)를 지원한다. tournaments-admin.service.ts list 참조 */}
        <AdminFilterBar
          searchLabel="대회명 검색"
          searchPlaceholder="대회명 검색"
          searchValue={search}
          onSearchChange={setSearch}
          statusOptions={statusOptions}
          activeStatus={activeStatus}
          onStatusChange={setActiveStatus}
        />

        {/* Card list */}
        {isInitialLoad ? (
          <AdminTableSkeleton rows={8} />
        ) : (
          <AdminDataTable<V1Tournament>
            rows={rows}
            keyExtractor={(r) => r.id}
            pagination={buildPagination(pageInfo, isFetching)}
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
                      <span className="block truncate text-[length:var(--font-size-micro)] text-[var(--text-muted)]">
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
                    {formatAdminDateTimeShort(row.registrationDeadlineAt)}
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
                    {formatEntryFee(row.entryFee)}
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
                  'text-[length:var(--font-size-label)] font-medium text-[var(--text-muted)] bg-[var(--surface-soft)]',
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
            <p className="text-[length:var(--font-size-label)] text-[var(--red700)]" role="alert">
              {extractErrorMessage(error, '목록을 불러오지 못했어요.')}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className={[
                'h-[44px] px-6 rounded-xl text-[length:var(--font-size-label)] font-semibold transition-colors',
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
