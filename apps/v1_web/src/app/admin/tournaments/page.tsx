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
  AdminCardList,
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

  // ── Cursor pagination ────────────────────────────────────────────────
  const [cursor, setCursor] = useState<string | null>(null);
  const [accumulatedRows, setAccumulatedRows] = useState<V1Tournament[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const { toasts, showToast: _showToast } = useAdminToast();
  // showToast is available for future use (e.g. after bulk actions)

  const handleStatusChange = (value: string) => {
    setActiveStatus(value);
    setAccumulatedRows([]);
    setCursor(null);
    setNextCursor(null);
  };

  const filters = {
    ...(activeStatus ? { status: activeStatus as V1TournamentStatus } : {}),
    ...(cursor ? { cursor } : {}),
    limit: 20,
  };

  const { data, isPending, isFetching, isError, error, refetch } =
    useV1AdminTournaments(filters);

  useEffect(() => {
    if (!data?.items) return;
    if (!cursor) {
      setAccumulatedRows(data.items);
    } else {
      setAccumulatedRows((prev) => [...prev, ...data.items]);
    }
    setNextCursor(data.pageInfo?.nextCursor ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const hasMore = !!nextCursor;
  const loadMoreFailed = isError && accumulatedRows.length > 0;

  const handleLoadMore = () => {
    if (nextCursor) setCursor(nextCursor);
  };

  const isInitialLoad = isPending && accumulatedRows.length === 0;

  const errorMessage =
    isError && accumulatedRows.length === 0
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
          statusOptions={STATUS_OPTIONS}
          activeStatus={activeStatus}
          onStatusChange={handleStatusChange}
        />

        {/* Card list */}
        {isInitialLoad ? (
          <AdminTableSkeleton rows={8} />
        ) : (
          <AdminCardList<V1Tournament>
            rows={accumulatedRows}
            keyExtractor={(r) => r.id}
            card={(row) => ({
              title: row.title,
              subtitle: row.venue ?? undefined,
              status: row.status,
              meta: [
                {
                  icon: <Calendar size={14} aria-hidden="true" />,
                  label: formatDateRange(row.scheduledAt, row.scheduledEndAt),
                },
                {
                  icon: <Clock size={14} aria-hidden="true" />,
                  label: `마감 ${formatDate(row.registrationDeadlineAt)}`,
                },
                {
                  icon: <Users size={14} aria-hidden="true" />,
                  label: `${row.registrationCount}팀`,
                },
                {
                  icon: <Coins size={14} aria-hidden="true" />,
                  label: formatCurrency(row.entryFee),
                },
              ],
              tone:
                row.status === 'cancelled'
                  ? 'danger'
                  : row.status === 'closed'
                    ? 'warning'
                    : undefined,
            })}
            renderActions={(row) => (
              <Link
                href={`/admin/tournaments/${row.id}`}
                aria-label={`${row.title} 상세 보기`}
                className={[
                  'inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg',
                  'text-[var(--font-size-label)] font-medium text-gray-600 bg-gray-100',
                  'hover:bg-gray-200 transition-colors whitespace-nowrap',
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
            skeletonCards={8}
          />
        )}

        {/* Load more */}
        {hasMore && !isInitialLoad && (
          <div className="flex flex-col items-center gap-1.5">
            {loadMoreFailed && (
              <p className="text-[var(--font-size-label)] text-red-500" role="alert">
                {extractErrorMessage(error, '다음 목록을 불러오지 못했어요.')}
              </p>
            )}
            <button
              type="button"
              onClick={loadMoreFailed ? () => void refetch() : handleLoadMore}
              disabled={isFetching}
              className={[
                'h-[44px] px-6 rounded-xl text-[var(--font-size-label)] font-semibold transition-colors',
                'border border-gray-200 text-gray-700 bg-white hover:bg-gray-50',
                'disabled:opacity-50',
                'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
              ].join(' ')}
            >
              {isFetching ? '불러오는 중…' : loadMoreFailed ? '다시 시도' : '더 보기'}
            </button>
          </div>
        )}

        {/* Loading more skeleton */}
        {isFetching && !isInitialLoad && <AdminTableSkeleton rows={4} />}
      </div>

      <AdminToasts toasts={toasts} />
    </>
  );
}
