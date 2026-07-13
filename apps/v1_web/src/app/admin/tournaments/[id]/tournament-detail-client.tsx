'use client';

import { useState, useRef, useEffect, useId } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  ClipboardList,
  Download,
  Lock,
  Unlock,
  Check,
  X,
  RefreshCw,
  Plus,
  Megaphone,
  Send,
  Pencil,
  Trash2,
  Users,
  User,
  Clock,
} from 'lucide-react';
import {
  useV1AdminTournament,
  useV1AdminMe,
  useV1ChangeTournamentStatus,
  useV1UpdateTournament,
  useV1AdminTournamentRegistrations,
  useV1ConfirmPayment,
  useV1ConfirmRegistration,
  useV1CancelRegistrationAdmin,
  useV1RosterLock,
  useV1RosterUnlock,
  useV1ExportRosterCsv,
  useV1TournamentPlayers,
  useV1UpdatePlayerEligibility,
  useV1AdminBracket,
  useV1CreateGroup,
  useV1AssignGroupTeam,
  useV1CreateFixture,
  useV1RecordResult,
  useV1RecalculateStandings,
  useV1AdminAnnouncements,
  useV1CreateAnnouncement,
  useV1DeleteAnnouncement,
  useV1PublishAnnouncement,
  useV1UpdateAnnouncement,
  useV1UploadImages,
} from '@/hooks/use-v1-api';
import type {
  V1TournamentStatus,
  V1AdminTournamentRegistration,
  V1AdminBracketGroup,
  V1AdminBracketFixture,
  V1AdminBracketStanding,
  V1AdminTournamentAnnouncement,
  V1TournamentGroupPhase,
  V1AnnouncementAudience,
  V1UpdateTournamentPayload,
} from '@/types/api';
import { extractErrorMessage } from '@/lib/error-message';
import { roundRobinRounds, knockoutSeedPairs } from '@/lib/tournament-bracket-gen';

import {
  AdminPageHeader,
  AdminCardList,
  AdminDataTable,
  AdminTableSkeleton,
  AdminEmpty,
  AdminToasts,
  useAdminToast,
} from '@/components/admin';
import type { AdminTableColumn } from '@/components/admin';
import { useConfirm } from '@/components/v1-ui/confirm-modal';

// ── Constants ─────────────────────────────────────────────────────────────

const TOURNAMENT_STATUS_LABEL: Record<string, string> = {
  draft: '초안',
  open: '접수 중',
  closed: '마감',
  in_progress: '진행 중',
  completed: '완료',
  cancelled: '취소됨',
};

const ELIGIBILITY_LABEL: Record<string, string> = {
  non_pro: '아마추어',
  pro: '프로',
  needs_review: '검토 필요',
};

// f9: 결제 상태·수단 한글 라벨 (schema enum=ready|paid|failed|cancelled|refunded, my-registration-client 동일 기준)
const PAYMENT_STATUS_LABEL: Record<string, string> = {
  ready: '결제 대기',
  paid: '결제 완료',
  failed: '결제 실패',
  cancelled: '취소됨',
  refunded: '환불됨',
};

// schema enum=pg|bank_transfer only
const PAYMENT_METHOD_LABEL: Record<string, string> = {
  pg: '카드·간편결제',
  bank_transfer: '계좌이체',
};

// AREG-04: 어드민이 취소할 수 있는 신청 상태 (draft·cancelled 제외 — BE 가드와 동일)
const ADMIN_CANCELLABLE = new Set<string>([
  'cancel_requested',
  'awaiting_payment',
  'payment_checking',
  'paid',
  'confirmed',
  'waitlisted',
]);

// ── Status transition guards ────────────────────────────────────────────────

/** Returns next allowed statuses from the current one */
function allowedNextStatuses(current: V1TournamentStatus): V1TournamentStatus[] {
  switch (current) {
    case 'draft':
      return ['open', 'cancelled'];
    case 'open':
      return ['closed', 'cancelled'];
    case 'closed':
      return ['in_progress', 'open', 'cancelled'];
    case 'in_progress':
      return ['completed', 'cancelled'];
    case 'completed':
    case 'cancelled':
      return [];
    default:
      return [];
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
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

function isoToDatetimeLocalValue(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${getPart('year')}-${getPart('month')}-${getPart('day')}T${getPart('hour')}:${getPart('minute')}`;
}

function datetimeLocalValueToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(`${value}:00+09:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

// ── Shared input styles ───────────────────────────────────────────────────

/** h-[44px] unified submit button (f12) */
const submitBtnCls = [
  'inline-flex items-center justify-center gap-1.5 h-[44px] px-4 rounded-xl',
  'text-[13px] text-white bg-blue-500 hover:bg-blue-600',
  'transition-colors disabled:opacity-50',
  'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
].join(' ');

const inputCls = [
  'h-[44px] px-3 text-[13px] bg-white border border-gray-200 rounded-xl text-gray-900',
  'placeholder:text-gray-600',
  'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
  'transition-colors disabled:opacity-50 w-full',
].join(' ');

const textareaCls = [
  'px-3 py-2.5 text-[13px] bg-white border border-gray-200 rounded-xl text-gray-900 resize-none',
  'placeholder:text-gray-600',
  'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
  'transition-colors disabled:opacity-50 w-full',
].join(' ');

// ── Inline modal (reusable within this file) ──────────────────────────────

interface SimpleModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  pending?: boolean;
  children: React.ReactNode;
}

function SimpleModal({ open, title, onClose, pending = false, children }: SimpleModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement;
    } else {
      const el = previousFocusRef.current;
      if (el && typeof (el as HTMLElement).focus === 'function') {
        (el as HTMLElement).focus();
      }
      previousFocusRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose, pending]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusableSelectors =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelectors));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [open]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-[2px]"
      onClick={(e) => { if (e.target === e.currentTarget && !pending) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white rounded-2xl shadow-[var(--shadow-2)] w-full max-w-[480px] overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 id={titleId} className="text-sm font-bold text-gray-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => !pending && onClose()}
            disabled={pending}
            aria-label="모달 닫기"
            className="flex items-center justify-center w-[44px] h-[44px] rounded-lg text-gray-500 hover:text-gray-600 hover:bg-gray-50 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-40"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

// ── Tab type ──────────────────────────────────────────────────────────────

type TabId = 'registrations' | 'bracket' | 'announcements';

const TABS: { id: TabId; label: string }[] = [
  { id: 'registrations', label: '신청 관리' },
  { id: 'bracket', label: '대진 관리' },
  { id: 'announcements', label: '공지' },
];

// ── Registration roster modal ─────────────────────────────────────────────

function RosterModal({
  open,
  onClose,
  tournamentId,
  registration,
  showToast,
}: {
  open: boolean;
  onClose: () => void;
  tournamentId: string;
  registration: V1AdminTournamentRegistration | null;
  showToast: (msg: string, v?: 'success' | 'error') => void;
}) {
  const { data, isPending } = useV1TournamentPlayers(
    tournamentId,
    registration?.id ?? '',
  );
  const updateEligibility = useV1UpdatePlayerEligibility();

  const players = data?.players ?? [];

  const handleEligibilityChange = (playerId: string, status: string) => {
    updateEligibility.mutate(
      { playerId, eligibilityStatus: status as 'non_pro' | 'pro' | 'needs_review' },
      {
        onSuccess: () => showToast('자격 상태를 변경했어요.', 'success'),
        onError: (err) =>
          showToast(extractErrorMessage(err, '자격 상태를 변경하지 못했어요.'), 'error'),
      },
    );
  };

  return (
    <SimpleModal
      open={open}
      title={`명단 검토 — ${registration?.teamName ?? registration?.teamId ?? ''}`}
      onClose={onClose}
    >
      {isPending ? (
        <p className="text-sm text-gray-500">불러오는 중…</p>
      ) : players.length === 0 ? (
        <p className="text-sm text-gray-500">등록된 선수가 없어요.</p>
      ) : (
        <ul className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto" role="list">
          {players.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{p.realName}</p>
                {p.birthDateSnapshot && (
                  <p className="text-xs text-gray-500">{p.birthDateSnapshot}</p>
                )}
              </div>
              <select
                value={p.eligibilityStatus}
                onChange={(e) => handleEligibilityChange(p.id, e.target.value)}
                disabled={updateEligibility.isPending}
                aria-label={`${p.realName} 자격 상태`}
                className="h-[44px] px-3 text-[13px] bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors disabled:opacity-50"
              >
                {(Object.entries(ELIGIBILITY_LABEL) as [string, string][]).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={onClose}
        className="mt-4 w-full h-[44px] rounded-xl text-[13px] text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
      >
        닫기
      </button>
    </SimpleModal>
  );
}

// ── Export CSV button (one hook instance per row) ─────────────────────────

function ExportCsvButton({
  registrationId,
  showToast,
}: {
  registrationId: string;
  showToast: (msg: string, v?: 'success' | 'error') => void;
}) {
  const exportCsv = useV1ExportRosterCsv(registrationId);

  const handleClick = () => {
    exportCsv.mutate(undefined, {
      onSuccess: (res) => {
        const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = res.filename || `roster_${registrationId}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast('CSV를 다운로드했어요.', 'success');
      },
      onError: (err) =>
        showToast(extractErrorMessage(err, 'CSV 다운로드에 실패했어요.'), 'error'),
    });
  };

  return (
    <ActionButton
      onClick={handleClick}
      disabled={exportCsv.isPending}
      icon={<Download size={13} />}
      label={exportCsv.isPending ? '…' : 'CSV'}
      tone="gray"
    />
  );
}

// ── Tab: Registrations ────────────────────────────────────────────────────

function RegistrationsTab({
  tournamentId,
  showToast,
}: {
  tournamentId: string;
  showToast: (msg: string, v?: 'success' | 'error') => void;
}) {
  const { data, isPending, isError, error, refetch } = useV1AdminTournamentRegistrations(tournamentId);
  const confirmPayment = useV1ConfirmPayment();
  const confirmRegistration = useV1ConfirmRegistration();
  const cancelRegistration = useV1CancelRegistrationAdmin();
  const rosterLock = useV1RosterLock();
  const rosterUnlock = useV1RosterUnlock();
  const [rosterRegistration, setRosterRegistration] = useState<V1AdminTournamentRegistration | null>(null);
  const [rosterOpen, setRosterOpen] = useState(false);
  const { confirm: confirmCancel, ConfirmModal: CancelConfirmModal } = useConfirm();

  const registrations = data?.items ?? [];

  const handleConfirmPayment = (reg: V1AdminTournamentRegistration) => {
    confirmPayment.mutate(
      { registrationId: reg.id },
      {
        onSuccess: () => showToast('입금을 확인했어요.', 'success'),
        onError: (err) =>
          showToast(extractErrorMessage(err, '입금 확인에 실패했어요.'), 'error'),
      },
    );
  };

  const handleConfirm = (reg: V1AdminTournamentRegistration, decision: 'confirm' | 'waitlist') => {
    confirmRegistration.mutate(
      { registrationId: reg.id, decision },
      {
        onSuccess: (res) => {
          if (res.alreadyProcessed) {
            showToast('이미 처리된 신청이에요.', 'success');
          } else {
            showToast(decision === 'confirm' ? '확정했어요.' : '대기로 설정했어요.', 'success');
          }
        },
        onError: (err) =>
          showToast(extractErrorMessage(err, '처리에 실패했어요.'), 'error'),
      },
    );
  };

  const handleCancel = async (reg: V1AdminTournamentRegistration) => {
    const teamLabel = reg.teamName ? `"${reg.teamName}"` : '이 팀';
    const ok = await confirmCancel({
      title: '신청 취소',
      message: `${teamLabel}의 신청을 취소할까요? 이 작업은 되돌릴 수 없어요.`,
      confirmLabel: '취소 처리',
      tone: 'danger',
    });
    if (!ok) return;
    cancelRegistration.mutate(
      { registrationId: reg.id },
      {
        onSuccess: () => showToast('취소했어요.', 'success'),
        onError: (err) =>
          showToast(extractErrorMessage(err, '취소에 실패했어요.'), 'error'),
      },
    );
  };

  const handleRosterLock = (reg: V1AdminTournamentRegistration) => {
    rosterLock.mutate(
      { registrationId: reg.id },
      {
        onSuccess: () => showToast('명단을 잠갔어요.', 'success'),
        onError: (err) =>
          showToast(extractErrorMessage(err, '명단 잠금에 실패했어요.'), 'error'),
      },
    );
  };

  const handleRosterUnlock = (reg: V1AdminTournamentRegistration) => {
    rosterUnlock.mutate(
      reg.id,
      {
        onSuccess: () => showToast('명단 잠금을 해제했어요.', 'success'),
        onError: (err) =>
          showToast(extractErrorMessage(err, '명단 잠금 해제에 실패했어요.'), 'error'),
      },
    );
  };


  return (
    <>
      {/* f8: AdminCardList — registrations as card grid */}
      <AdminCardList<V1AdminTournamentRegistration>
        rows={registrations}
        keyExtractor={(r) => r.id}
        card={(r) => ({
          title: r.teamName ?? r.teamId,
          subtitle: r.payment
            ? `${PAYMENT_METHOD_LABEL[r.payment.method] ?? r.payment.method} · ${PAYMENT_STATUS_LABEL[r.payment.status] ?? r.payment.status}`
            : undefined,
          status: r.status,
          meta: [
            {
              icon: <Users size={14} aria-hidden="true" />,
              label: `${r.playerCount}명`,
            },
            {
              icon: <User size={14} aria-hidden="true" />,
              label: r.depositorName ?? '—',
            },
            {
              icon: <Clock size={14} aria-hidden="true" />,
              label: `신청 ${formatDate(r.createdAt)}`,
              wrap: true,
            },
            ...(r.cancelRequestedAt
              ? [{
                  icon: <Clock size={14} aria-hidden="true" />,
                  label: `취소 요청 ${formatDate(r.cancelRequestedAt)}`,
                  wrap: true,
                }]
              : []),
          ],
          description: r.cancelReason ? `취소 사유: ${r.cancelReason}` : undefined,
          tone:
            r.status === 'cancelled' || r.status === 'cancel_requested'
              ? 'danger'
              : r.status === 'awaiting_payment' || r.status === 'payment_checking'
              ? 'warning'
              : undefined,
        })}
        loading={isPending}
        error={isError ? extractErrorMessage(error, '신청 목록을 불러오지 못했어요.') : undefined}
        onRetry={() => void refetch()}
        empty={<AdminEmpty title="신청이 없어요" description="아직 신청한 팀이 없어요." />}
        skeletonCards={8}
        minCardWidth="360px"
        renderActions={(reg) => {
          const isLocked = !!reg.rosterLockedAt;
          return (
            <>
              {reg.status === 'awaiting_payment' && (
                <ActionButton
                  onClick={() => handleConfirmPayment(reg)}
                  disabled={confirmPayment.isPending}
                  icon={<Check size={13} />}
                  label="입금 확인"
                  tone="blue"
                />
              )}
              {(reg.status === 'payment_checking' || reg.status === 'paid') && (
                <>
                  <ActionButton
                    onClick={() => handleConfirm(reg, 'confirm')}
                    disabled={confirmRegistration.isPending}
                    icon={<Check size={13} />}
                    label="확정"
                    tone="blue"
                  />
                  <ActionButton
                    onClick={() => handleConfirm(reg, 'waitlist')}
                    disabled={confirmRegistration.isPending}
                    icon={<X size={13} />}
                    label="대기"
                    tone="gray"
                  />
                </>
              )}
              {reg.status === 'confirmed' &&
                (isLocked ? (
                  <ActionButton
                    onClick={() => handleRosterUnlock(reg)}
                    disabled={rosterUnlock.isPending}
                    icon={<Unlock size={13} />}
                    label="잠금 해제"
                    tone="gray"
                  />
                ) : (
                  <ActionButton
                    onClick={() => handleRosterLock(reg)}
                    disabled={rosterLock.isPending}
                    icon={<Lock size={13} />}
                    label="명단 잠금"
                    tone="gray"
                  />
                ))}
              <ActionButton
                onClick={() => {
                  setRosterRegistration(reg);
                  setRosterOpen(true);
                }}
                icon={<ClipboardList size={13} />}
                label="명단 검토"
                tone="gray"
              />
              <ExportCsvButton registrationId={reg.id} showToast={showToast} />
              {ADMIN_CANCELLABLE.has(reg.status) && (
                <ActionButton
                  onClick={() => handleCancel(reg)}
                  disabled={cancelRegistration.isPending}
                  icon={<X size={13} />}
                  label="취소"
                  tone="red"
                />
              )}
            </>
          );
        }}
      />

      {/* Roster modal */}
      <RosterModal
        open={rosterOpen}
        onClose={() => setRosterOpen(false)}
        tournamentId={tournamentId}
        registration={rosterRegistration}
        showToast={showToast}
      />

      {/* 신청 취소 confirm modal */}
      {CancelConfirmModal}
    </>
  );
}

// ── Small action button ───────────────────────────────────────────────────

function ActionButton({
  onClick,
  disabled,
  icon,
  label,
  tone,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  tone: 'blue' | 'gray' | 'red';
}) {
  const toneClass =
    tone === 'blue'
      ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
      : tone === 'red'
      ? 'text-red-600 bg-red-50 hover:bg-red-100'
      : 'text-gray-600 bg-gray-100 hover:bg-gray-200';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'inline-flex items-center gap-1 min-h-[44px] px-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
        'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
        'disabled:opacity-50',
        toneClass,
      ].join(' ')}
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </button>
  );
}

// ── Tab: Bracket ──────────────────────────────────────────────────────────

function BracketTab({
  tournamentId,
  showToast,
  registrations,
}: {
  tournamentId: string;
  showToast: (msg: string, v?: 'success' | 'error') => void;
  registrations: V1AdminTournamentRegistration[];
}) {
  const { data: bracket, isPending, isError, error, refetch } = useV1AdminBracket(tournamentId);
  const createGroup = useV1CreateGroup(tournamentId);
  const assignGroupTeam = useV1AssignGroupTeam(tournamentId);
  const createFixture = useV1CreateFixture(tournamentId);
  const recordResult = useV1RecordResult(tournamentId);
  const recalculate = useV1RecalculateStandings(tournamentId);

  // ── Group creation form ─────────────────────────────────────────────
  const [groupName, setGroupName] = useState('');
  const [groupPhase, setGroupPhase] = useState<V1TournamentGroupPhase>('group');
  const [groupAdvanceCount, setGroupAdvanceCount] = useState('');

  // ── Assign team form ────────────────────────────────────────────────
  const [assignGroupId, setAssignGroupId] = useState('');
  const [assignRegId, setAssignRegId] = useState('');

  // ── Create fixture form ─────────────────────────────────────────────
  const [fixtureGroupId, setFixtureGroupId] = useState('');
  const [fixtureRound, setFixtureRound] = useState('');
  const [fixtureNumber, setFixtureNumber] = useState('1');
  const [fixtureHomeRegId, setFixtureHomeRegId] = useState('');
  const [fixtureAwayRegId, setFixtureAwayRegId] = useState('');
  // auto-generate state
  const [autoGenGroupId, setAutoGenGroupId] = useState('');
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const { confirm: confirmModal, ConfirmModal } = useConfirm();

  // ── Record result state ─────────────────────────────────────────────
  const [resultFixture, setResultFixture] = useState<V1AdminBracketFixture | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [homeScore, setHomeScore] = useState('0');
  const [awayScore, setAwayScore] = useState('0');
  const [hasPenalty, setHasPenalty] = useState(false);
  const [homePenalty, setHomePenalty] = useState('0');
  const [awayPenalty, setAwayPenalty] = useState('0');

  const confirmedRegistrations = registrations.filter((r) => r.status === 'confirmed');

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;
    const parsedAdvance = Number.parseInt(groupAdvanceCount, 10);
    const advanceCount = Number.isInteger(parsedAdvance) && parsedAdvance > 0 ? parsedAdvance : undefined;
    createGroup.mutate(
      { name: groupName.trim(), phase: groupPhase, ...(advanceCount != null ? { advanceCount } : {}) },
      {
        onSuccess: () => { setGroupName(''); setGroupAdvanceCount(''); showToast('조를 만들었어요.', 'success'); },
        onError: (err) => showToast(extractErrorMessage(err, '조 생성에 실패했어요.'), 'error'),
      },
    );
  };

  const handleAssignTeam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignGroupId || !assignRegId) return;
    assignGroupTeam.mutate(
      { groupId: assignGroupId, registrationId: assignRegId },
      {
        onSuccess: () => { setAssignRegId(''); showToast('팀을 배정했어요.', 'success'); },
        onError: (err) => showToast(extractErrorMessage(err, '팀 배정에 실패했어요.'), 'error'),
      },
    );
  };

  const handleCreateFixture = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fixtureRound.trim() || !fixtureNumber) return;
    // double-booking guard: home === away
    if (fixtureHomeRegId && fixtureHomeRegId === fixtureAwayRegId) {
      showToast('홈과 어웨이에 같은 팀을 선택할 수 없어요.', 'error');
      return;
    }
    createFixture.mutate(
      {
        round: fixtureRound.trim(),
        fixtureNumber: parseInt(fixtureNumber, 10),
        ...(fixtureGroupId ? { groupId: fixtureGroupId } : {}),
        ...(fixtureHomeRegId ? { homeRegistrationId: fixtureHomeRegId } : {}),
        ...(fixtureAwayRegId ? { awayRegistrationId: fixtureAwayRegId } : {}),
      },
      {
        onSuccess: () => {
          setFixtureRound('');
          setFixtureNumber('1');
          setFixtureHomeRegId('');
          setFixtureAwayRegId('');
          showToast('경기 일정을 추가했어요.', 'success');
        },
        onError: (err) => showToast(extractErrorMessage(err, '경기 일정 추가에 실패했어요.'), 'error'),
      },
    );
  };

  // ── Auto-generate fixtures ───────────────────────────────────────────
  // Sequential mutation helper — fires each payload one at a time to avoid
  // race conditions on the server's auto-increment fixtureNumber logic.
  async function mutateSequential(payloads: Parameters<typeof createFixture.mutate>[0][]) {
    for (const payload of payloads) {
      await new Promise<void>((resolve, reject) => {
        createFixture.mutate(payload, { onSuccess: () => resolve(), onError: reject });
      });
    }
  }

  const handleAutoGenerate = async (targetGroupId: string) => {
    // Find the group (use bracket directly to avoid temporal dependency on groups/fixtures)
    const allGroups: V1AdminBracketGroup[] = bracket?.groups ?? [];
    const allFixtures: V1AdminBracketFixture[] = bracket?.fixtures ?? [];
    const group = allGroups.find((g) => g.id === targetGroupId);
    if (!group) return;

    const isKnockout = group.phase === 'semi' || group.phase === 'final' || group.phase === 'third_place';

    // Check for existing fixtures in this group
    const existingInGroup = allFixtures.filter((f) => f.groupId === targetGroupId);
    if (existingInGroup.length > 0) {
      const ok = await confirmModal({
        title: '경기 일정 추가',
        message: `"${group.name}"에 이미 경기 일정 ${existingInGroup.length}개가 있어요. 추가로 만들까요?`,
        confirmLabel: '추가 생성',
      });
      if (!ok) return;
    }

    // Determine next fixtureNumber base (global across all fixtures)
    const maxNum = allFixtures.reduce((m, f) => Math.max(m, f.fixtureNumber), 0);
    let nextNum = maxNum + 1;

    setIsAutoGenerating(true);
    try {
      if (!isKnockout) {
        // GROUP phase — round-robin: every unordered pair once
        const teams = group.groupTeams;
        if (teams.length < 2) {
          showToast('조에 팀이 2개 이상 있어야 자동 생성할 수 있어요.', 'error');
          return;
        }
        // 라운드로빈: 모든 비순서 쌍 1회 (순수 함수 roundRobinRounds — circle method)
        const payloads: Parameters<typeof createFixture.mutate>[0][] = [];
        roundRobinRounds(teams).forEach((pairs, round) => {
          const roundLabel = `조별 ${round + 1}라운드`;
          for (const [home, away] of pairs) {
            payloads.push({
              groupId: targetGroupId,
              round: roundLabel,
              fixtureNumber: nextNum++,
              homeRegistrationId: home.registrationId,
              awayRegistrationId: away.registrationId,
            });
          }
        });
        await mutateSequential(payloads);
        showToast(`조별리그 경기 일정 ${payloads.length}개를 자동으로 만들었어요.`, 'success');
      } else {
        // KNOCKOUT phase — seed-pair: 1 vs N, 2 vs N-1, …
        const teams = group.groupTeams;
        const roundLabel =
          group.phase === 'semi'
            ? '4강'
            : group.phase === 'final'
            ? '결승'
            : '3·4위전';

        if (teams.length === 0) {
          // Produce a single TBD fixture for the phase
          await new Promise<void>((resolve, reject) => {
            createFixture.mutate(
              { groupId: targetGroupId, round: roundLabel, fixtureNumber: nextNum++ },
              { onSuccess: () => resolve(), onError: reject },
            );
          });
          showToast(`${roundLabel} 경기 일정(대진 미정)을 추가했어요.`, 'success');
          return;
        }

        // 시드순(sortOrder) 정렬 후 1vsN 페어링 (순수 함수 knockoutSeedPairs)
        const sorted = [...teams].sort((a, b) => a.sortOrder - b.sortOrder);
        const payloads: Parameters<typeof createFixture.mutate>[0][] = [];
        for (const { home, away } of knockoutSeedPairs(sorted)) {
          payloads.push({
            groupId: targetGroupId,
            round: roundLabel,
            fixtureNumber: nextNum++,
            homeRegistrationId: home.registrationId,
            ...(away ? { awayRegistrationId: away.registrationId } : {}),
          });
        }
        await mutateSequential(payloads);
        showToast(`${roundLabel} 경기 일정 ${payloads.length}개를 자동으로 만들었어요.`, 'success');
      }
    } catch (err) {
      showToast(extractErrorMessage(err, '자동 생성에 실패했어요.'), 'error');
    } finally {
      setIsAutoGenerating(false);
    }
  };

  const handleRecordResult = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resultFixture) return;
    // AGF-2/AGF-4: 버튼 disabled로 1차 차단, 폼 submit 이중 방어
    const hs = parseInt(homeScore, 10);
    const as_ = parseInt(awayScore, 10);
    const hp = parseInt(homePenalty, 10);
    const ap = parseInt(awayPenalty, 10);
    const draw = !Number.isNaN(hs) && !Number.isNaN(as_) && hs === as_;
    if (hasPenalty && !draw) return; // 정규 동점 아닐 때 승부차기 차단
    if (hasPenalty && !Number.isNaN(hp) && !Number.isNaN(ap) && hp === ap) return; // 승부차기 동점 차단
    recordResult.mutate(
      {
        fixtureId: resultFixture.id,
        homeScore: parseInt(homeScore, 10),
        awayScore: parseInt(awayScore, 10),
        ...(hasPenalty
          ? {
              hasPenalty: true,
              homePenaltyScore: parseInt(homePenalty, 10),
              awayPenaltyScore: parseInt(awayPenalty, 10),
            }
          : { hasPenalty: false }),
      },
      {
        onSuccess: () => {
          setResultOpen(false);
          showToast('결과를 입력했어요.', 'success');
        },
        onError: (err) => showToast(extractErrorMessage(err, '결과 입력에 실패했어요.'), 'error'),
      },
    );
  };

  const handleRecalculate = () => {
    recalculate.mutate(undefined, {
      onSuccess: () => showToast('순위를 재계산했어요.', 'success'),
      onError: (err) => showToast(extractErrorMessage(err, '순위 재계산에 실패했어요.'), 'error'),
    });
  };

  if (isPending || isError) {
    return (
      <AdminDataTable
        columns={[]}
        rows={[]}
        keyExtractor={() => ''}
        loading={isPending}
        error={isError ? extractErrorMessage(error, '대진 정보를 불러오지 못했어요.') : undefined}
        onRetry={() => void refetch()}
      />
    );
  }

  const groups: V1AdminBracketGroup[] = bracket?.groups ?? [];
  const fixtures: V1AdminBracketFixture[] = bracket?.fixtures ?? [];

  // AGF-2/AGF-4: 결과 입력 인라인 유효성 검사 (groups 선언 이후 계산)
  const _rhs = parseInt(homeScore, 10);
  const _ras = parseInt(awayScore, 10);
  const _rhp = parseInt(homePenalty, 10);
  const _rap = parseInt(awayPenalty, 10);
  const isRegularDraw = !Number.isNaN(_rhs) && !Number.isNaN(_ras) && _rhs === _ras;
  const isPenaltyDraw = hasPenalty && !Number.isNaN(_rhp) && !Number.isNaN(_rap) && _rhp === _rap;
  // 승부차기 체크 시 정규 동점이 아니면 에러
  const penaltyWithoutDraw = hasPenalty && !isRegularDraw;
  // 녹아웃 경기 여부: resultFixture의 groupId로 group 조회
  const resultFixtureGroup = resultFixture?.groupId
    ? groups.find((g) => g.id === resultFixture.groupId)
    : undefined;
  const isKnockoutFixture =
    resultFixtureGroup?.phase === 'semi' ||
    resultFixtureGroup?.phase === 'final' ||
    resultFixtureGroup?.phase === 'third_place';
  // 녹아웃인데 정규 동점이고 승부차기 미입력 → 에러
  const knockoutNeedsWinner = isKnockoutFixture && isRegularDraw && !hasPenalty;
  // 저장 차단 조건
  const resultFormBlocked = penaltyWithoutDraw || isPenaltyDraw || knockoutNeedsWinner;

  const hasData = groups.length > 0 || fixtures.length > 0;

  return (
    <>
      {/* 확인 모달 — window.confirm 대체 */}
      {ConfirmModal}
    <div className={[
      'flex flex-col gap-6',
      /* 우측 컬럼(브래킷)에 minmax(0,640px) 상한 추가 — 1920+에서 과폭 방지 */
      hasData ? 'lg:grid lg:grid-cols-[minmax(0,480px)_minmax(0,640px)] lg:items-start lg:gap-6' : '',
    ].join(' ')}>

      {/* ── 좌측 컬럼: 관리 폼 (조 만들기 · 팀 배정 · 픽스처 만들기) ── */}
      <div className="flex flex-col gap-6">

      {/* ── 조 만들기 ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 px-5 py-5">
        <h3 className="text-[15px] font-bold text-gray-900 mb-4">조 만들기</h3>
        <form onSubmit={handleCreateGroup} noValidate className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex flex-col gap-1">
            <label htmlFor="group-name" className="text-[13px] text-gray-900">
              조 이름
            </label>
            <input
              id="group-name"
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="예: A조"
              disabled={createGroup.isPending}
              maxLength={20}
              className={inputCls + ' sm:w-[180px]'}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="group-phase" className="text-[13px] text-gray-900">
              단계
            </label>
            <select
              id="group-phase"
              value={groupPhase}
              onChange={(e) => setGroupPhase(e.target.value as V1TournamentGroupPhase)}
              disabled={createGroup.isPending}
              className={inputCls + ' sm:w-[120px]'}
            >
              <option value="group">조별</option>
              <option value="semi">준결승</option>
              <option value="final">결승</option>
              <option value="third_place">3위 결정전</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="group-advance" className="text-[13px] text-gray-900">
              진출 팀 수 <span className="text-xs text-gray-500">(선택)</span>
            </label>
            <input
              id="group-advance"
              type="number"
              inputMode="numeric"
              min={1}
              value={groupAdvanceCount}
              onChange={(e) => setGroupAdvanceCount(e.target.value)}
              placeholder="예: 2"
              disabled={createGroup.isPending}
              className={inputCls + ' sm:w-[110px]'}
              aria-describedby="group-advance-help"
            />
          </div>
          <button
            type="submit"
            disabled={!groupName.trim() || createGroup.isPending}
            className={submitBtnCls}
          >
            <Plus size={14} aria-hidden="true" />
            조 추가
          </button>
        </form>
        <p id="group-advance-help" className="text-xs text-gray-500 mt-2">
          진출 팀 수를 입력하면 순위표에 상위 N팀 진출선이 표시돼요.
        </p>
      </div>

      {/* ── 팀 배정 ─────────────────────────────────────────────────── */}
      {groups.length > 0 && confirmedRegistrations.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 px-5 py-5">
          <h3 className="text-[15px] font-bold text-gray-900 mb-4">팀 배정</h3>
          <form onSubmit={handleAssignTeam} noValidate className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex flex-col gap-1">
              <label htmlFor="assign-group" className="text-[13px] text-gray-900">
                조 선택
              </label>
              <select
                id="assign-group"
                value={assignGroupId}
                onChange={(e) => setAssignGroupId(e.target.value)}
                disabled={assignGroupTeam.isPending}
                className={inputCls + ' sm:w-[160px]'}
              >
                <option value="">조를 선택해 주세요</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="assign-team" className="text-[13px] text-gray-900">
                팀 선택
              </label>
              <select
                id="assign-team"
                value={assignRegId}
                onChange={(e) => setAssignRegId(e.target.value)}
                disabled={assignGroupTeam.isPending}
                className={inputCls + ' sm:w-[200px]'}
              >
                <option value="">확정 팀을 선택해 주세요</option>
                {confirmedRegistrations.map((r) => (
                  <option key={r.id} value={r.id}>{r.teamName ?? r.teamId}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={!assignGroupId || !assignRegId || assignGroupTeam.isPending}
              className={submitBtnCls}
            >
              배정
            </button>
          </form>
          <p className="text-xs text-gray-500 mt-1" aria-live="polite">확정된 팀만 배정할 수 있어요.</p>
        </div>
      )}

      {/* ── 픽스처 만들기 ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 px-5 py-5">
        <h3 className="text-[15px] font-bold text-gray-900 mb-4">경기 일정 만들기</h3>

        {/* ── 대진 자동 생성 ── */}
        {groups.length > 0 && (
          <div className="mb-5 pb-5 border-b border-gray-100">
            <p className="text-xs text-gray-500 mb-2">
              조를 선택하면 조별 라운드로빈 또는 토너먼트 시드 배정 경기 일정을 자동으로 만들어요.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
              <div className="flex flex-col gap-1">
                <label htmlFor="auto-gen-group" className="text-[13px] text-gray-900">
                  자동 생성할 조
                </label>
                <select
                  id="auto-gen-group"
                  value={autoGenGroupId}
                  onChange={(e) => setAutoGenGroupId(e.target.value)}
                  disabled={isAutoGenerating || createFixture.isPending}
                  className={inputCls + ' sm:w-[200px]'}
                >
                  <option value="">조를 선택해 주세요</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                disabled={!autoGenGroupId || isAutoGenerating || createFixture.isPending}
                onClick={() => void handleAutoGenerate(autoGenGroupId)}
                className={submitBtnCls}
                aria-label="선택한 조의 경기 일정 자동 생성"
              >
                <RefreshCw size={14} aria-hidden="true" />
                {isAutoGenerating ? '생성 중…' : '대진 자동 생성'}
              </button>
            </div>
          </div>
        )}

        {/* ── 수동 픽스처 생성 폼 ── */}
        {(() => {
          // Determine phase of the currently selected group for round options
          const selectedGroup = groups.find((g) => g.id === fixtureGroupId);
          const selectedPhase = selectedGroup?.phase ?? 'group';
          const isKnockoutPhase =
            selectedPhase === 'semi' || selectedPhase === 'final' || selectedPhase === 'third_place';

          // Round options per phase
          const roundOptions: string[] = isKnockoutPhase
            ? ['16강', '8강', '4강', '결승', '3·4위전']
            : ['조별 1라운드', '조별 2라운드', '조별 3라운드', '조별 4라운드', '조별 5라운드'];

          // Double-booking detection: which reg IDs are already used in fixtureRound in selected group
          const bookedInRound = new Set<string>();
          if (fixtureRound) {
            fixtures
              .filter((f) => f.round === fixtureRound && (!fixtureGroupId || f.groupId === fixtureGroupId))
              .forEach((f) => {
                if (f.homeRegistrationId) bookedInRound.add(f.homeRegistrationId);
                if (f.awayRegistrationId) bookedInRound.add(f.awayRegistrationId);
              });
          }

          const homeBooked = fixtureHomeRegId ? bookedInRound.has(fixtureHomeRegId) : false;
          const awayBooked = fixtureAwayRegId ? bookedInRound.has(fixtureAwayRegId) : false;
          const sameTeam = !!(fixtureHomeRegId && fixtureHomeRegId === fixtureAwayRegId);
          const hasBookingWarn = !sameTeam && (homeBooked || awayBooked);

          return (
            <form onSubmit={handleCreateFixture} noValidate className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Round select */}
              <div className="flex flex-col gap-1">
                <label htmlFor="fixture-round" className="text-[13px] text-gray-900">라운드</label>
                <select
                  id="fixture-round"
                  value={fixtureRound}
                  onChange={(e) => setFixtureRound(e.target.value)}
                  disabled={createFixture.isPending}
                  className={inputCls}
                >
                  <option value="">라운드 선택</option>
                  {roundOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              {/* Fixture number */}
              <div className="flex flex-col gap-1">
                <label htmlFor="fixture-number" className="text-[13px] text-gray-900">번호</label>
                <input
                  id="fixture-number"
                  type="number"
                  min="1"
                  value={fixtureNumber}
                  onChange={(e) => setFixtureNumber(e.target.value)}
                  disabled={createFixture.isPending}
                  className={inputCls}
                />
              </div>

              {/* Group select */}
              {groups.length > 0 && (
                <div className="flex flex-col gap-1">
                  <label htmlFor="fixture-group" className="text-[13px] text-gray-900">소속 조 (선택)</label>
                  <select
                    id="fixture-group"
                    value={fixtureGroupId}
                    onChange={(e) => {
                      setFixtureGroupId(e.target.value);
                      // reset round when group/phase changes
                      setFixtureRound('');
                    }}
                    disabled={createFixture.isPending}
                    className={inputCls}
                  >
                    <option value="">조 없음</option>
                    {groups.map((g) => (<option key={g.id} value={g.id}>{g.name}</option>))}
                  </select>
                </div>
              )}

              {/* Home team — exclude away selection */}
              <div className="flex flex-col gap-1">
                <label htmlFor="fixture-home" className="text-[13px] text-gray-900">
                  홈 팀 (선택)
                  {homeBooked && (
                    <span className="ml-1 text-xs text-amber-600" aria-live="polite">
                      이미 해당 라운드에 배정됨
                    </span>
                  )}
                </label>
                <select
                  id="fixture-home"
                  value={fixtureHomeRegId}
                  onChange={(e) => setFixtureHomeRegId(e.target.value)}
                  disabled={createFixture.isPending}
                  className={inputCls + (homeBooked ? ' border-amber-400 focus:border-amber-500 focus:ring-amber-400/20' : '')}
                >
                  <option value="">미정</option>
                  {confirmedRegistrations
                    .filter((r) => r.id !== fixtureAwayRegId)
                    .map((r) => (<option key={r.id} value={r.id}>{r.teamName ?? r.teamId}</option>))}
                </select>
              </div>

              {/* Away team — exclude home selection */}
              <div className="flex flex-col gap-1">
                <label htmlFor="fixture-away" className="text-[13px] text-gray-900">
                  어웨이 팀 (선택)
                  {awayBooked && (
                    <span className="ml-1 text-xs text-amber-600" aria-live="polite">
                      이미 해당 라운드에 배정됨
                    </span>
                  )}
                </label>
                <select
                  id="fixture-away"
                  value={fixtureAwayRegId}
                  onChange={(e) => setFixtureAwayRegId(e.target.value)}
                  disabled={createFixture.isPending}
                  className={inputCls + (awayBooked ? ' border-amber-400 focus:border-amber-500 focus:ring-amber-400/20' : '')}
                >
                  <option value="">미정</option>
                  {confirmedRegistrations
                    .filter((r) => r.id !== fixtureHomeRegId)
                    .map((r) => (<option key={r.id} value={r.id}>{r.teamName ?? r.teamId}</option>))}
                </select>
              </div>

              <div className="flex flex-col gap-1 items-start sm:col-span-2">
                {/* Booking / same-team warning */}
                {(sameTeam || hasBookingWarn) && (
                  <p className="text-xs text-amber-600" role="alert">
                    {sameTeam
                      ? '홈과 어웨이에 같은 팀을 선택할 수 없어요.'
                      : '해당 라운드에 이미 배정된 팀이 있어요. 확인 후 추가해 주세요.'}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={!fixtureRound || !fixtureNumber || sameTeam || createFixture.isPending}
                  className={submitBtnCls + ' w-full sm:w-auto'}
                >
                  <Plus size={14} aria-hidden="true" />경기 일정 추가
                </button>
              </div>
            </form>
          );
        })()}
      </div>

      </div>{/* end left column */}

      {/* ── 우측 컬럼: 데이터 (조별 순위표 · 픽스처 목록) ── */}
      <div className="flex flex-col gap-6">

      {/* ── 조별 순위표 ──────────────────────────────────────────────── */}
      {groups.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-bold text-gray-900">조별 순위표</h3>
            <button
              type="button"
              onClick={handleRecalculate}
              disabled={recalculate.isPending}
              className="inline-flex items-center gap-1 min-h-[44px] px-3 rounded-lg text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
            >
              <RefreshCw size={13} aria-hidden="true" />
              순위 재계산
            </button>
          </div>
          {groups.map((group) => {
            const standings = bracket?.standings.filter((s) => s.groupId === group.id) ?? [];
            const standingColumns: AdminTableColumn<V1AdminBracketStanding>[] = [
              {
                key: 'position',
                header: '순위',
                align: 'center',
                width: 'w-[56px]',
                render: (s) => <span className="tabular-nums text-gray-600">{s.position}</span>,
              },
              {
                key: 'teamName',
                header: '팀',
                render: (s) => <span className="font-medium text-gray-900">{s.teamName ?? s.registrationId}</span>,
              },
              {
                key: 'wins',
                header: '승',
                align: 'center',
                width: 'w-[52px]',
                render: (s) => <span className="tabular-nums">{s.wins}</span>,
              },
              {
                key: 'draws',
                header: '무',
                align: 'center',
                width: 'w-[52px]',
                render: (s) => <span className="tabular-nums">{s.draws}</span>,
              },
              {
                key: 'losses',
                header: '패',
                align: 'center',
                width: 'w-[52px]',
                render: (s) => <span className="tabular-nums">{s.losses}</span>,
              },
              {
                key: 'goalsFor',
                header: '득점',
                align: 'center',
                width: 'w-[60px]',
                render: (s) => <span className="tabular-nums">{s.goalsFor}</span>,
              },
              {
                key: 'goalsAgainst',
                header: '실점',
                align: 'center',
                width: 'w-[60px]',
                render: (s) => <span className="tabular-nums">{s.goalsAgainst}</span>,
              },
              {
                key: 'points',
                header: '승점',
                align: 'right',
                width: 'w-[64px]',
                render: (s) => <span className="tabular-nums font-semibold text-gray-900">{s.points}</span>,
              },
            ];
            // #6a: knockout phases (semi/final/third_place) with no teams → slim hint row
            //       group phase keeps AdminEmpty as-is (different table-level empty is fine)
            const isKnockout = group.phase === 'semi' || group.phase === 'final' || group.phase === 'third_place';
            const knockoutEmpty = isKnockout && standings.length === 0;

            return (
              <div key={group.id} className="flex flex-col gap-2">
                <h4 className="text-[13px] font-bold text-gray-600 px-1">{group.name}</h4>
                {knockoutEmpty ? (
                  // #6a: single slim inline hint instead of tall AdminEmpty box
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-dashed border-gray-200">
                    <span className="text-xs text-gray-500" aria-label={`${group.name} 팀 배정 안내`}>
                      아직 배정된 팀이 없어요
                    </span>
                    <span className="text-xs text-gray-500" aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={() => {
                        setAssignGroupId(group.id);
                        const el = document.getElementById('assign-group');
                        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        el?.focus();
                      }}
                      className="text-xs text-blue-500 hover:text-blue-600 underline underline-offset-2 min-h-[44px] inline-flex items-center px-1 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
                    >
                      팀 배정하기
                    </button>
                  </div>
                ) : (
                  <AdminDataTable<V1AdminBracketStanding>
                    columns={standingColumns}
                    rows={standings}
                    keyExtractor={(s) => s.id}
                    scrollOnMobile
                    empty={<AdminEmpty title="팀이 없어요" description="배정된 팀이 없어요." />}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── 픽스처 목록 (f13: AdminDataTable — 모바일 card reflow 자동 적용) ── */}
      {fixtures.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-[15px] font-bold text-gray-900">경기 일정</h3>
          {/* #6b: scrollOnMobile so wide fixture rows scroll horizontally on narrow screens */}
          <AdminDataTable<V1AdminBracketFixture>
            scrollOnMobile
            columns={[
              {
                key: 'round',
                header: '라운드',
                render: (f) => <span className="text-gray-600">{f.round}</span>,
              },
              {
                key: 'fixtureNumber',
                header: '번호',
                width: 'w-[64px]',
                align: 'center',
                render: (f) => <span className="tabular-nums text-gray-600">{f.fixtureNumber}</span>,
              },
              {
                key: 'homeTeamName',
                header: '홈',
                render: (f) => <span className="font-medium text-gray-900">{f.homeTeamName ?? '—'}</span>,
              },
              {
                key: 'awayTeamName',
                header: '어웨이',
                render: (f) => <span className="font-medium text-gray-900">{f.awayTeamName ?? '—'}</span>,
              },
              {
                key: 'result',
                header: '결과',
                width: 'w-[140px]',
                render: (f) => (
                  <span className="tabular-nums text-gray-600">
                    {f.result
                      ? `${f.result.homeScore} : ${f.result.awayScore}${f.result.hasPenalty ? ` (PK ${f.result.homePenaltyScore}:${f.result.awayPenaltyScore})` : ''}`
                      : '—'}
                  </span>
                ),
              },
            ]}
            rows={fixtures}
            keyExtractor={(f) => f.id}
            renderActions={(f) => {
              // AGF-1: 결과 입력은 home·away 모두 배정된 경우에만 활성
              const bothAssigned = !!f.homeRegistrationId && !!f.awayRegistrationId;
              const disabledTitle = !bothAssigned
                ? '홈·어웨이 팀이 모두 배정되어야 결과를 입력할 수 있어요'
                : undefined;
              return (
                <button
                  type="button"
                  onClick={() => {
                    if (!bothAssigned) return;
                    setResultFixture(f);
                    setHomeScore(String(f.result?.homeScore ?? 0));
                    setAwayScore(String(f.result?.awayScore ?? 0));
                    setHasPenalty(f.result?.hasPenalty ?? false);
                    setHomePenalty(String(f.result?.homePenaltyScore ?? 0));
                    setAwayPenalty(String(f.result?.awayPenaltyScore ?? 0));
                    setResultOpen(true);
                  }}
                  disabled={!bothAssigned}
                  aria-label={`${f.round} ${f.fixtureNumber}번 결과 입력`}
                  title={disabledTitle}
                  aria-disabled={!bothAssigned}
                  className="inline-flex items-center gap-1 min-h-[44px] px-3 rounded-lg text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  결과 입력
                </button>
              );
            }}
          />
        </div>
      )}

      </div>{/* end right column */}

      {/* ── Result input modal ────────────────────────────────────────── */}
      <SimpleModal
        open={resultOpen}
        title="결과 입력"
        onClose={() => setResultOpen(false)}
        pending={recordResult.isPending}
      >
        <form onSubmit={handleRecordResult} noValidate className="flex flex-col gap-4">
          {/* f14: fixed labels '홈'/'어웨이' + identifier as small caption */}
          <div className="flex items-center gap-3">
            <div className="flex flex-col gap-1 flex-1">
              <label htmlFor="home-score" className="text-[13px] text-gray-900">
                홈
              </label>
              {(resultFixture?.homeTeamName ?? resultFixture?.homeRegistrationId) && (
                <p className="text-xs text-gray-500 truncate max-w-[140px]">
                  {resultFixture?.homeTeamName ?? resultFixture?.homeRegistrationId}
                </p>
              )}
              <input
                id="home-score"
                type="number"
                min="0"
                value={homeScore}
                onChange={(e) => setHomeScore(e.target.value)}
                disabled={recordResult.isPending}
                className={inputCls}
              />
            </div>
            <span className="text-xl font-bold text-gray-500 mt-5" aria-hidden="true">:</span>
            <div className="flex flex-col gap-1 flex-1">
              <label htmlFor="away-score" className="text-[13px] text-gray-900">
                어웨이
              </label>
              {(resultFixture?.awayTeamName ?? resultFixture?.awayRegistrationId) && (
                <p className="text-xs text-gray-500 truncate max-w-[140px]">
                  {resultFixture?.awayTeamName ?? resultFixture?.awayRegistrationId}
                </p>
              )}
              <input
                id="away-score"
                type="number"
                min="0"
                value={awayScore}
                onChange={(e) => setAwayScore(e.target.value)}
                disabled={recordResult.isPending}
                className={inputCls}
              />
            </div>
          </div>

          {/* AGF-4: 녹아웃 경기 정규 동점 → 승부차기 필요 경고 */}
          {knockoutNeedsWinner && (
            <p className="text-xs text-red-500" role="alert" aria-live="polite">
              녹아웃 경기는 승자가 필요해요. 승부차기를 입력해 주세요.
            </p>
          )}

          <label className="flex items-center gap-2 text-[13px] text-gray-900 cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={hasPenalty}
              onChange={(e) => setHasPenalty(e.target.checked)}
              disabled={recordResult.isPending}
              className="w-4 h-4 rounded accent-blue-500"
            />
            승부차기 있음
          </label>

          {/* AGF-2: 승부차기 체크 시 정규 동점 아니면 에러 */}
          {penaltyWithoutDraw && (
            <p className="text-xs text-red-500" role="alert" aria-live="polite">
              정규 경기가 동점일 때만 승부차기를 입력할 수 있어요.
            </p>
          )}

          {hasPenalty && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1 flex-1">
                  <label htmlFor="home-penalty" className="text-[13px] text-gray-900">홈 PK</label>
                  <input id="home-penalty" type="number" min="0" value={homePenalty} onChange={(e) => setHomePenalty(e.target.value)} disabled={recordResult.isPending} className={inputCls} />
                </div>
                <span className="text-xl font-bold text-gray-500 mt-5" aria-hidden="true">:</span>
                <div className="flex flex-col gap-1 flex-1">
                  <label htmlFor="away-penalty" className="text-[13px] text-gray-900">어웨이 PK</label>
                  <input id="away-penalty" type="number" min="0" value={awayPenalty} onChange={(e) => setAwayPenalty(e.target.value)} disabled={recordResult.isPending} className={inputCls} />
                </div>
              </div>
              {/* AGF-2: 승부차기 점수 동일 차단 */}
              {isPenaltyDraw && (
                <p className="text-xs text-red-500" role="alert" aria-live="polite">
                  승부차기 점수가 같으면 승자를 가릴 수 없어요.
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setResultOpen(false)}
              disabled={recordResult.isPending}
              className="flex-1 h-[44px] rounded-xl text-[13px] text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={recordResult.isPending || resultFormBlocked}
              className={'flex-1 ' + submitBtnCls}
            >
              {recordResult.isPending ? '저장 중…' : '저장'}
            </button>
          </div>
        </form>
      </SimpleModal>
    </div>
    </>
  );
}

// ── Tab: Announcements ────────────────────────────────────────────────────

function AnnouncementsTab({
  tournamentId,
  showToast,
}: {
  tournamentId: string;
  showToast: (msg: string, v?: 'success' | 'error') => void;
}) {
  const { data: annData, isPending: annPending, isError: annError, error: annErr, refetch: annRefetch } = useV1AdminAnnouncements(tournamentId);
  const announcements = annData?.items ?? [];
  const createAnnouncement = useV1CreateAnnouncement(tournamentId);
  const updateAnnouncement = useV1UpdateAnnouncement(tournamentId);
  const publishAnnouncement = useV1PublishAnnouncement(tournamentId);
  const deleteAnnouncement = useV1DeleteAnnouncement(tournamentId);

  const [editingAnnouncement, setEditingAnnouncement] = useState<V1AdminTournamentAnnouncement | null>(null);
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annAudience, setAnnAudience] = useState<V1AnnouncementAudience>('all_registered');
  const [annPublish, setAnnPublish] = useState(false);
  const isSavingAnnouncement = createAnnouncement.isPending || updateAnnouncement.isPending;

  const resetAnnouncementForm = () => {
    setEditingAnnouncement(null);
    setAnnTitle('');
    setAnnBody('');
    setAnnAudience('all_registered');
    setAnnPublish(false);
  };

  const startEditAnnouncement = (ann: V1AdminTournamentAnnouncement) => {
    setEditingAnnouncement(ann);
    setAnnTitle(ann.title);
    setAnnBody(ann.body);
    setAnnAudience(ann.audience as V1AnnouncementAudience);
    setAnnPublish(Boolean(ann.publishedAt));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitle.trim() || !annBody.trim()) return;
    const payload = {
      title: annTitle.trim(),
      body: annBody.trim(),
      audience: annAudience,
      publish: annPublish,
    };
    if (editingAnnouncement) {
      updateAnnouncement.mutate(
        {
          announcementId: editingAnnouncement.id,
          body: payload,
        },
        {
          onSuccess: () => {
            resetAnnouncementForm();
            showToast('공지를 수정했어요.', 'success');
          },
          onError: (err) =>
            showToast(extractErrorMessage(err, '공지 수정에 실패했어요.'), 'error'),
        },
      );
      return;
    }
    createAnnouncement.mutate(
      {
        title: annTitle.trim(),
        body: annBody.trim(),
        audience: annAudience,
        publish: annPublish,
      },
      {
        onSuccess: () => {
          resetAnnouncementForm();
          showToast('공지를 작성했어요.', 'success');
        },
        onError: (err) =>
          showToast(extractErrorMessage(err, '공지 작성에 실패했어요.'), 'error'),
      },
    );
  };

  const handlePublish = (announcementId: string) => {
    publishAnnouncement.mutate(announcementId, {
      onSuccess: (res) => {
        if (res.alreadyPublished) {
          showToast('이미 발행된 공지예요.', 'success');
        } else {
          showToast('공지를 발행했어요.', 'success');
        }
      },
      onError: (err) =>
        showToast(extractErrorMessage(err, '공지 발행에 실패했어요.'), 'error'),
    });
  };

  const handleDelete = (ann: V1AdminTournamentAnnouncement) => {
    const confirmed = window.confirm(`"${ann.title}" 공지를 삭제할까요? 삭제한 공지는 복구할 수 없어요.`);
    if (!confirmed) return;
    deleteAnnouncement.mutate(ann.id, {
      onSuccess: () => {
        if (editingAnnouncement?.id === ann.id) resetAnnouncementForm();
        showToast('공지를 삭제했어요.', 'success');
      },
      onError: (err) =>
        showToast(extractErrorMessage(err, '공지 삭제에 실패했어요.'), 'error'),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── 공지 작성 폼 ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 px-5 py-5">
        <h3 className="text-[15px] font-bold text-gray-900 mb-4">공지 작성</h3>
        {editingAnnouncement && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-700">
            <span className="font-medium">선택한 공지를 수정 중이에요.</span>
            <button
              type="button"
              onClick={resetAnnouncementForm}
              disabled={isSavingAnnouncement}
              className="min-h-[32px] rounded-lg bg-white px-3 font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
            >
              취소
            </button>
          </div>
        )}
        <form onSubmit={handleSave} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ann-title" className="text-[13px] text-gray-900">
              제목 <span className="text-red-500" aria-hidden="true">*</span>
              <span className="sr-only">(필수)</span>
            </label>
            <input
              id="ann-title"
              type="text"
              value={annTitle}
              onChange={(e) => setAnnTitle(e.target.value)}
              disabled={isSavingAnnouncement}
              placeholder="공지 제목"
              maxLength={100}
              required
              aria-required="true"
              className={inputCls}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="ann-body" className="text-[13px] text-gray-900">
              내용 <span className="text-red-500" aria-hidden="true">*</span>
              <span className="sr-only">(필수)</span>
            </label>
            <textarea
              id="ann-body"
              value={annBody}
              onChange={(e) => setAnnBody(e.target.value)}
              disabled={isSavingAnnouncement}
              rows={4}
              placeholder="공지 내용을 입력해 주세요."
              required
              aria-required="true"
              className={textareaCls}
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <label htmlFor="ann-audience" className="text-[13px] text-gray-900">
                대상
              </label>
              <select
                id="ann-audience"
                value={annAudience}
                onChange={(e) => setAnnAudience(e.target.value as V1AnnouncementAudience)}
                disabled={isSavingAnnouncement}
                className={inputCls}
              >
                <option value="public">전체 공개</option>
                <option value="all_registered">모든 신청팀</option>
                <option value="confirmed_only">확정팀만</option>
                <option value="waitlist">대기팀만</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-[13px] text-gray-900 cursor-pointer min-h-[44px] self-end sm:pb-0.5">
              <input
                type="checkbox"
                checked={annPublish}
                onChange={(e) => setAnnPublish(e.target.checked)}
                disabled={isSavingAnnouncement}
                className="w-4 h-4 rounded accent-blue-500"
              />
              즉시 발행
            </label>
          </div>

          <button
            type="submit"
            disabled={!annTitle.trim() || !annBody.trim() || isSavingAnnouncement}
            className={submitBtnCls}
          >
            <Megaphone size={15} aria-hidden="true" />
            {createAnnouncement.isPending ? '작성 중…' : '공지 작성'}
          </button>
        </form>
      </div>

      {/* ── 공지 목록 ─────────────────────────────────────────────────── */}
      {(annPending || annError) && (
        <AdminDataTable
          columns={[]}
          rows={[]}
          keyExtractor={() => ''}
          loading={annPending}
          error={annError ? extractErrorMessage(annErr, '공지 목록을 불러오지 못했어요.') : undefined}
          onRetry={() => void annRefetch()}
        />
      )}
      {!annPending && !annError && announcements.length === 0 && (
        <AdminEmpty title="공지가 없어요" description="아직 작성된 공지가 없어요." />
      )}
      {!annPending && !annError && announcements.length > 0 && (
        <div className="flex flex-col gap-3">
          {announcements.map((ann) => (
            <div key={ann.id} className="bg-white rounded-2xl border border-gray-100 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-gray-900 mb-0.5 truncate">{ann.title}</p>
                  <p className="text-xs text-gray-500">
                    {ann.publishedAt ? `발행됨 · ${formatDate(ann.publishedAt)}` : '미발행'}
                    {' '}·{' '}
                    {ann.audience === 'public'
                      ? '전체 공개'
                      : ann.audience === 'all_registered'
                      ? '모든 신청팀'
                      : ann.audience === 'confirmed_only'
                      ? '확정팀만'
                      : '대기팀만'}
                  </p>
                </div>
                {!ann.publishedAt && (
                  <button
                    type="button"
                    onClick={() => handlePublish(ann.id)}
                    disabled={publishAnnouncement.isPending}
                    aria-label={`"${ann.title}" 발행`}
                    className="inline-flex items-center gap-1 min-h-[44px] px-3 rounded-lg text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 shrink-0"
                  >
                    <Send size={12} aria-hidden="true" />
                    발행
                  </button>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => startEditAnnouncement(ann)}
                  disabled={isSavingAnnouncement || deleteAnnouncement.isPending}
                  aria-label={`"${ann.title}" 수정`}
                  className="inline-flex items-center gap-1 min-h-[40px] px-3 rounded-lg text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                >
                  <Pencil size={12} aria-hidden="true" />
                  수정
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(ann)}
                  disabled={deleteAnnouncement.isPending}
                  aria-label={`"${ann.title}" 삭제`}
                  className="inline-flex items-center gap-1 min-h-[40px] px-3 rounded-lg text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-red-500 focus-visible:outline-offset-2"
                >
                  <Trash2 size={12} aria-hidden="true" />
                  삭제
                </button>
              </div>
              <p className="mt-2 text-[13px] text-gray-600 whitespace-pre-wrap leading-relaxed">
                {ann.body}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main detail client ────────────────────────────────────────────────────

export default function TournamentDetailClient({ id }: { id: string }) {
  const { data: tournament, isPending, isError, error, refetch } = useV1AdminTournament(id);
  const { data: adminMe } = useV1AdminMe();
  const canWrite = adminMe?.capabilities.includes('status:write') ?? false;
  const changeStatus = useV1ChangeTournamentStatus(id);

  const { toasts, showToast } = useAdminToast();
  const updateTournament = useV1UpdateTournament(id);
  const uploadImages = useV1UploadImages();
  const { confirm: confirmStatusChange, ConfirmModal: StatusConfirmModal } = useConfirm();

  const [activeTab, setActiveTab] = useState<TabId>('registrations');

  // ── Edit form state ──────────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editScheduledAt, setEditScheduledAt] = useState('');
  const [editScheduledEndAt, setEditScheduledEndAt] = useState('');
  const [editDeadlineAt, setEditDeadlineAt] = useState('');
  const [editVenue, setEditVenue] = useState('');
  const [editEntryFee, setEditEntryFee] = useState('');
  const [editTeamCount, setEditTeamCount] = useState('');
  const [editMinPlayers, setEditMinPlayers] = useState('');
  const [editMaxPlayers, setEditMaxPlayers] = useState('');
  const [editPrizeSummary, setEditPrizeSummary] = useState('');
  const [editPrizeBreakdown, setEditPrizeBreakdown] = useState('');
  const [editBankName, setEditBankName] = useState('');
  const [editBankAccount, setEditBankAccount] = useState('');
  const [editBankHolder, setEditBankHolder] = useState('');
  const [editRulesText, setEditRulesText] = useState('');
  const [editRefundPolicyText, setEditRefundPolicyText] = useState('');
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoHomeEnabled, setPromoHomeEnabled] = useState(false);
  const [promoHomeTitle, setPromoHomeTitle] = useState('');
  const [promoHomeSubtitle, setPromoHomeSubtitle] = useState('');
  const [promoHomeImageUrl, setPromoHomeImageUrl] = useState('');
  const [promoHomeBadgeText, setPromoHomeBadgeText] = useState('');
  const [promoHomeDateText, setPromoHomeDateText] = useState('');
  const [promoHomeTeamsText, setPromoHomeTeamsText] = useState('');
  const [promoHomeLocationText, setPromoHomeLocationText] = useState('');
  const [promoHomePrizeText, setPromoHomePrizeText] = useState('');
  const [promoHomePriority, setPromoHomePriority] = useState('0');
  const [promoListEnabled, setPromoListEnabled] = useState(false);
  const [promoListTitle, setPromoListTitle] = useState('');
  const [promoListSubtitle, setPromoListSubtitle] = useState('');
  const [promoListImageUrl, setPromoListImageUrl] = useState('');
  const [promoListBadgeText, setPromoListBadgeText] = useState('');
  const [promoListDateText, setPromoListDateText] = useState('');
  const [promoListTeamsText, setPromoListTeamsText] = useState('');
  const [promoListLocationText, setPromoListLocationText] = useState('');
  const [promoListPrizeText, setPromoListPrizeText] = useState('');
  const [promoListPriority, setPromoListPriority] = useState('0');
  const [promoUploadingSlot, setPromoUploadingSlot] = useState<'home' | 'list' | null>(null);

  /** Open edit modal prefilled with current tournament values */
  const openEdit = () => {
    if (!tournament) return;
    setEditTitle(tournament.title);
    setEditScheduledAt(isoToDatetimeLocalValue(tournament.scheduledAt));
    setEditScheduledEndAt(isoToDatetimeLocalValue(tournament.scheduledEndAt));
    setEditDeadlineAt(isoToDatetimeLocalValue(tournament.registrationDeadlineAt));
    setEditVenue(tournament.venue ?? '');
    setEditEntryFee(String(tournament.entryFee));
    setEditTeamCount(String(tournament.teamCount));
    setEditMinPlayers(String(tournament.minPlayers));
    setEditMaxPlayers(String(tournament.maxPlayers));
    setEditPrizeSummary(tournament.prizeSummary ?? '');
    setEditPrizeBreakdown(tournament.prizeBreakdown ?? '');
    setEditBankName(tournament.bankName ?? '');
    setEditBankAccount(tournament.bankAccount ?? '');
    setEditBankHolder(tournament.bankHolder ?? '');
    setEditRulesText(tournament.rulesText ?? '');
    setEditRefundPolicyText(tournament.refundPolicyText ?? '');
    setEditOpen(true);
  };

  const openPromoEdit = () => {
    if (!tournament) return;
    setPromoHomeEnabled(tournament.promoHomeEnabled ?? false);
    setPromoHomeTitle(tournament.promoHomeTitle ?? '');
    setPromoHomeSubtitle(tournament.promoHomeSubtitle ?? '');
    setPromoHomeImageUrl(tournament.promoHomeImageUrl ?? '');
    setPromoHomeBadgeText(tournament.promoHomeBadgeText ?? '');
    setPromoHomeDateText(tournament.promoHomeDateText ?? '');
    setPromoHomeTeamsText(tournament.promoHomeTeamsText ?? '');
    setPromoHomeLocationText(tournament.promoHomeLocationText ?? '');
    setPromoHomePrizeText(tournament.promoHomePrizeText ?? '');
    setPromoHomePriority(String(tournament.promoHomePriority ?? 0));
    setPromoListEnabled(tournament.promoListEnabled ?? false);
    setPromoListTitle(tournament.promoListTitle ?? '');
    setPromoListSubtitle(tournament.promoListSubtitle ?? '');
    setPromoListImageUrl(tournament.promoListImageUrl ?? '');
    setPromoListBadgeText(tournament.promoListBadgeText ?? '');
    setPromoListDateText(tournament.promoListDateText ?? '');
    setPromoListTeamsText(tournament.promoListTeamsText ?? '');
    setPromoListLocationText(tournament.promoListLocationText ?? '');
    setPromoListPrizeText(tournament.promoListPrizeText ?? '');
    setPromoListPriority(String(tournament.promoListPriority ?? 0));
    setPromoOpen(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tournament) return;
    const payload: V1UpdateTournamentPayload = {};
    if (editTitle.trim()) payload.title = editTitle.trim();
    if (editScheduledAt !== isoToDatetimeLocalValue(tournament.scheduledAt)) {
      const scheduledAtIso = datetimeLocalValueToIso(editScheduledAt);
      if (scheduledAtIso) payload.scheduledAt = scheduledAtIso;
    }
    if (editScheduledEndAt !== isoToDatetimeLocalValue(tournament.scheduledEndAt)) {
      payload.scheduledEndAt = datetimeLocalValueToIso(editScheduledEndAt);
    }
    if (editDeadlineAt !== isoToDatetimeLocalValue(tournament.registrationDeadlineAt)) {
      const deadlineAtIso = datetimeLocalValueToIso(editDeadlineAt);
      if (deadlineAtIso) payload.registrationDeadlineAt = deadlineAtIso;
    }
    if (editVenue.trim()) payload.venue = editVenue.trim();
    const fee = Number(editEntryFee);
    if (!Number.isNaN(fee)) payload.entryFee = fee;
    const tc = Number(editTeamCount);
    if (!Number.isNaN(tc) && tc > 0) payload.teamCount = tc;
    const mn = Number(editMinPlayers);
    if (!Number.isNaN(mn) && mn > 0) payload.minPlayers = mn;
    const mx = Number(editMaxPlayers);
    if (!Number.isNaN(mx) && mx > 0) payload.maxPlayers = mx;
    if (editPrizeSummary.trim()) payload.prizeSummary = editPrizeSummary.trim();
    if (editPrizeBreakdown.trim()) payload.prizeBreakdown = editPrizeBreakdown.trim();
    if (editBankName.trim()) payload.bankName = editBankName.trim();
    if (editBankAccount.trim()) payload.bankAccount = editBankAccount.trim();
    if (editBankHolder.trim()) payload.bankHolder = editBankHolder.trim();
    if (editRulesText.trim()) payload.rulesText = editRulesText.trim();
    if (editRefundPolicyText.trim()) payload.refundPolicyText = editRefundPolicyText.trim();

    updateTournament.mutate(payload, {
      onSuccess: () => {
        setEditOpen(false);
        showToast('대회 정보를 수정했어요.', 'success');
      },
      onError: (err) =>
        showToast(extractErrorMessage(err, '대회 정보 수정에 실패했어요.'), 'error'),
    });
  };

  const handlePromoImageChange = async (slot: 'home' | 'list', file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('이미지 파일만 첨부할 수 있어요.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('이미지는 5MB 이하로 첨부해 주세요.', 'error');
      return;
    }

    setPromoUploadingSlot(slot);
    try {
      const result = await uploadImages.mutateAsync(file);
      const url = result.urls[0];
      if (!url) {
        showToast('업로드된 이미지 URL을 받지 못했어요.', 'error');
        return;
      }
      if (slot === 'home') {
        setPromoHomeImageUrl(url);
      } else {
        setPromoListImageUrl(url);
      }
      showToast('이미지를 첨부했어요. 저장을 눌러 반영해 주세요.', 'success');
    } catch (err) {
      showToast(extractErrorMessage(err, '이미지 업로드에 실패했어요.'), 'error');
    } finally {
      setPromoUploadingSlot(null);
    }
  };

  const handlePromoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const homePriority = Number(promoHomePriority);
    const listPriority = Number(promoListPriority);
    const payload: V1UpdateTournamentPayload = {
      promoHomeEnabled,
      promoHomeTitle: promoHomeTitle.trim(),
      promoHomeSubtitle: promoHomeSubtitle.trim(),
      promoHomeImageUrl: promoHomeImageUrl.trim(),
      promoHomeBadgeText: promoHomeBadgeText.trim(),
      promoHomeDateText: promoHomeDateText.trim(),
      promoHomeTeamsText: promoHomeTeamsText.trim(),
      promoHomeLocationText: promoHomeLocationText.trim(),
      promoHomePrizeText: promoHomePrizeText.trim(),
      promoHomePriority: Number.isNaN(homePriority) ? 0 : homePriority,
      promoListEnabled,
      promoListTitle: promoListTitle.trim(),
      promoListSubtitle: promoListSubtitle.trim(),
      promoListImageUrl: promoListImageUrl.trim(),
      promoListBadgeText: promoListBadgeText.trim(),
      promoListDateText: promoListDateText.trim(),
      promoListTeamsText: promoListTeamsText.trim(),
      promoListLocationText: promoListLocationText.trim(),
      promoListPrizeText: promoListPrizeText.trim(),
      promoListPriority: Number.isNaN(listPriority) ? 0 : listPriority,
    };

    updateTournament.mutate(payload, {
      onSuccess: () => {
        setPromoOpen(false);
        showToast('홍보 카드 설정을 저장했어요.', 'success');
      },
      onError: (err) =>
        showToast(extractErrorMessage(err, '홍보 카드 설정 저장에 실패했어요.'), 'error'),
    });
  };

  // ── Registration data (needed by bracket tab for confirmed teams) ────
  const { data: regData } = useV1AdminTournamentRegistrations(id);
  const registrations = regData?.items ?? [];

  // ── Status change ────────────────────────────────────────────────────
  const handleStatusChange = async (nextStatus: V1TournamentStatus) => {
    // 취소는 비가역 → 반드시 확인 게이트
    if (nextStatus === 'cancelled') {
      const ok = await confirmStatusChange({
        title: '대회 취소',
        message: '대회를 취소하면 되돌릴 수 없어요. 정말 취소할까요?',
        confirmLabel: '대회 취소',
        tone: 'danger',
      });
      if (!ok) return;
    }
    changeStatus.mutate(
      { status: nextStatus },
      {
        onSuccess: (res) => {
          if (res.alreadyInStatus) {
            showToast('이미 이 상태예요.', 'success');
          } else {
            showToast('상태를 변경했어요.', 'success');
          }
        },
        onError: (err) =>
          showToast(extractErrorMessage(err, '상태 변경에 실패했어요.'), 'error'),
      },
    );
  };

  if (isPending) {
    return (
      <div className="animate-pulse">
        <div className="mb-4 h-4 bg-gray-100 rounded-lg w-24" />
        <div className="h-7 bg-gray-100 rounded-lg w-64 mb-2" />
        <div className="h-4 bg-gray-100 rounded-lg w-48 mb-6" />
        <AdminTableSkeleton cols={5} />
      </div>
    );
  }

  if (isError || !tournament) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 py-10 px-4 flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-red-500 font-medium">
          {extractErrorMessage(error, '대회 정보를 불러오지 못했어요.')}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="text-sm text-blue-500 hover:text-blue-600 underline underline-offset-2 min-h-[44px] px-3 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
        >
          다시 시도하기
        </button>
      </div>
    );
  }

  const nextStatuses = allowedNextStatuses(tournament.status);
  const scheduleLabel = formatDateRange(tournament.scheduledAt, tournament.scheduledEndAt);


  return (
    <>
      {/* ── Back link ─────────────────────────────────────────────────── */}
      <div className="mb-4">
        <Link
          href="/admin/tournaments"
          className="inline-flex items-center gap-1 text-[13px] text-gray-500 hover:text-gray-600 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
        >
          <ChevronLeft size={14} aria-hidden="true" />
          대회 목록으로
        </Link>
      </div>

      {/* ── Header ────────────────────────────────────────────────────── */}
      {/* f9: status buttons moved below header to avoid 6-line title wrap on mobile */}
      <AdminPageHeader
        eyebrow="대회 관리"
        title={tournament.title}
        description={`${TOURNAMENT_STATUS_LABEL[tournament.status] ?? tournament.status} · ${tournament.venue ?? '장소 미정'} · ${scheduleLabel}`}
      />

      {/* ── Status change actions (f9: separate row, flex-wrap, h-[44px]) ── */}
      {/* #5: forward transitions = solid blue (primary); 취소하기 = outline red-text (not solid) */}
      {canWrite && nextStatuses.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {nextStatuses.map((s) => {
            const isDestructive = s === 'cancelled';
            const label =
              s === 'open' ? '접수 시작하기' :
              s === 'closed' ? '접수 마감하기' :
              s === 'in_progress' ? '대회 시작하기' :
              s === 'completed' ? '대회 완료하기' :
              s === 'cancelled' ? '취소하기' :
              `${TOURNAMENT_STATUS_LABEL[s] ?? s}(으)로 변경`;
            return (
              <button
                key={s}
                type="button"
                onClick={() => handleStatusChange(s)}
                disabled={changeStatus.isPending}
                className={[
                  'inline-flex items-center h-[44px] px-4 rounded-xl text-[13px] font-semibold',
                  'transition-colors disabled:opacity-50',
                  'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 whitespace-nowrap',
                  isDestructive
                    ? 'text-red-600 border border-red-200 bg-transparent hover:bg-red-50'
                    : 'text-white bg-blue-500 hover:bg-blue-600',
                ].join(' ')}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Info card (ADM-TOURN-05: prize/rules/refund read-back) ──── */}
      <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[13px] font-bold text-gray-900">대회 정보</span>
          {canWrite && (
            <button
              type="button"
              onClick={openEdit}
              className="inline-flex items-center gap-1.5 h-[44px] px-3 rounded-lg text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
            >
              <Pencil size={13} aria-hidden="true" />
              대회 정보 수정
            </button>
          )}
        </div>
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3">
          {[
            { label: '참가비', value: formatCurrency(tournament.entryFee) },
            { label: '팀 수', value: `${tournament.teamCount}팀` },
            { label: '선수 수', value: `${tournament.minPlayers}~${tournament.maxPlayers}명` },
            { label: '신청 수', value: `${tournament.registrationCount}팀` },
            { label: '은행', value: tournament.bankName ? `${tournament.bankName} ${tournament.bankAccount} (${tournament.bankHolder})` : '—' },
            { label: '신청 마감', value: formatDate(tournament.registrationDeadlineAt) },
            { label: '대회 일정', value: scheduleLabel },
            { label: '상품 및 상금', value: tournament.prizeSummary || '—' },
          ].map(({ label, value }) => (
            <div key={label}>
              <dt className="text-xs text-gray-600 font-medium mb-0.5">{label}</dt>
              <dd className={`text-[13px] text-gray-900 ${label === '상품 및 상금' ? 'whitespace-pre-wrap leading-relaxed' : ''}`}>{value}</dd>
            </div>
          ))}
        </dl>
        {/* Long-form fields */}
        {(tournament.prizeBreakdown || tournament.rulesText || tournament.refundPolicyText) && (
          <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4">
            {tournament.prizeBreakdown && (
              <div>
                <p className="text-xs text-gray-600 font-medium mb-0.5">상금 배분</p>
                <p className="text-[13px] text-gray-900 whitespace-pre-wrap leading-relaxed">{tournament.prizeBreakdown}</p>
              </div>
            )}
            {tournament.rulesText && (
              <div>
                <p className="text-xs text-gray-600 font-medium mb-0.5">대회 규정</p>
                <p className="text-[13px] text-gray-900 whitespace-pre-wrap leading-relaxed">{tournament.rulesText}</p>
              </div>
            )}
            {tournament.refundPolicyText && (
              <div>
                <p className="text-xs text-gray-600 font-medium mb-0.5">환불 정책</p>
                <p className="text-[13px] text-gray-900 whitespace-pre-wrap leading-relaxed">{tournament.refundPolicyText}</p>
              </div>
            )}
          </div>
        )}
        {/* Null-state hint when all long-form fields are absent */}
        {!tournament.prizeBreakdown && !tournament.rulesText && !tournament.refundPolicyText && (
          <p className="mt-3 text-xs text-gray-400">상금 배분, 대회 규정, 환불 정책을 아직 입력하지 않았어요.</p>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4 mb-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <span className="text-[13px] font-bold text-gray-900">홍보 카드</span>
          {canWrite && (
            <button
              type="button"
              onClick={openPromoEdit}
              className="inline-flex items-center gap-1.5 h-[44px] px-3 rounded-lg text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
            >
              <Pencil size={13} aria-hidden="true" />
              홍보 카드 수정
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {[
            {
              key: 'home',
              title: '홈 오늘의 추천',
              enabled: tournament.promoHomeEnabled,
              priority: tournament.promoHomePriority,
              badge: tournament.promoHomeBadgeText,
              cardTitle: tournament.promoHomeTitle,
              subtitle: tournament.promoHomeSubtitle,
              imageUrl: tournament.promoHomeImageUrl,
              dateText: tournament.promoHomeDateText,
              teamsText: tournament.promoHomeTeamsText,
              locationText: tournament.promoHomeLocationText,
              prizeText: tournament.promoHomePrizeText,
            },
            {
              key: 'list',
              title: '대회 목록 상단',
              enabled: tournament.promoListEnabled,
              priority: tournament.promoListPriority,
              badge: tournament.promoListBadgeText,
              cardTitle: tournament.promoListTitle,
              subtitle: tournament.promoListSubtitle,
              imageUrl: tournament.promoListImageUrl,
              dateText: tournament.promoListDateText,
              teamsText: tournament.promoListTeamsText,
              locationText: tournament.promoListLocationText,
              prizeText: tournament.promoListPrizeText,
            },
          ].map((promo) => (
            <div key={promo.key} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-gray-900">{promo.title}</p>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${promo.enabled ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                  {promo.enabled ? '노출' : '숨김'}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[13px]">
                <div>
                  <dt className="text-xs text-gray-500">우선순위</dt>
                  <dd className="text-gray-900">{promo.priority}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">배지</dt>
                  <dd className="text-gray-900 truncate">{promo.badge || '-'}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-gray-500">제목</dt>
                  <dd className="text-gray-900 truncate">{promo.cardTitle || '대회명 사용'}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-gray-500">내용</dt>
                  <dd className="text-gray-900 whitespace-pre-wrap break-words">{promo.subtitle || '-'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">하단 날짜</dt>
                  <dd className="text-gray-900 truncate">{promo.dateText || '-'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">하단 팀확정</dt>
                  <dd className="text-gray-900 truncate">{promo.teamsText || '-'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">하단 위치</dt>
                  <dd className="text-gray-900 truncate">{promo.locationText || '-'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">상품 및 상금</dt>
                  <dd className="text-gray-900 truncate">{promo.prizeText || '-'}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-gray-500">이미지</dt>
                  <dd className="text-gray-900 break-all">{promo.imageUrl || '-'}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabs (f11: min-h-[44px], no shadow — active = border-b-2 blue-500) ── */}
      <div
        role="tablist"
        aria-label="대회 운영 탭"
        className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-4 w-fit"
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              role="tab"
              aria-selected={active}
              aria-controls={`panel-${tab.id}`}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={[
                'inline-flex items-center min-h-[44px] px-4 rounded-lg text-[13px] font-medium transition-colors',
                'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                active
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900',
              ].join(' ')}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab panels ────────────────────────────────────────────────── */}
      <div
        id={`panel-registrations`}
        role="tabpanel"
        aria-labelledby="tab-registrations"
        hidden={activeTab !== 'registrations'}
      >
        {activeTab === 'registrations' && (
          <RegistrationsTab tournamentId={id} showToast={showToast} />
        )}
      </div>

      <div
        id={`panel-bracket`}
        role="tabpanel"
        aria-labelledby="tab-bracket"
        hidden={activeTab !== 'bracket'}
      >
        {activeTab === 'bracket' && (
          <BracketTab tournamentId={id} showToast={showToast} registrations={registrations} />
        )}
      </div>

      <div
        id={`panel-announcements`}
        role="tabpanel"
        aria-labelledby="tab-announcements"
        hidden={activeTab !== 'announcements'}
      >
        {activeTab === 'announcements' && (
          <AnnouncementsTab
            tournamentId={id}
            showToast={showToast}
          />
        )}
      </div>

      {/* ── D1: 대회 정보 수정 모달 ──────────────────────────────────── */}
      <SimpleModal
        open={editOpen}
        title="대회 정보 수정"
        onClose={() => setEditOpen(false)}
        pending={updateTournament.isPending}
      >
        <form onSubmit={handleEditSubmit} noValidate className="flex flex-col gap-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-title" className="text-[13px] text-gray-900">
              대회명 <span className="text-red-500" aria-hidden="true">*</span>
            </label>
            <input
              id="edit-title"
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              disabled={updateTournament.isPending}
              maxLength={100}
              required
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit-scheduled-at" className="text-[13px] text-gray-900">대회 시작</label>
              <input
                id="edit-scheduled-at"
                type="datetime-local"
                value={editScheduledAt}
                onChange={(e) => setEditScheduledAt(e.target.value)}
                disabled={updateTournament.isPending}
                className={inputCls}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit-scheduled-end-at" className="text-[13px] text-gray-900">대회 종료</label>
              <input
                id="edit-scheduled-end-at"
                type="datetime-local"
                value={editScheduledEndAt}
                onChange={(e) => setEditScheduledEndAt(e.target.value)}
                disabled={updateTournament.isPending}
                className={inputCls}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit-deadline-at" className="text-[13px] text-gray-900">신청 마감</label>
              <input
                id="edit-deadline-at"
                type="datetime-local"
                value={editDeadlineAt}
                onChange={(e) => setEditDeadlineAt(e.target.value)}
                disabled={updateTournament.isPending}
                className={inputCls}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-venue" className="text-[13px] text-gray-900">장소</label>
            <input
              id="edit-venue"
              type="text"
              value={editVenue}
              onChange={(e) => setEditVenue(e.target.value)}
              disabled={updateTournament.isPending}
              maxLength={100}
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit-entry-fee" className="text-[13px] text-gray-900">참가비 (원)</label>
              <input
                id="edit-entry-fee"
                type="number"
                inputMode="numeric"
                min={0}
                value={editEntryFee}
                onChange={(e) => setEditEntryFee(e.target.value)}
                disabled={updateTournament.isPending}
                className={inputCls}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit-team-count" className="text-[13px] text-gray-900">팀 수</label>
              <input
                id="edit-team-count"
                type="number"
                inputMode="numeric"
                min={2}
                value={editTeamCount}
                onChange={(e) => setEditTeamCount(e.target.value)}
                disabled={updateTournament.isPending}
                className={inputCls}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit-min-players" className="text-[13px] text-gray-900">최소 선수</label>
              <input
                id="edit-min-players"
                type="number"
                inputMode="numeric"
                min={1}
                value={editMinPlayers}
                onChange={(e) => setEditMinPlayers(e.target.value)}
                disabled={updateTournament.isPending}
                className={inputCls}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit-max-players" className="text-[13px] text-gray-900">최대 선수</label>
              <input
                id="edit-max-players"
                type="number"
                inputMode="numeric"
                min={1}
                value={editMaxPlayers}
                onChange={(e) => setEditMaxPlayers(e.target.value)}
                disabled={updateTournament.isPending}
                className={inputCls}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-prize-summary" className="text-[13px] text-gray-900">상품 및 상금</label>
            <textarea
              id="edit-prize-summary"
              value={editPrizeSummary}
              onChange={(e) => setEditPrizeSummary(e.target.value)}
              disabled={updateTournament.isPending}
              rows={2}
              placeholder="예: 우승팀 현금 100만원 + 트로피"
              className={textareaCls}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-prize-breakdown" className="text-[13px] text-gray-900">상금 배분</label>
            <textarea
              id="edit-prize-breakdown"
              value={editPrizeBreakdown}
              onChange={(e) => setEditPrizeBreakdown(e.target.value)}
              disabled={updateTournament.isPending}
              rows={3}
              placeholder="예: 1위 50만원, 2위 20만원"
              className={textareaCls}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit-bank-name" className="text-[13px] text-gray-900">은행명</label>
              <input
                id="edit-bank-name"
                type="text"
                value={editBankName}
                onChange={(e) => setEditBankName(e.target.value)}
                disabled={updateTournament.isPending}
                maxLength={20}
                className={inputCls}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit-bank-account" className="text-[13px] text-gray-900">계좌번호</label>
              <input
                id="edit-bank-account"
                type="text"
                value={editBankAccount}
                onChange={(e) => setEditBankAccount(e.target.value)}
                disabled={updateTournament.isPending}
                maxLength={30}
                className={inputCls}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit-bank-holder" className="text-[13px] text-gray-900">예금주</label>
              <input
                id="edit-bank-holder"
                type="text"
                value={editBankHolder}
                onChange={(e) => setEditBankHolder(e.target.value)}
                disabled={updateTournament.isPending}
                maxLength={20}
                className={inputCls}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-rules-text" className="text-[13px] text-gray-900">대회 규정</label>
            <textarea
              id="edit-rules-text"
              value={editRulesText}
              onChange={(e) => setEditRulesText(e.target.value)}
              disabled={updateTournament.isPending}
              maxLength={10000}
              rows={4}
              placeholder="대회 규정을 입력해 주세요."
              className={textareaCls}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-refund-policy" className="text-[13px] text-gray-900">환불 정책</label>
            <textarea
              id="edit-refund-policy"
              value={editRefundPolicyText}
              onChange={(e) => setEditRefundPolicyText(e.target.value)}
              disabled={updateTournament.isPending}
              rows={3}
              placeholder="환불 정책을 입력해 주세요."
              className={textareaCls}
            />
          </div>

          <div className="flex gap-2 pt-1 sticky bottom-0 bg-white pb-1">
            <button
              type="button"
              onClick={() => setEditOpen(false)}
              disabled={updateTournament.isPending}
              className="flex-1 h-[44px] rounded-xl text-[13px] text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!editTitle.trim() || updateTournament.isPending}
              className={'flex-1 ' + submitBtnCls}
            >
              {updateTournament.isPending ? '저장 중…' : '저장'}
            </button>
          </div>
        </form>
      </SimpleModal>

      <SimpleModal
        open={promoOpen}
        title="홍보 카드 수정"
        onClose={() => setPromoOpen(false)}
        pending={updateTournament.isPending || promoUploadingSlot !== null}
      >
        <form onSubmit={handlePromoSubmit} noValidate className="flex flex-col gap-4 max-h-[70vh] overflow-y-auto pr-1">
          {[
            {
              key: 'home' as const,
              title: '홈 오늘의 추천',
              enabled: promoHomeEnabled,
              setEnabled: setPromoHomeEnabled,
              cardTitle: promoHomeTitle,
              setCardTitle: setPromoHomeTitle,
              badge: promoHomeBadgeText,
              setBadge: setPromoHomeBadgeText,
              subtitle: promoHomeSubtitle,
              setSubtitle: setPromoHomeSubtitle,
              imageUrl: promoHomeImageUrl,
              setImageUrl: setPromoHomeImageUrl,
              dateText: promoHomeDateText,
              setDateText: setPromoHomeDateText,
              teamsText: promoHomeTeamsText,
              setTeamsText: setPromoHomeTeamsText,
              locationText: promoHomeLocationText,
              setLocationText: setPromoHomeLocationText,
              prizeText: promoHomePrizeText,
              setPrizeText: setPromoHomePrizeText,
              priority: promoHomePriority,
              setPriority: setPromoHomePriority,
              titleId: 'promo-home-title',
              badgeId: 'promo-home-badge',
              subtitleId: 'promo-home-subtitle',
            },
            {
              key: 'list' as const,
              title: '대회 목록 상단',
              enabled: promoListEnabled,
              setEnabled: setPromoListEnabled,
              cardTitle: promoListTitle,
              setCardTitle: setPromoListTitle,
              badge: promoListBadgeText,
              setBadge: setPromoListBadgeText,
              subtitle: promoListSubtitle,
              setSubtitle: setPromoListSubtitle,
              imageUrl: promoListImageUrl,
              setImageUrl: setPromoListImageUrl,
              dateText: promoListDateText,
              setDateText: setPromoListDateText,
              teamsText: promoListTeamsText,
              setTeamsText: setPromoListTeamsText,
              locationText: promoListLocationText,
              setLocationText: setPromoListLocationText,
              prizeText: promoListPrizeText,
              setPrizeText: setPromoListPrizeText,
              priority: promoListPriority,
              setPriority: setPromoListPriority,
              titleId: 'promo-list-title',
              badgeId: 'promo-list-badge',
              subtitleId: 'promo-list-subtitle',
            },
          ].map((promo) => (
            <div key={promo.key} className="rounded-xl border border-gray-100 bg-gray-50 p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[13px] font-semibold text-gray-900">{promo.title}</div>
                <label className="flex min-h-[44px] items-center gap-2 rounded-lg bg-white px-3 text-[13px] text-gray-900">
                  <input
                    type="checkbox"
                    checked={promo.enabled}
                    onChange={(e) => promo.setEnabled(e.target.checked)}
                    disabled={updateTournament.isPending}
                    className="h-4 w-4"
                  />
                  노출
                </label>
              </div>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={promo.titleId} className="text-[13px] text-gray-900">카드 제목</label>
                  <input id={promo.titleId} type="text" value={promo.cardTitle} onChange={(e) => promo.setCardTitle(e.target.value)} disabled={updateTournament.isPending} maxLength={120} placeholder="비우면 대회명이 표시돼요" className={inputCls} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={promo.badgeId} className="text-[13px] text-gray-900">배지 문구</label>
                  <input id={promo.badgeId} type="text" value={promo.badge} onChange={(e) => promo.setBadge(e.target.value)} disabled={updateTournament.isPending} maxLength={60} placeholder="예: 오늘의 추천" className={inputCls} />
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-1.5">
                <label htmlFor={promo.subtitleId} className="text-[13px] text-gray-900">카드 내용</label>
                <textarea id={promo.subtitleId} value={promo.subtitle} onChange={(e) => promo.setSubtitle(e.target.value)} disabled={updateTournament.isPending} rows={2} maxLength={300} placeholder="카드에 보여줄 문구" className={textareaCls} />
              </div>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] text-gray-900">하단 날짜</label>
                  <input type="text" value={promo.dateText} onChange={(e) => promo.setDateText(e.target.value)} disabled={updateTournament.isPending} maxLength={120} placeholder="예: 7월 20일 토요일" className={inputCls} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] text-gray-900">하단 팀확정</label>
                  <input type="text" value={promo.teamsText} onChange={(e) => promo.setTeamsText(e.target.value)} disabled={updateTournament.isPending} maxLength={120} placeholder="예: 6/8팀 확정" className={inputCls} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] text-gray-900">하단 위치</label>
                  <input type="text" value={promo.locationText} onChange={(e) => promo.setLocationText(e.target.value)} disabled={updateTournament.isPending} maxLength={120} placeholder="예: 서울 강남 풋살장" className={inputCls} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] text-gray-900">상품 및 상금</label>
                  <input type="text" value={promo.prizeText} onChange={(e) => promo.setPrizeText(e.target.value)} disabled={updateTournament.isPending} maxLength={160} placeholder="예: 우승팀 유니폼 + 50만원" className={inputCls} />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-3">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] text-gray-900">이미지 첨부</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex h-[44px] cursor-pointer items-center justify-center rounded-xl bg-white px-3 text-[13px] font-semibold text-gray-700 ring-1 ring-gray-200 transition-colors hover:bg-gray-50">
                      {promoUploadingSlot === promo.key ? '업로드 중' : promo.imageUrl ? '이미지 변경' : '이미지 선택'}
                      <input type="file" accept="image/*" className="sr-only" disabled={updateTournament.isPending || promoUploadingSlot !== null} onChange={(e) => void handlePromoImageChange(promo.key, e.target.files?.[0] ?? null)} />
                    </label>
                    {promo.imageUrl ? (
                      <button type="button" onClick={() => promo.setImageUrl('')} disabled={updateTournament.isPending || promoUploadingSlot !== null} className="h-[44px] rounded-xl bg-gray-100 px-3 text-[13px] font-semibold text-gray-600 hover:bg-gray-200 disabled:opacity-50">
                        삭제
                      </button>
                    ) : null}
                  </div>
                  <p className="text-xs text-gray-500 break-all">{promo.imageUrl || '이미지 1장, 5MB 이하'}</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] text-gray-900">우선순위</label>
                  <input type="number" inputMode="numeric" min={0} max={9999} value={promo.priority} onChange={(e) => promo.setPriority(e.target.value)} disabled={updateTournament.isPending} className={inputCls} />
                </div>
              </div>
            </div>
          ))}

          <div className="flex gap-2 pt-1 sticky bottom-0 bg-white pb-1">
            <button type="button" onClick={() => setPromoOpen(false)} disabled={updateTournament.isPending || promoUploadingSlot !== null} className="flex-1 h-[44px] rounded-xl text-[13px] text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50">
              취소
            </button>
            <button type="submit" disabled={updateTournament.isPending || promoUploadingSlot !== null} className={'flex-1 ' + submitBtnCls}>
              {updateTournament.isPending ? '저장 중…' : '저장'}
            </button>
          </div>
        </form>
      </SimpleModal>

      {/* 대회 상태 변경 confirm modal (취소 등 비가역 액션) */}
      {StatusConfirmModal}

      <AdminToasts toasts={toasts} />
    </>
  );
}
