'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
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
  AdminEmpty,
  AdminTableSkeleton,
  AdminToasts,
  useAdminToast,
} from '@/components/admin';
import type { AdminTableColumn } from '@/components/admin';

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

  // ── Table columns ────────────────────────────────────────────────────
  const columns: AdminTableColumn<V1Tournament>[] = [
    {
      key: 'title',
      header: '대회명',
      render: (row) => (
        <Link
          href={`/admin/tournaments/${row.id}`}
          className="font-medium text-gray-900 hover:text-blue-600 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
        >
          {row.title}
        </Link>
      ),
    },
    {
      key: 'status',
      header: '상태',
      render: (row) => (
        <AdminStatusPill status={row.status} />
      ),
    },
    {
      key: 'scheduledAt',
      header: '대회 일정',
      render: (row) => (
        <span className="text-gray-600 tabular-nums">{formatDate(row.scheduledAt)}</span>
      ),
    },
    {
      key: 'registrationDeadlineAt',
      header: '신청 마감',
      render: (row) => (
        <span className="text-gray-600 tabular-nums">
          {formatDate(row.registrationDeadlineAt)}
        </span>
      ),
    },
    {
      key: 'entryFee',
      header: '참가비',
      align: 'right',
      render: (row) => (
        <span className="text-gray-600 tabular-nums">{formatCurrency(row.entryFee)}</span>
      ),
    },
    {
      key: 'registrationCount',
      header: '신청 수',
      align: 'right',
      render: (row) => (
        <span className="text-gray-600 tabular-nums">{row.registrationCount}팀</span>
      ),
    },
  ];

  const isInitialLoad = isPending && accumulatedRows.length === 0;

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
              className="inline-flex items-center gap-1.5 h-[44px] px-4 rounded-xl text-[14px] font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
              aria-label="새 대회 만들기"
            >
              <Plus size={16} aria-hidden="true" />
              대회 만들기
            </Link>
          ) : undefined
        }
      />

      {/* Status chip filter — no search box (backend has no q for tournaments) */}
      <div className="mb-4">
        <div role="group" aria-label="상태 필터" className="flex items-center gap-1.5 flex-wrap">
          {STATUS_OPTIONS.map((opt) => {
            const active = activeStatus === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleStatusChange(opt.value)}
                aria-pressed={active}
                className={[
                  'inline-flex items-center px-3 h-[34px] rounded-full text-[13px] font-medium transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                  active
                    ? 'bg-blue-500 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600',
                ].join(' ')}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Data table */}
      {isInitialLoad ? (
        <AdminTableSkeleton cols={6} />
      ) : isError && accumulatedRows.length === 0 ? (
        <AdminDataTable<V1Tournament>
          columns={columns}
          rows={[]}
          keyExtractor={(r) => r.id}
          error={extractErrorMessage(error, '대회 목록을 불러오지 못했어요.')}
          onRetry={() => void refetch()}
        />
      ) : (
        <AdminDataTable<V1Tournament>
          columns={columns}
          rows={accumulatedRows}
          keyExtractor={(r) => r.id}
          actionsHeader="상세"
          renderActions={(row) => (
            <Link
              href={`/admin/tournaments/${row.id}`}
              aria-label={`${row.title} 상세 보기`}
              className="inline-flex items-center min-h-[44px] px-3 rounded-lg text-[13px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 whitespace-nowrap"
            >
              상세 보기
            </Link>
          )}
          empty={
            <AdminEmpty
              title="검색 결과가 없어요"
              description="필터를 변경해 보세요."
            />
          }
        />
      )}

      {/* Load more */}
      {hasMore && !isInitialLoad && (
        <div className="mt-4 flex flex-col items-center gap-1.5">
          {loadMoreFailed && (
            <p className="text-[13px] text-red-500" role="alert">
              {extractErrorMessage(error, '다음 목록을 불러오지 못했어요.')}
            </p>
          )}
          <button
            type="button"
            onClick={loadMoreFailed ? () => void refetch() : handleLoadMore}
            disabled={isFetching}
            className="inline-flex items-center h-[44px] px-6 rounded-xl text-[14px] font-medium text-gray-700 bg-white border border-gray-200 hover:border-gray-300 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            {isFetching ? '불러오는 중…' : loadMoreFailed ? '다시 시도' : '더 보기'}
          </button>
        </div>
      )}

      <AdminToasts toasts={toasts} />
    </>
  );
}
