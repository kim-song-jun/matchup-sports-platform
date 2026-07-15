'use client';

import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, ShieldMinus, Shield, X, Search, RotateCcw, Calendar, Clock, Activity } from 'lucide-react';
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
  AdminCardList,
  AdminReasonModal,
  AdminEmpty,
  AdminTableSkeleton,
  useAdminToast,
  AdminToasts,
} from '@/components/admin';
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
      <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-[var(--font-size-micro)] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
        <ShieldCheck size={11} aria-hidden="true" />
        최고운영자
      </span>
    );
  }
  if (role === 'ops') {
    return (
      <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-[var(--font-size-micro)] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
        <Shield size={11} aria-hidden="true" />
        운영
      </span>
    );
  }
  // support
  return (
    <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 text-[var(--font-size-micro)] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
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

const SEARCH_MENU_ID = 'grant-user-search-menu';

function GrantModal({ open, onClose, onGrantSuccess }: GrantModalProps) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<V1AdminUserRow | null>(null);
  const [role, setRole] = useState<'ops' | 'support'>('ops');
  const [reason, setReason] = useState('');
  /** Keyboard-highlighted index in the search result menu (-1 = none) */
  const [menuHighlightIdx, setMenuHighlightIdx] = useState(-1);
  const panelRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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
      setMenuHighlightIdx(-1);
      const t = setTimeout(() => firstInputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Reset menu highlight when debounced search changes (new results)
  useEffect(() => {
    setMenuHighlightIdx(-1);
  }, [debouncedSearch]);

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
        className="bg-white rounded-2xl shadow-[var(--shadow-modal)] w-full max-w-[480px] overflow-hidden"
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
              <label htmlFor="grant-user-search" className="text-[var(--font-size-label)] font-semibold text-gray-700">
                회원 검색
              </label>
              {selectedUser ? (
                <div className="flex items-center justify-between h-[44px] px-3 bg-blue-50 border border-blue-200 rounded-xl">
                  <div className="flex flex-col">
                    <span className="text-[var(--font-size-label)] font-semibold text-blue-800">
                      {formatUserTitle(selectedUser)}
                    </span>
                    {selectedUser.email && (
                      <span className="text-[var(--font-size-micro)] text-blue-600">{selectedUser.email}</span>
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
                    className="flex items-center justify-center w-[44px] h-[44px] rounded-lg text-blue-400 hover:text-blue-600 hover:bg-blue-100 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
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
                    aria-haspopup="menu"
                    aria-expanded={!!(debouncedSearch && !usersPending && userResults.length > 0)}
                    aria-controls={debouncedSearch ? SEARCH_MENU_ID : undefined}
                    onKeyDown={(e) => {
                      if (!debouncedSearch || userResults.length === 0) return;
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setMenuHighlightIdx((prev) =>
                          prev < userResults.length - 1 ? prev + 1 : 0,
                        );
                        // Move DOM focus into the menu
                        const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
                        const nextIdx = menuHighlightIdx < userResults.length - 1 ? menuHighlightIdx + 1 : 0;
                        items?.[nextIdx]?.focus();
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setMenuHighlightIdx((prev) =>
                          prev > 0 ? prev - 1 : userResults.length - 1,
                        );
                        const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
                        const nextIdx = menuHighlightIdx > 0 ? menuHighlightIdx - 1 : userResults.length - 1;
                        items?.[nextIdx]?.focus();
                      } else if (e.key === 'Escape') {
                        setSearch('');
                        setDebouncedSearch('');
                        setMenuHighlightIdx(-1);
                      }
                    }}
                    className={[
                      'w-full h-[44px] pl-9 pr-3 text-sm bg-white border border-gray-200 rounded-xl text-gray-900',
                      'placeholder:text-gray-400',
                      'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
                      'transition-colors disabled:opacity-50',
                    ].join(' ')}
                    autoComplete="off"
                  />
                  {/* Search results dropdown — role=menu/menuitem (WCAG H4: valid ARIA nesting) */}
                  {debouncedSearch && (
                    <div
                      ref={menuRef}
                      id={SEARCH_MENU_ID}
                      className="absolute left-0 right-0 top-[48px] bg-white border border-gray-200 rounded-xl shadow-md z-10 overflow-hidden max-h-[240px] overflow-y-auto"
                    >
                      {usersPending ? (
                        <p className="px-4 py-3 text-[var(--font-size-label)] text-gray-400">검색 중…</p>
                      ) : userResults.length === 0 ? (
                        <p className="px-4 py-3 text-[var(--font-size-label)] text-gray-400">결과가 없어요.</p>
                      ) : (
                        <div role="menu" aria-label="회원 검색 결과">
                          {userResults.map((user, idx) => (
                            <button
                              key={user.userId}
                              type="button"
                              role="menuitem"
                              tabIndex={menuHighlightIdx === idx ? 0 : -1}
                              onClick={() => {
                                setSelectedUser(user);
                                setSearch('');
                                setDebouncedSearch('');
                                setMenuHighlightIdx(-1);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  const next = idx < userResults.length - 1 ? idx + 1 : 0;
                                  setMenuHighlightIdx(next);
                                  const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
                                  items?.[next]?.focus();
                                } else if (e.key === 'ArrowUp') {
                                  e.preventDefault();
                                  const prev = idx > 0 ? idx - 1 : userResults.length - 1;
                                  setMenuHighlightIdx(prev);
                                  const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
                                  items?.[prev]?.focus();
                                } else if (e.key === 'Escape') {
                                  setSearch('');
                                  setDebouncedSearch('');
                                  setMenuHighlightIdx(-1);
                                  firstInputRef.current?.focus();
                                }
                              }}
                              className={[
                                'w-full flex flex-col items-start px-4 py-2.5 min-h-[44px] text-left',
                                'hover:bg-blue-50 transition-colors',
                                'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-[-2px]',
                                menuHighlightIdx === idx ? 'bg-blue-50' : '',
                              ].join(' ')}
                            >
                              <span className="text-[var(--font-size-label)] font-semibold text-gray-900">
                                {formatUserTitle(user)}
                                {user.adminRole && (
                                  <span className="ml-1.5 text-[var(--font-size-micro)] text-blue-600 font-medium">
                                    (이미 운영자)
                                  </span>
                                )}
                              </span>
                              {user.email && (
                                <span className="text-[var(--font-size-caption)] text-gray-400">{user.email}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Role selection */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="grant-role" className="text-[var(--font-size-label)] font-semibold text-gray-700">
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
                <option value="ops">운영 — 상태 변경 등 쓰기 권한 포함</option>
                <option value="support">지원 — 읽기 전용</option>
              </select>
            </div>

            {/* Reason */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="grant-reason" className="text-[var(--font-size-label)] font-semibold text-gray-700">
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
              <p className="text-[var(--font-size-micro)] text-right text-gray-400 tabular-nums">
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
              className="flex-1 h-[48px] rounded-xl text-[var(--font-size-body)] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={[
                'flex-1 h-[48px] rounded-xl text-[var(--font-size-body)] font-semibold transition-colors',
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
        description="이 페이지는 최고운영자만 접근할 수 있어요. 권한을 확인해 주세요."
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
        title="관리자 관리"
        description="운영자·지원 권한을 부여하고 관리해요."
        action={
          <button
            type="button"
            onClick={() => setGrantModalOpen(true)}
            className={[
              'inline-flex items-center justify-center gap-1.5 min-h-[44px] px-5 rounded-xl',
              'bg-blue-500 hover:bg-blue-600 text-white text-[var(--font-size-body-sm)] font-semibold',
              'transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
            ].join(' ')}
          >
            <ShieldCheck size={16} aria-hidden="true" />
            운영자 추가
          </button>
        }
      />

      <div className="flex flex-col gap-4">
        {/* Card list */}
        <AdminCardList<V1AdminRow>
          rows={rows}
          keyExtractor={(row) => row.adminUserId}
          card={(row) => ({
            title: formatUserTitle(row),
            subtitle: row.email ?? undefined,
            statusNode: <AdminRoleBadge role={row.adminRole} />,
            meta: [
              {
                icon: <Activity size={14} aria-hidden="true" />,
                label: row.status === 'active' ? '활성' : row.status === 'revoked' ? '회수됨' : '정지',
              },
              {
                icon: <Calendar size={14} aria-hidden="true" />,
                label: `부여 ${formatDateCompact(row.grantedAt)}`,
              },
              {
                icon: <Clock size={14} aria-hidden="true" />,
                label: row.revokedAt ? `회수 ${formatDateCompact(row.revokedAt)}` : '회수일 없음',
              },
            ],
            tone:
              row.status === 'revoked'
                ? 'danger'
                : row.status === 'suspended'
                  ? 'warning'
                  : undefined,
          })}
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
                        'inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg text-[var(--font-size-label)] font-medium',
                        'text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors whitespace-nowrap',
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
                        'inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg text-[var(--font-size-label)] font-medium',
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
                      'inline-flex items-center justify-center gap-1 min-h-[44px] px-3 rounded-lg text-[var(--font-size-label)] font-medium',
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
              description="운영자 추가 버튼을 눌러 운영자를 등록해 보세요."
            />
          }
          error={errorMessage}
          onRetry={() => void refetch()}
          skeletonCards={5}
        />

        {/* Load more */}
        {nextCursor && !listPending && !isError && !loadingMore && (
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
