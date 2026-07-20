'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Activity, Calendar, Clock, Eye, LogIn, Shield, UserRound } from 'lucide-react';
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
  AdminCardList,
  AdminReasonModal,
  AdminEmpty,
  AdminTableSkeleton,
  STATUS_META,
  useAdminToast,
  AdminToasts,
} from '@/components/admin';
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

function formatUserTitle(row: V1AdminUserRow): string {
  if (row.nickname || row.displayName) return row.nickname ?? row.displayName ?? '';
  if (row.onboardingStatus === 'social_terms_required') return '가입 진행 중 · 약관 미동의';
  if (row.onboardingStatus === 'social_profile_required') return '가입 진행 중 · 프로필 미완료';
  return '프로필 없음';
}

function formatGender(gender: V1AdminUserRow['gender']) {
  if (gender === 'male') return '남';
  if (gender === 'female') return '여';
  return '성별 미등록';
}

function formatAuthProviders(providers: V1AdminUserRow['authProviders']) {
  const labels = { kakao: '카카오', naver: '네이버', email: '이메일' } as const;
  const values = providers ?? [];
  return values.length > 0 ? values.map((provider) => labels[provider]).join(' · ') : '로그인 수단 없음';
}

function getTeamRoleCounts(row: V1AdminUserRow) {
  return {
    owner: row.teamRoleCounts?.owner ?? 0,
    manager: row.teamRoleCounts?.manager ?? 0,
    member: row.teamRoleCounts?.member ?? 0,
  };
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
  { value: 'withdrawal_pending', label: '탈퇴 대기' },
  { value: 'deleted', label: '삭제' },
];

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AdminUsersPage() {
  return (
    <Suspense fallback={null}>
      <AdminUsersPageContent />
    </Suspense>
  );
}

function AdminUsersPageContent() {
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
  const statusOptions = USER_STATUS_FILTER_OPTIONS.map((option) => ({
    ...option,
    count: option.value ? firstPage?.summary.byStatus[option.value] : firstPage?.summary.total,
  }));

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
          // Reset to first page so the updated row (incl. page2+ extras) is
          // re-fetched fresh instead of left stale in extraRows.
          setExtraRows([]);
          setNextCursor(null);
          showToast('회원 상태를 변경했어요.', 'success');
        },
        onError: (err) => {
          showToast(extractErrorMessage(err, '상태 변경에 실패했어요.'), 'error');
        },
      },
    );
  }

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
          statusOptions={statusOptions}
          activeStatus={activeStatus}
          onStatusChange={(v) => setActiveStatus(v)}
        />

        {/* Card list */}
        <AdminCardList<V1AdminUserRow>
          rows={rows}
          keyExtractor={(row) => row.userId}
          card={(row) => {
            const teamRoles = getTeamRoleCounts(row);
            return {
              title: formatUserTitle(row),
              subtitle: row.email ?? undefined,
              status: row.accountStatus,
              meta: [
                {
                  icon: <UserRound size={14} aria-hidden="true" />,
                  label: formatGender(row.gender),
                },
                ...(row.adminRole
                  ? [{ icon: <Shield size={14} aria-hidden="true" />, label: '운영자' }]
                  : []),
                {
                  icon: <LogIn size={14} aria-hidden="true" />,
                  label: formatAuthProviders(row.authProviders),
                },
                {
                  icon: <Activity size={14} aria-hidden="true" />,
                  label: `매치 ${row.hostedMatchCount} · 생성/소유 ${row.ownedTeamCount}`,
                },
                {
                  icon: <Shield size={14} aria-hidden="true" />,
                  label: `소속 ${row.membershipCount} · 팀장 ${teamRoles.owner}`,
                },
                {
                  icon: <Shield size={14} aria-hidden="true" />,
                  label: `운영진 ${teamRoles.manager} · 멤버 ${teamRoles.member}`,
                },
                {
                  icon: <Calendar size={14} aria-hidden="true" />,
                  label: formatDateCompact(row.createdAt),
                },
                {
                  icon: <Clock size={14} aria-hidden="true" />,
                  label: formatDateCompact(row.lastLoginAt),
                },
              ],
              tone:
              row.accountStatus === 'blocked' || row.accountStatus === 'deleted'
                ? 'danger'
                : row.accountStatus === 'suspended' || row.accountStatus === 'withdrawal_pending'
                  ? 'warning'
                  : undefined,
            };
          }}
          renderActions={(row) => (
            <>
              <Link
                href={`/admin/users/${row.userId}`}
                className={[
                  'inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-lg text-[var(--font-size-label)] font-medium',
                  'text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors whitespace-nowrap',
                  'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                ].join(' ')}
                aria-label={`${row.nickname ?? row.displayName ?? '회원'} 상세 보기`}
              >
                <Eye size={15} aria-hidden="true" />
                상세
              </Link>
              {canWrite ? (
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
                    aria-label={`${row.nickname ?? row.displayName ?? '회원'} 상태 변경`}
                  >
                    상태 변경
                  </button>
              ) : null}
            </>
          )}
          loading={isPending}
          empty={
            <AdminEmpty
              title="조건에 맞는 회원이 없어요"
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
