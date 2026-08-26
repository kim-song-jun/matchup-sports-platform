'use client';

import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, ShieldMinus, Shield, X, RotateCcw, Calendar, Clock, Activity } from 'lucide-react';
import {
  useV1AdminMe,
  useV1AdminAdmins,
  useV1AdminUsers,
  useV1GrantAdmin,
  useV1UpdateAdminRole,
} from '@/hooks/use-v1-api';
import { v1Get } from '@/lib/api-client';
import { formatAdminDate } from '@/lib/date-utils';
import { extractErrorMessage } from '@/lib/error-message';
import { useAdminListQuery } from '@/hooks/use-admin-list-query';
import {
  AdminPageHeader,
  AdminFilterBar,
  AdminDataTable,
  AdminReasonModal,
  AdminEmpty,
  AdminTableSkeleton,
  useAdminToast,
  AdminToasts,
} from '@/components/admin';
import { EntityPicker, type EntityPickerItem } from '@/components/admin/entity-picker';
import type { V1AdminRow, CursorPage } from '@/types/api';

const ADMIN_STATUS_FILTER_OPTIONS = [
  { value: '', label: '전체' },
  { value: 'active', label: '활성' },
  { value: 'suspended', label: '정지' },
  { value: 'revoked', label: '회수' },
];

function formatUserTitle(row: {
  nickname: string | null;
  displayName: string | null;
  onboardingStatus?: string | null;
}): string {
  if (row.nickname || row.displayName) return row.nickname ?? row.displayName ?? '';
  if (row.onboardingStatus === 'social_terms_required') return '가입 진행 중 · 약관 미동의';
  if (row.onboardingStatus === 'social_profile_required') return '가입 진행 중 · 프로필 미완료';
  return '프로필 없음';
}

// ── Role badge ─────────────────────────────────────────────────────────────
function AdminRoleBadge({ role }: { role: 'owner' | 'ops' | 'support' }) {
  if (role === 'owner') {
    return (
      <span className="inline-flex items-center gap-1 bg-[var(--blue50)] text-[var(--blue700)] text-[length:var(--font-size-micro)] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
        <ShieldCheck size={11} aria-hidden="true" />
        최고운영자
      </span>
    );
  }
  if (role === 'ops') {
    return (
      <span className="inline-flex items-center gap-1 bg-[var(--surface-soft)] text-[var(--text-body)] text-[length:var(--font-size-micro)] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
        <Shield size={11} aria-hidden="true" />
        운영
      </span>
    );
  }
  // support
  return (
    <span className="inline-flex items-center gap-1 bg-[var(--surface-soft)] text-[var(--text-muted)] text-[length:var(--font-size-micro)] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
      <ShieldMinus size={11} aria-hidden="true" />
      지원
    </span>
  );
}

// ── Backend 409 error code → human-readable message ───────────────────────
function resolveAdminErrorMessage(err: unknown, fallback: string): string {
  const raw = extractErrorMessage(err, '');
  if (!raw) return fallback;
  const code = raw.toUpperCase();
  if (code.includes('ALREADY_ADMIN')) return '이미 운영자예요.';
  if (code.includes('LAST_OWNER')) return '마지막 최고운영자는 변경할 수 없어요.';
  if (code.includes('SELF_MODIFICATION')) return '본인 권한은 변경할 수 없어요.';
  return raw || fallback;
}

// ── Grant modal (user-search + role + reason) ──────────────────────────────
interface GrantModalProps {
  open: boolean;
  onClose: () => void;
  onGrantSuccess: () => void;
}

function GrantModal({ open, onClose, onGrantSuccess }: GrantModalProps) {
  const [query, setQuery] = useState('');
  const [pickedUser, setPickedUser] = useState<EntityPickerItem | null>(null);
  const [role, setRole] = useState<'ops' | 'support'>('ops');
  const [reason, setReason] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  const grantMutation = useV1GrantAdmin();
  const { toasts, showToast } = useAdminToast();

  const { data: usersPage, isPending: usersPending } = useV1AdminUsers(
    query ? { q: query, limit: 10 } : undefined,
  );

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setPickedUser(null);
      setRole('ops');
      setReason('');
      const t = setTimeout(() => document.getElementById('grant-user-search')?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [open]);

  // ESC
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !grantMutation.isPending) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose, grantMutation.isPending]);

  // Focus trap
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const sel =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(sel));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [open]);

  // Body scroll lock
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  const trimmedReason = reason.trim();
  const canSubmit = !!pickedUser && trimmedReason.length > 0 && !grantMutation.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !pickedUser) return;
    grantMutation.mutate(
      { userId: pickedUser.id, adminRole: role, reason: trimmedReason },
      {
        onSuccess: () => {
          showToast('운영자를 추가했어요.', 'success');
          onGrantSuccess();
          onClose();
        },
        onError: (err) => {
          showToast(resolveAdminErrorMessage(err, '운영자 추가에 실패했어요.'), 'error');
        },
      },
    );
  }

  const userItems: EntityPickerItem[] = (usersPage?.items ?? []).map((user) => ({
    id: user.userId,
    label: user.adminRole ? `${formatUserTitle(user)} (이미 운영자)` : formatUserTitle(user),
    description: user.email ?? undefined,
  }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget && !grantMutation.isPending) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="grant-modal-title"
        className="bg-[var(--card-surface)] rounded-2xl shadow-[var(--shadow-modal)] w-full max-w-[480px] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 id="grant-modal-title" className="text-[16px] font-bold text-[var(--text-strong)]">
            운영자 추가
          </h2>
          <button
            type="button"
            onClick={() => !grantMutation.isPending && onClose()}
            disabled={grantMutation.isPending}
            aria-label="모달 닫기"
            className="flex items-center justify-center w-[44px] h-[44px] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-muted)] hover:bg-[var(--surface-soft)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-40"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="px-5 py-5 flex flex-col gap-4">
            {/* User search */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="grant-user-search" className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-body)]">
                회원 검색
              </label>
              <EntityPicker
                id="grant-user-search"
                value={pickedUser}
                onChange={setPickedUser}
                items={userItems}
                onSearch={setQuery}
                loading={usersPending}
                placeholder="닉네임 또는 이메일 검색"
                disabled={grantMutation.isPending}
                emptyText="결과가 없어요."
              />
            </div>

            {/* Role selection */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="grant-role" className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-body)]">
                부여할 역할
              </label>
              <select
                id="grant-role"
                value={role}
                onChange={(e) => setRole(e.target.value as 'ops' | 'support')}
                disabled={grantMutation.isPending}
                className={[
                  'h-[44px] px-3 text-sm bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)]',
                  'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
                  'transition-colors disabled:opacity-50',
                ].join(' ')}
              >
                <option value="ops">운영 — 상태 변경 등 쓰기 권한 포함</option>
                <option value="support">지원 — 읽기 전용</option>
              </select>
            </div>

            {/* Reason */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="grant-reason" className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-body)]">
                부여 사유{' '}
                <span className="text-red-500" aria-hidden="true">*</span>
                <span className="sr-only">(필수)</span>
              </label>
              <textarea
                id="grant-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                rows={3}
                disabled={grantMutation.isPending}
                placeholder="부여 사유를 입력해 주세요."
                className={[
                  'px-3 py-2.5 text-sm bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)] resize-none',
                  'placeholder:text-[var(--text-muted)]',
                  'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
                  'transition-colors disabled:opacity-50',
                ].join(' ')}
                aria-required="true"
              />
              <p className="text-[length:var(--font-size-micro)] text-right text-[var(--text-muted)] tabular-nums">
                {reason.length} / 500
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2 px-5 pb-5">
            <button
              type="button"
              onClick={() => !grantMutation.isPending && onClose()}
              disabled={grantMutation.isPending}
              className="flex-1 h-[48px] rounded-xl text-[length:var(--font-size-body)] font-semibold text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-[var(--grey300)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={[
                'flex-1 h-[48px] rounded-xl text-[length:var(--font-size-body)] font-semibold transition-colors',
                'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                canSubmit
                  ? 'bg-blue-500 text-white hover:bg-blue-600'
                  : 'bg-[var(--grey100)] text-[var(--text-caption)] cursor-not-allowed',
              ].join(' ')}
              aria-disabled={!canSubmit}
            >
              {grantMutation.isPending ? '처리 중…' : '운영자 추가'}
            </button>
          </div>
        </form>
      </div>

      {/* Inline toasts (inside modal) */}
      <AdminToasts toasts={toasts} />
    </div>
  );
}

// ── Role-change action modal state ─────────────────────────────────────────
type AdminAction = 'changeRole' | 'revoke' | 'reactivate';

interface ActionModalState {
  row: V1AdminRow;
  action: AdminAction;
}

const PAGE_SIZE = 20;

// ── Page ──────────────────────────────────────────────────────────────────
export default function AdminAdminsPage() {
  const { data: adminMe, isPending: mePending } = useV1AdminMe();

  // 검색 debounce·상태 필터·page 리셋·페이지네이션 조립은 공용 훅이 담당한다.
  // (이 페이지는 검색 미지원이라 hideSearch 유지 — 훅의 상태 필터·페이지 리셋만 쓴다.)
  const { activeStatus, setActiveStatus, filters, buildPagination } = useAdminListQuery({
    pageSize: PAGE_SIZE,
  });

  // Modal state
  const [grantModalOpen, setGrantModalOpen] = useState(false);
  const [actionModal, setActionModal] = useState<ActionModalState | null>(null);

  const { toasts, showToast } = useAdminToast();
  const updateAdminRole = useV1UpdateAdminRole();

  const {
    data: firstPage,
    isPending: listPending,
    isFetching: listFetching,
    isError,
    error,
    refetch,
  } = useV1AdminAdmins(filters);

  // ── Loading / gate states ────────────────────────────────────────────────
  if (mePending) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-[72px] bg-[var(--surface-soft)] rounded-xl animate-pulse" />
        <AdminTableSkeleton rows={5} />
      </div>
    );
  }

  // Owner-only gate: non-owners get access denied inside the page
  if (adminMe && adminMe.adminRole !== 'owner') {
    return (
      <AdminEmpty
        title="최고운영자 전용이에요"
        description="이 페이지는 최고운영자만 접근할 수 있어요. 권한을 확인해 주세요."
      />
    );
  }

  // ── Data ─────────────────────────────────────────────────────────────────
  const rows = firstPage?.items ?? [];
  const pageInfo = firstPage?.pageInfo;
  const statusOptions = ADMIN_STATUS_FILTER_OPTIONS.map((option) => ({
    ...option,
    count: option.value ? firstPage?.summary.byStatus[option.value] : firstPage?.summary.total,
  }));

  const myAdminUserId = adminMe?.adminUserId;

  // Role-change modal submit
  function handleActionSubmit(status: string, reason: string) {
    if (!actionModal) return;
    const { row, action } = actionModal;

    let vars: Parameters<typeof updateAdminRole.mutate>[0];
    if (action === 'revoke') {
      vars = { userId: row.userId, status: 'revoked', reason };
    } else if (action === 'reactivate') {
      vars = { userId: row.userId, status: 'active', reason };
    } else {
      // changeRole: status from the select (ops / support)
      vars = { userId: row.userId, adminRole: status as 'ops' | 'support', reason };
    }

    const successMessage =
      action === 'revoke' ? '권한을 회수했어요.' :
      action === 'reactivate' ? '권한을 재부여했어요.' :
      '역할을 변경했어요.';

    updateAdminRole.mutate(vars, {
      onSuccess: () => {
        setActionModal(null);
        showToast(successMessage, 'success');
      },
      onError: (err) => {
        showToast(resolveAdminErrorMessage(err, '처리에 실패했어요.'), 'error');
      },
    });
  }

  // Role change status options (only ops / support are assignable, not owner)
  const roleChangeOptions = [
    { value: 'ops', label: '운영' },
    { value: 'support', label: '지원' },
  ];

  const errorMessage = isError
    ? extractErrorMessage(error, '운영자 목록을 불러오지 못했어요.')
    : undefined;

  // Determine initial status option for action modal
  function actionModalConfig(modal: ActionModalState): {
    title: string;
    currentStatus?: string;
    statusOptions: { value: string; label: string }[];
  } {
    if (modal.action === 'revoke') {
      return {
        title: '운영자 회수',
        currentStatus: 'revoked',
        statusOptions: [{ value: 'revoked', label: '회수' }],
      };
    }
    if (modal.action === 'reactivate') {
      return {
        title: '권한 재부여',
        currentStatus: 'active',
        statusOptions: [{ value: 'active', label: '활성화' }],
      };
    }
    // changeRole
    return {
      title: '역할 변경',
      currentStatus: modal.row.adminRole === 'ops' ? 'support' : 'ops',
      statusOptions: roleChangeOptions,
    };
  }

  return (
    <>
      <AdminPageHeader
        eyebrow="설정"
        title="관리자 관리"
        description="운영자·지원 권한을 부여하고 관리해요."
        action={
          <button
            type="button"
            onClick={() => setGrantModalOpen(true)}
            className={[
              'inline-flex items-center justify-center gap-1.5 min-h-[44px] px-5 rounded-xl',
              'bg-blue-500 hover:bg-blue-600 text-white text-[length:var(--font-size-body-sm)] font-semibold',
              'transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
            ].join(' ')}
          >
            <ShieldCheck size={16} aria-hidden="true" />
            운영자 추가
          </button>
        }
      />

      <div className="flex flex-col gap-4">
        <AdminFilterBar hideSearch searchValue={''} onSearchChange={() => undefined} statusOptions={statusOptions} activeStatus={activeStatus} onStatusChange={setActiveStatus} />

        {/* Card list */}
        <AdminDataTable<V1AdminRow>
          rows={rows}
          keyExtractor={(row) => row.adminUserId}
          tableMaxWidth="max-w-none"
          rowTone={(row) =>
            row.status === 'revoked' ? 'danger' : row.status === 'suspended' ? 'warning' : undefined
          }
          columns={[
            {
              key: 'user',
              header: '운영자',
              render: (row) => (
                <div className="min-w-0">
                  <span className="block truncate font-medium text-[var(--text-strong)]">
                    {formatUserTitle(row)}
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
              key: 'adminRole',
              header: '권한',
              width: 'w-[112px]',
              render: (row) => <AdminRoleBadge role={row.adminRole} />,
            },
            {
              key: 'status',
              header: '상태',
              width: 'w-[88px]',
              render: (row) => (
                <span className="text-[var(--text-muted)]">
                  {row.status === 'active' ? '활성' : row.status === 'revoked' ? '회수됨' : '정지'}
                </span>
              ),
            },
            {
              key: 'grantedAt',
              header: '부여',
              width: 'w-[112px]',
              render: (row) => (
                <span className="whitespace-nowrap text-[var(--text-muted)]">
                  {formatAdminDate(row.grantedAt)}
                </span>
              ),
            },
            {
              key: 'revokedAt',
              header: '회수',
              width: 'w-[112px]',
              render: (row) => (
                <span className="whitespace-nowrap text-[var(--text-muted)]">
                  {row.revokedAt ? formatAdminDate(row.revokedAt) : '—'}
                </span>
              ),
            },
          ]}
          renderActions={(row) => {
            // Hide actions for owner rows — owner role cannot be changed via UI
            if (row.adminRole === 'owner') return null;
            // Hide actions for own row (self-modification guard)
            if (row.adminUserId === myAdminUserId) return null;

            return (
              <div className="flex items-center gap-1.5 w-full">
                {row.status === 'active' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setActionModal({ row, action: 'changeRole' })}
                      className={[
                        'inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg text-[length:var(--font-size-label)] font-medium',
                        'text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-[var(--grey300)] transition-colors whitespace-nowrap',
                        'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                      ].join(' ')}
                      aria-label={`${row.nickname ?? '운영자'} 역할 변경`}
                    >
                      역할 변경
                    </button>
                    <button
                      type="button"
                      onClick={() => setActionModal({ row, action: 'revoke' })}
                      className={[
                        'inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg text-[length:var(--font-size-label)] font-medium',
                        'text-[var(--red700)] bg-[var(--red50)] hover:bg-[var(--red100)] transition-colors whitespace-nowrap',
                        'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                      ].join(' ')}
                      aria-label={`${row.nickname ?? '운영자'} 권한 회수`}
                    >
                      회수
                    </button>
                  </>
                )}
                {row.status !== 'active' && (
                  <button
                    type="button"
                    onClick={() => setActionModal({ row, action: 'reactivate' })}
                    className={[
                      'inline-flex items-center justify-center gap-1 min-h-[44px] px-3 rounded-lg text-[length:var(--font-size-label)] font-medium',
                      'text-[var(--blue700)] bg-[var(--blue50)] hover:bg-[var(--blue100)] transition-colors whitespace-nowrap',
                      'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                    ].join(' ')}
                    aria-label={`${row.nickname ?? '운영자'} 권한 재부여`}
                  >
                    <RotateCcw size={13} aria-hidden="true" />
                    재부여
                  </button>
                )}
              </div>
            );
          }}
          loading={listPending && rows.length === 0}
          empty={
            <AdminEmpty
              title="운영자가 없어요"
              description="운영자 추가 버튼을 눌러 운영자를 등록해 보세요."
            />
          }
          error={errorMessage}
          onRetry={() => void refetch()}
          skeletonRows={5}
          pagination={buildPagination(pageInfo, listFetching)}
        />
      </div>

      {/* Grant modal */}
      <GrantModal
        open={grantModalOpen}
        onClose={() => setGrantModalOpen(false)}
        onGrantSuccess={() => {
          void refetch();
        }}
      />

      {/* Role-change / revoke / reactivate modal */}
      {actionModal && (
        <AdminReasonModal
          open={true}
          {...actionModalConfig(actionModal)}
          onSubmit={handleActionSubmit}
          onClose={() => {
            if (!updateAdminRole.isPending) setActionModal(null);
          }}
          pending={updateAdminRole.isPending}
        />
      )}

      {/* Toasts */}
      <AdminToasts toasts={toasts} />
    </>
  );
}
