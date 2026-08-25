'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye } from 'lucide-react';
import {
  useV1AdminMe,
  useV1AdminUsers,
  useV1ChangeUserStatus,
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
  AdminTableSkeleton,
  STATUS_META,
  useAdminToast,
  AdminToasts,
} from '@/components/admin';
import type { V1AdminUserRow } from '@/types/api';

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

const PAGE_SIZE = 20;

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AdminUsersPage() {
  return (
    <Suspense fallback={null}>
      <AdminUsersPageContent />
    </Suspense>
  );
}

function AdminUsersPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get('status') ?? '';

  // 검색 debounce·상태 필터·page=1 리셋·페이지네이션 조립은 공용 훅이 담당한다.
  // (커서 누적 대신 페이지 단위 교체 — 회원 목록은 "몇 명 중 어디쯤"이 보여야 한다.)
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
  const [selectedRow, setSelectedRow] = useState<V1AdminUserRow | null>(null);

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
  } = useV1AdminUsers(filters);

  // Mutation
  const changeStatusMutation = useV1ChangeUserStatus();

  const rows = firstPage?.items ?? [];
  const pageInfo = firstPage?.pageInfo;
  const statusOptions = USER_STATUS_FILTER_OPTIONS.map((option) => ({
    ...option,
    count: option.value ? firstPage?.summary.byStatus[option.value] : firstPage?.summary.total,
  }));

  // Submit moderation modal
  function handleModalSubmit(status: string, reason: string) {
    if (!selectedRow) return;
    changeStatusMutation.mutate(
      { id: selectedRow.userId, status, reason },
      {
        onSuccess: () => {
          setModalOpen(false);
          setSelectedRow(null);
          // 방금 바꾼 행이 최신 상태로 다시 그려지도록 첫 페이지부터 받아온다.
          resetToFirstPage();
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
        eyebrow="플랫폼"
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
        {/* 회원 한 명에 8개 지표가 붙는데 카드 2열로는 값이 서로 붙어 읽히지 않았다.
            숫자는 컬럼으로 세워야 회원 간 비교가 된다. */}
        <AdminDataTable<V1AdminUserRow>
          rows={rows}
          keyExtractor={(row) => row.userId}
          // 자매 목록(matches·team-matches)과 같은 행 진입 계약 — "상세" 버튼으로만
          // 진입 가능하던 유일한 목록 2개(users·teams) 중 하나였다.
          onRowClick={(row) => router.push(`/admin/users/${encodeURIComponent(row.userId)}`)}
          rowClickLabel={(row) => `${formatUserTitle(row)} 상세 보기`}
          tableMaxWidth="max-w-none"
          rowTone={(row) =>
            row.accountStatus === 'blocked' || row.accountStatus === 'deleted'
              ? 'danger'
              : row.accountStatus === 'suspended' || row.accountStatus === 'withdrawal_pending'
                ? 'warning'
                : undefined
          }
          columns={[
            {
              key: 'user',
              header: '회원',
              render: (row) => (
                <div className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-medium text-[var(--text-strong)]">{formatUserTitle(row)}</span>
                    {row.adminRole ? (
                      <span className="shrink-0 rounded bg-[var(--blue50)] px-1.5 py-0.5 text-[length:var(--font-size-micro)] font-semibold text-[var(--blue700)]">
                        운영자
                      </span>
                    ) : null}
                  </span>
                  {row.email ? (
                    <span className="block truncate text-[length:var(--font-size-micro)] text-[var(--text-muted)]" title={row.email}>
                      {row.email}
                    </span>
                  ) : null}
                </div>
              ),
            },
            {
              key: 'accountStatus',
              header: '상태',
              width: 'w-[104px]',
              render: (row) => <AdminStatusPill status={row.accountStatus} />,
            },
            {
              key: 'gender',
              header: '성별',
              width: 'w-[72px]',
              render: (row) => <span className="text-[var(--text-muted)]">{formatGender(row.gender)}</span>,
            },
            {
              key: 'authProviders',
              header: '로그인',
              width: 'w-[124px]',
              render: (row) => (
                <span className="block truncate text-[var(--text-muted)]" title={formatAuthProviders(row.authProviders)}>
                  {formatAuthProviders(row.authProviders)}
                </span>
              ),
            },
            {
              key: 'activity',
              header: '매치 / 소유팀',
              align: 'center',
              width: 'w-[110px]',
              render: (row) => (
                <span className="tabular-nums whitespace-nowrap text-[var(--text-muted)]">
                  {row.hostedMatchCount} / {row.ownedTeamCount}
                </span>
              ),
            },
            {
              key: 'membership',
              header: '소속 (팀장/운영진/멤버)',
              align: 'center',
              width: 'w-[168px]',
              render: (row) => {
                const teamRoles = getTeamRoleCounts(row);
                return (
                  <span className="tabular-nums whitespace-nowrap text-[var(--text-muted)]">
                    {row.membershipCount}
                    <span className="text-gray-400">
                      {' '}
                      ({teamRoles.owner}/{teamRoles.manager}/{teamRoles.member})
                    </span>
                  </span>
                );
              },
            },
            {
              key: 'createdAt',
              header: '가입',
              width: 'w-[104px]',
              render: (row) => (
                <span className="whitespace-nowrap text-[var(--text-muted)]">{formatDateCompact(row.createdAt)}</span>
              ),
            },
            {
              key: 'lastLoginAt',
              header: '최근 로그인',
              width: 'w-[112px]',
              render: (row) => (
                <span className="whitespace-nowrap text-[var(--text-muted)]">{formatDateCompact(row.lastLoginAt)}</span>
              ),
            },
          ]}
          renderActions={(row) => (
            <>
              <Link
                href={`/admin/users/${row.userId}`}
                className={[
                  'inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-lg text-[length:var(--font-size-label)] font-medium',
                  'text-[var(--blue700)] bg-[var(--blue50)] hover:bg-[var(--blue100)] transition-colors whitespace-nowrap',
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
                      'inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg text-[length:var(--font-size-label)] font-medium',
                      'text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-[var(--border)] transition-colors whitespace-nowrap',
                      'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                    ].join(' ')}
                    aria-label={`${row.nickname ?? row.displayName ?? '회원'} 상태 변경`}
                  >
                    상태 변경
                  </button>
              ) : null}
            </>
          )}
          loading={isPending && rows.length === 0}
          empty={
            <AdminEmpty
              title="조건에 맞는 회원이 없어요"
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
