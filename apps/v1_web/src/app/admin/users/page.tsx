'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import {
  useV1AdminMe,
  useV1AdminUsers,
  useV1ChangeUserStatus,
} from '@/hooks/use-v1-api';
import { v1Get } from '@/lib/api-client';
import { extractErrorMessage } from '@/lib/error-message';
import {
  AdminPageHeader,
  AdminFilterBar,
  AdminDataTable,
  AdminStatusPill,
  AdminReasonModal,
  AdminEmpty,
  AdminTableSkeleton,
  STATUS_META,
  useAdminToast,
  AdminToasts,
} from '@/components/admin';
import type { AdminTableColumn } from '@/components/admin';
import type { V1AdminUserRow, CursorPage } from '@/types/api';

// ── Date formatter ────────────────────────────────────────────────────────────
function formatDateCompact(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}.${mo}.${day}`;
  } catch {
    return dateStr ?? '—';
  }
}

// ── Status options for moderation modal ──────────────────────────────────────
const USER_STATUS_OPTIONS = (
  ['active', 'suspended', 'blocked', 'deleted'] as const
).map((v) => ({
  value: v,
  label: STATUS_META[v]?.label ?? v,
}));

// ── Status filter chips ───────────────────────────────────────────────────────
const USER_STATUS_FILTER_OPTIONS = [
  { value: '', label: '전체' },
  { value: 'active', label: '활성' },
  { value: 'suspended', label: '정지' },
  { value: 'blocked', label: '차단' },
  { value: 'withdrawal_pending', label: '탈퇴대기' },
  { value: 'deleted', label: '삭제' },
];

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AdminUsersPage() {
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get('status') ?? '';

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeStatus, setActiveStatus] = useState(initialStatus);

  // Accumulated rows across cursor pages
  const [extraRows, setExtraRows] = useState<V1AdminUserRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<V1AdminUserRow | null>(null);

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
  } = useV1AdminUsers(filters);

  // Sync cursor from first page
  useEffect(() => {
    if (firstPage) {
      setNextCursor(
        firstPage.nextCursor ?? firstPage.pageInfo?.nextCursor ?? null,
      );
    }
  }, [firstPage]);

  // Mutation
  const changeStatusMutation = useV1ChangeUserStatus();

  // Combined rows: first page + loaded extras
  const firstRows = firstPage?.items ?? [];
  const rows = [...firstRows, ...extraRows];

  // Load more handler
  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await v1Get<CursorPage<V1AdminUserRow>>('/admin/users', {
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
      { id: selectedRow.userId, status, reason },
      {
        onSuccess: () => {
          setModalOpen(false);
          setSelectedRow(null);
          showToast('처리했어요.', 'success');
        },
        onError: (err) => {
          showToast(extractErrorMessage(err, '상태 변경에 실패했어요.'), 'error');
        },
      },
    );
  }

  // Table column definitions
  const columns: AdminTableColumn<V1AdminUserRow>[] = [
    {
      key: 'member',
      header: '회원',
      render: (row) => (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-900 text-[14px]">
              {row.nickname ?? row.displayName ?? '(이름 없음)'}
            </span>
            {row.adminRole && (
              <span className="inline-flex items-center gap-0.5 bg-blue-50 text-blue-700 text-[11px] font-semibold px-1.5 py-0.5 rounded-full">
                <ShieldCheck size={10} aria-hidden="true" />
                운영자
              </span>
            )}
          </div>
          {row.email && (
            <span className="text-[12px] text-gray-400">{row.email}</span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: '상태',
      render: (row) => <AdminStatusPill status={row.accountStatus} />,
    },
    {
      key: 'activity',
      header: '활동',
      render: (row) => (
        <span className="text-[13px] text-gray-600 tabular-nums">
          매치 {row.hostedMatchCount} · 팀 {row.ownedTeamCount}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: '가입일',
      render: (row) => (
        <span className="text-[13px] text-gray-500 tabular-nums whitespace-nowrap">
          {formatDateCompact(row.createdAt)}
        </span>
      ),
    },
    {
      key: 'lastLoginAt',
      header: '최근 접속',
      render: (row) => (
        <span className="text-[13px] text-gray-500 tabular-nums whitespace-nowrap">
          {formatDateCompact(row.lastLoginAt)}
        </span>
      ),
    },
  ];

  const errorMessage = isError
    ? extractErrorMessage(error, '회원 목록을 불러오지 못했어요.')
    : undefined;

  return (
    <>
      <AdminPageHeader
        title="회원 관리"
        description="플랫폼 전체 회원의 상태를 검색하고 관리해요."
      />

      <div className="flex flex-col gap-4">
        {/* Filter bar */}
        <AdminFilterBar
          searchLabel="닉네임·이메일 검색"
          searchPlaceholder="닉네임·이메일 검색"
          searchValue={search}
          onSearchChange={setSearch}
          statusOptions={USER_STATUS_FILTER_OPTIONS}
          activeStatus={activeStatus}
          onStatusChange={(v) => setActiveStatus(v)}
        />

        {/* Data table */}
        <AdminDataTable<V1AdminUserRow>
          columns={columns}
          rows={rows}
          keyExtractor={(row) => row.userId}
          actionsHeader="작업"
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
                      'inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg text-[13px] font-medium',
                      'text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors whitespace-nowrap',
                      'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                    ].join(' ')}
                    aria-label={`${row.nickname ?? row.displayName ?? '회원'} 상태 변경`}
                  >
                    상태 변경
                  </button>
                )
              : undefined
          }
          loading={isPending}
          empty={
            <AdminEmpty
              title="조건에 맞는 회원이 없어요"
              description="검색어나 상태 필터를 변경해 보세요."
            />
          }
          error={errorMessage}
          onRetry={() => void refetch()}
          skeletonRows={8}
        />

        {/* Load more trigger */}
        {nextCursor && !isPending && !isError && !loadingMore && (
          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={() => void loadMore()}
              className={[
                'h-[44px] px-6 rounded-xl text-[14px] font-semibold transition-colors',
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
        title="회원 상태 변경"
        currentStatus={selectedRow?.accountStatus}
        statusOptions={USER_STATUS_OPTIONS}
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
