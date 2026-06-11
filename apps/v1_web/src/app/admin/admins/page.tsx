'use client';

import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, ShieldMinus, Shield, X, Search, RotateCcw } from 'lucide-react';
import {
  useV1AdminMe,
  useV1AdminAdmins,
  useV1AdminUsers,
  useV1GrantAdmin,
  useV1UpdateAdminRole,
} from '@/hooks/use-v1-api';
import { v1Get } from '@/lib/api-client';
import { extractErrorMessage } from '@/lib/error-message';
import {
  AdminPageHeader,
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
import type { V1AdminRow, V1AdminUserRow, CursorPage } from '@/types/api';

// ── Date formatter ─────────────────────────────────────────────────────────
function formatDateCompact(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}.${mo}.${day}`;
  } catch {
    return '—';
  }
}

// ── Role badge ─────────────────────────────────────────────────────────────
function AdminRoleBadge({ role }: { role: 'owner' | 'ops' | 'support' }) {
  if (role === 'owner') {
    return (
      <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
        <ShieldCheck size={11} aria-hidden="true" />
        최고운영자
      </span>
    );
  }
  if (role === 'ops') {
    return (
      <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
        <Shield size={11} aria-hidden="true" />
        운영
      </span>
    );
  }
  // support
  return (
    <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
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
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<V1AdminUserRow | null>(null);
  const [role, setRole] = useState<'ops' | 'support'>('ops');
  const [reason, setReason] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  const grantMutation = useV1GrantAdmin();
  const { toasts, showToast } = useAdminToast();

  // Debounce user search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: usersPage, isPending: usersPending } = useV1AdminUsers(
    debouncedSearch ? { q: debouncedSearch, limit: 10 } : undefined,
  );

  // Reset on open
  useEffect(() => {
    if (open) {
      setSearch('');
      setDebouncedSearch('');
      setSelectedUser(null);
      setRole('ops');
      setReason('');
      const t = setTimeout(() => firstInputRef.current?.focus(), 60);
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
  const canSubmit = !!selectedUser && trimmedReason.length > 0 && !grantMutation.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !selectedUser) return;
    grantMutation.mutate(
      { userId: selectedUser.userId, adminRole: role, reason: trimmedReason },
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

  const userResults = debouncedSearch ? (usersPage?.items ?? []) : [];

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
        className="bg-white rounded-2xl shadow-[0_8px_32px_rgba(20,28,45,0.14)] w-full max-w-[480px] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 id="grant-modal-title" className="text-[16px] font-bold text-gray-900">
            운영자 추가
          </h2>
          <button
            type="button"
            onClick={() => !grantMutation.isPending && onClose()}
            disabled={grantMutation.isPending}
            aria-label="모달 닫기"
            className="flex items-center justify-center w-[44px] h-[44px] rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-40"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="px-5 py-5 flex flex-col gap-4">
            {/* User search */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="grant-user-search" className="text-[13px] font-semibold text-gray-700">
                회원 검색
              </label>
              {selectedUser ? (
                <div className="flex items-center justify-between h-[44px] px-3 bg-blue-50 border border-blue-200 rounded-xl">
                  <div className="flex flex-col">
                    <span className="text-[13px] font-semibold text-blue-800">
                      {selectedUser.nickname ?? selectedUser.displayName ?? '(이름 없음)'}
                    </span>
                    {selectedUser.email && (
                      <span className="text-[11px] text-blue-600">{selectedUser.email}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUser(null);
                      setSearch('');
                      setDebouncedSearch('');
                    }}
                    aria-label="선택 해제"
                    className="flex items-center justify-center w-[32px] h-[32px] rounded-lg text-blue-400 hover:text-blue-600 hover:bg-blue-100 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                    <Search size={16} aria-hidden="true" />
                  </div>
                  <input
                    id="grant-user-search"
                    ref={firstInputRef}
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="닉네임 또는 이메일 검색"
                    disabled={grantMutation.isPending}
                    className={[
                      'w-full h-[44px] pl-9 pr-3 text-sm bg-white border border-gray-200 rounded-xl text-gray-900',
                      'placeholder:text-gray-400',
                      'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
                      'transition-colors disabled:opacity-50',
                    ].join(' ')}
                    autoComplete="off"
                  />
                  {/* Search results dropdown */}
                  {debouncedSearch && (
                    <div className="absolute left-0 right-0 top-[48px] bg-white border border-gray-200 rounded-xl shadow-md z-10 overflow-hidden max-h-[240px] overflow-y-auto">
                      {usersPending ? (
                        <p className="px-4 py-3 text-[13px] text-gray-400">검색 중…</p>
                      ) : userResults.length === 0 ? (
                        <p className="px-4 py-3 text-[13px] text-gray-400">결과가 없어요.</p>
                      ) : (
                        <ul role="listbox" aria-label="회원 검색 결과">
                          {userResults.map((user) => (
                            <li key={user.userId} role="option" aria-selected={false}>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedUser(user);
                                  setSearch('');
                                  setDebouncedSearch('');
                                }}
                                className={[
                                  'w-full flex flex-col items-start px-4 py-2.5 min-h-[44px] text-left',
                                  'hover:bg-blue-50 transition-colors',
                                  'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-[-2px]',
                                ].join(' ')}
                              >
                                <span className="text-[13px] font-semibold text-gray-900">
                                  {user.nickname ?? user.displayName ?? '(이름 없음)'}
                                  {user.adminRole && (
                                    <span className="ml-1.5 text-[11px] text-blue-600 font-medium">
                                      (이미 운영자)
                                    </span>
                                  )}
                                </span>
                                {user.email && (
                                  <span className="text-[12px] text-gray-400">{user.email}</span>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Role selection */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="grant-role" className="text-[13px] font-semibold text-gray-700">
                부여할 역할
              </label>
              <select
                id="grant-role"
                value={role}
                onChange={(e) => setRole(e.target.value as 'ops' | 'support')}
                disabled={grantMutation.isPending}
                className={[
                  'h-[44px] px-3 text-sm bg-white border border-gray-200 rounded-xl text-gray-900',
                  'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
                  'transition-colors disabled:opacity-50',
                ].join(' ')}
              >
                <option value="ops">운영 — 변이 기능 포함</option>
                <option value="support">지원 — 읽기 전용</option>
              </select>
            </div>

            {/* Reason */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="grant-reason" className="text-[13px] font-semibold text-gray-700">
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
                  'px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-xl text-gray-900 resize-none',
                  'placeholder:text-gray-400',
                  'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
                  'transition-colors disabled:opacity-50',
                ].join(' ')}
                aria-required="true"
              />
              <p className="text-[11px] text-right text-gray-400 tabular-nums">
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
              className="flex-1 h-[48px] rounded-xl text-[15px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={[
                'flex-1 h-[48px] rounded-xl text-[15px] font-semibold transition-colors',
                'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                canSubmit
                  ? 'bg-blue-500 text-white hover:bg-blue-600'
                  : 'bg-blue-200 text-white cursor-not-allowed',
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

// ── Page ──────────────────────────────────────────────────────────────────
export default function AdminAdminsPage() {
  const { data: adminMe, isPending: mePending } = useV1AdminMe();

  // Accumulated rows across cursor pages
  const [extraRows, setExtraRows] = useState<V1AdminRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Modal state
  const [grantModalOpen, setGrantModalOpen] = useState(false);
  const [actionModal, setActionModal] = useState<ActionModalState | null>(null);

  const { toasts, showToast } = useAdminToast();
  const updateAdminRole = useV1UpdateAdminRole();

  const {
    data: firstPage,
    isPending: listPending,
    isError,
    error,
    refetch,
  } = useV1AdminAdmins({ limit: 20 });

  // Sync cursor from first page
  useEffect(() => {
    if (firstPage) {
      setNextCursor(firstPage.nextCursor ?? firstPage.pageInfo?.nextCursor ?? null);
    }
  }, [firstPage]);

  // ── Loading / gate states ────────────────────────────────────────────────
  if (mePending) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-[72px] bg-gray-100 rounded-xl animate-pulse" />
        <AdminTableSkeleton rows={5} />
      </div>
    );
  }

  // Owner-only gate: non-owners get access denied inside the page
  if (adminMe && adminMe.adminRole !== 'owner') {
    return (
      <AdminEmpty
        title="최고운영자 전용이에요"
        description="이 페이지는 최고운영자(owner)만 접근할 수 있어요. 권한을 확인해 주세요."
      />
    );
  }

  // ── Data ─────────────────────────────────────────────────────────────────
  const firstRows = firstPage?.items ?? [];
  const rows = [...firstRows, ...extraRows];

  const myAdminUserId = adminMe?.adminUserId;

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await v1Get<CursorPage<V1AdminRow>>('/admin/admins', {
        limit: 20,
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

    updateAdminRole.mutate(vars, {
      onSuccess: () => {
        setActionModal(null);
        showToast('처리했어요.', 'success');
      },
      onError: (err) => {
        showToast(resolveAdminErrorMessage(err, '처리에 실패했어요.'), 'error');
      },
    });
  }

  // ── Table columns ─────────────────────────────────────────────────────────
  const columns: AdminTableColumn<V1AdminRow>[] = [
    {
      key: 'member',
      header: '운영자',
      render: (row) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-gray-900 text-[14px]">
            {row.nickname ?? row.displayName ?? '(이름 없음)'}
          </span>
          {row.email && <span className="text-[12px] text-gray-400">{row.email}</span>}
        </div>
      ),
    },
    {
      key: 'adminRole',
      header: '역할',
      render: (row) => <AdminRoleBadge role={row.adminRole} />,
    },
    {
      key: 'status',
      header: '상태',
      render: (row) => {
        const statusKey = row.status === 'revoked' ? 'cancelled' : row.status;
        const label =
          row.status === 'active' ? '활성' : row.status === 'revoked' ? '회수됨' : '정지';
        return <AdminStatusPill status={statusKey} label={label} />;
      },
    },
    {
      key: 'grantedAt',
      header: '부여일',
      render: (row) => (
        <span className="text-[13px] text-gray-500 tabular-nums whitespace-nowrap">
          {formatDateCompact(row.grantedAt)}
        </span>
      ),
    },
    {
      key: 'revokedAt',
      header: '회수일',
      render: (row) => (
        <span className="text-[13px] text-gray-500 tabular-nums whitespace-nowrap">
          {row.revokedAt ? formatDateCompact(row.revokedAt) : '—'}
        </span>
      ),
    },
  ];

  // Role change status options (only ops / support are assignable, not owner)
  const roleChangeOptions = [
    { value: 'ops', label: '운영 (ops)' },
    { value: 'support', label: '지원 (support)' },
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
        title="관리자 관리"
        description="운영자·지원 권한을 부여하고 관리해요."
        action={
          <button
            type="button"
            onClick={() => setGrantModalOpen(true)}
            className={[
              'inline-flex items-center justify-center gap-1.5 min-h-[44px] px-5 rounded-xl',
              'bg-blue-500 hover:bg-blue-600 text-white text-[14px] font-semibold',
              'transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
            ].join(' ')}
          >
            <ShieldCheck size={16} aria-hidden="true" />
            운영자 추가
          </button>
        }
      />

      <div className="flex flex-col gap-4">
        {/* Data table */}
        <AdminDataTable<V1AdminRow>
          columns={columns}
          rows={rows}
          keyExtractor={(row) => row.adminUserId}
          actionsHeader="작업"
          renderActions={(row) => {
            // Hide actions for owner rows (including self) — owner role cannot be changed via UI
            if (row.adminRole === 'owner') return null;
            // Hide actions for own row (self-modification guard)
            if (row.adminUserId === myAdminUserId) return null;

            return (
              <div className="flex items-center gap-1.5">
                {row.status === 'active' && (
                  <>
                    {/* Role change: only for ops/support (not owner) */}
                    <button
                      type="button"
                      onClick={() => setActionModal({ row, action: 'changeRole' })}
                      className={[
                        'inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg text-[13px] font-medium',
                        'text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors whitespace-nowrap',
                        'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                      ].join(' ')}
                      aria-label={`${row.nickname ?? '운영자'} 역할 변경`}
                    >
                      역할 변경
                    </button>
                    {/* Revoke */}
                    <button
                      type="button"
                      onClick={() => setActionModal({ row, action: 'revoke' })}
                      className={[
                        'inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg text-[13px] font-medium',
                        'text-red-600 bg-red-50 hover:bg-red-100 transition-colors whitespace-nowrap',
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
                      'inline-flex items-center justify-center gap-1 min-h-[44px] px-3 rounded-lg text-[13px] font-medium',
                      'text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors whitespace-nowrap',
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
          loading={listPending}
          empty={
            <AdminEmpty
              title="운영자가 없어요"
              description="운영자 추가 버튼으로 운영자를 부여해 보세요."
            />
          }
          error={errorMessage}
          onRetry={() => void refetch()}
          skeletonRows={5}
        />

        {/* Load more */}
        {nextCursor && !listPending && !isError && !loadingMore && (
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

        {loadingMore && <AdminTableSkeleton rows={3} />}
      </div>

      {/* Grant modal */}
      <GrantModal
        open={grantModalOpen}
        onClose={() => setGrantModalOpen(false)}
        onGrantSuccess={() => {
          setExtraRows([]);
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
