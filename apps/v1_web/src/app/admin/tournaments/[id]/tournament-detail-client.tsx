'use client';

import { useState, useRef, useEffect } from 'react';
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
} from 'lucide-react';
import {
  useV1AdminTournament,
  useV1AdminMe,
  useV1ChangeTournamentStatus,
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
  useV1PublishAnnouncement,
} from '@/hooks/use-v1-api';
import type {
  V1TournamentStatus,
  V1AdminTournamentRegistration,
  V1AdminBracketGroup,
  V1AdminBracketFixture,
  V1AdminBracketStanding,
  V1TournamentGroupPhase,
  V1AnnouncementAudience,
} from '@/types/api';
import { extractErrorMessage } from '@/lib/error-message';
import {
  AdminPageHeader,
  AdminDataTable,
  AdminStatusPill,
  AdminTableSkeleton,
  AdminEmpty,
  AdminToasts,
  useAdminToast,
} from '@/components/admin';
import type { AdminTableColumn } from '@/components/admin';

// ── Constants ─────────────────────────────────────────────────────────────

const TOURNAMENT_STATUS_LABEL: Record<string, string> = {
  draft: '초안',
  open: '접수중',
  closed: '마감',
  in_progress: '진행중',
  completed: '완료',
  cancelled: '취소됨',
};

const ELIGIBILITY_LABEL: Record<string, string> = {
  non_pro: '아마추어',
  pro: '프로',
  needs_review: '검토필요',
};

// f9: 결제 상태·수단 한글 라벨 (my-registration-client 동일 기준)
const PAYMENT_STATUS_LABEL: Record<string, string> = {
  paid: '결제 완료',
  pending: '결제 대기',
  cancelled: '취소됨',
  refunded: '환불됨',
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  pg: '카드·간편결제',
  bank_transfer: '계좌이체',
  vbank: '가상계좌',
};

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

function formatCurrency(n: number): string {
  if (n === 0) return '무료';
  return `${n.toLocaleString('ko-KR')}원`;
}

// ── Shared input styles ───────────────────────────────────────────────────

/** h-[44px] unified submit button (f12) */
const submitBtnCls = [
  'inline-flex items-center justify-center gap-1.5 h-[44px] px-4 rounded-xl',
  'tm-text-label text-white bg-blue-500 hover:bg-blue-600',
  'transition-colors disabled:opacity-50',
  'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
].join(' ');

const inputCls = [
  'h-[44px] px-3 tm-text-label bg-white border border-gray-200 rounded-xl text-[color:var(--text-strong)]',
  'placeholder:text-[color:var(--text-muted)]',
  'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
  'transition-colors disabled:opacity-50 w-full',
].join(' ');

const textareaCls = [
  'px-3 py-2.5 tm-text-label bg-white border border-gray-200 rounded-xl text-[color:var(--text-strong)] resize-none',
  'placeholder:text-[color:var(--text-muted)]',
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
        aria-labelledby="simple-modal-title"
        className="bg-white rounded-2xl shadow-[0_8px_32px_rgba(20,28,45,0.14)] w-full max-w-[480px] overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 id="simple-modal-title" className="tm-text-body font-bold text-[color:var(--text-strong)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => !pending && onClose()}
            disabled={pending}
            aria-label="모달 닫기"
            className="flex items-center justify-center w-[44px] h-[44px] rounded-lg [color:var(--text-caption)] hover:text-[color:var(--text-muted)] hover:bg-gray-50 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-40"
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
        <p className="text-sm [color:var(--text-caption)]">불러오는 중…</p>
      ) : players.length === 0 ? (
        <p className="text-sm [color:var(--text-caption)]">등록된 선수가 없어요.</p>
      ) : (
        <ul className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto" role="list">
          {players.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium [color:var(--text-strong)] truncate">{p.realName}</p>
                {p.birthDateSnapshot && (
                  <p className="tm-text-caption">{p.birthDateSnapshot}</p>
                )}
              </div>
              <select
                value={p.eligibilityStatus}
                onChange={(e) => handleEligibilityChange(p.id, e.target.value)}
                disabled={updateEligibility.isPending}
                aria-label={`${p.realName} 자격 상태`}
                className="h-[44px] px-3 tm-text-label bg-white border border-gray-200 rounded-xl text-[color:var(--text-strong)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors disabled:opacity-50"
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
        className="mt-4 w-full h-[44px] rounded-xl tm-text-label text-[color:var(--text-muted)] bg-gray-100 hover:bg-gray-200 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
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

  const handleCancel = (reg: V1AdminTournamentRegistration) => {
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


  // ── AdminDataTable column definitions (f8) ───────────────────────────────
  // loading/error/empty are delegated to AdminDataTable via props
  const regColumns: AdminTableColumn<V1AdminTournamentRegistration>[] = [
    {
      key: 'teamName',
      header: '팀명',
      render: (r) => (
        <span className="font-medium [color:var(--text-strong)]">{r.teamName ?? r.teamId}</span>
      ),
    },
    {
      key: 'status',
      header: '상태',
      render: (r) => (
        <AdminStatusPill status={r.status} />
      ),
    },
    {
      key: 'payment',
      header: '결제',
      render: (r) =>
        r.payment ? (
          <span className="tm-text-label text-[color:var(--text-muted)]">
            {PAYMENT_METHOD_LABEL[r.payment.method] ?? r.payment.method} · {PAYMENT_STATUS_LABEL[r.payment.status] ?? r.payment.status}
          </span>
        ) : (
          <span className="tm-text-label text-[color:var(--text-caption)]">—</span>
        ),
    },
    {
      key: 'depositorName',
      header: '입금자',
      render: (r) => (
        <span className="tm-text-label text-[color:var(--text-muted)]">{r.depositorName ?? '—'}</span>
      ),
    },
    {
      key: 'playerCount',
      header: '선수수',
      render: (r) => (
        <span className="tabular-nums [color:var(--text-muted)]">{r.playerCount}명</span>
      ),
    },
  ];

  return (
    <>
      {/* f8: AdminDataTable replaces custom desktop table + mobile card list */}
      <AdminDataTable<V1AdminTournamentRegistration>
        columns={regColumns}
        rows={registrations}
        keyExtractor={(r) => r.id}
        loading={isPending}
        error={isError ? extractErrorMessage(error, '신청 목록을 불러오지 못했어요.') : undefined}
        onRetry={() => void refetch()}
        empty={<AdminEmpty title="신청이 없어요" description="아직 신청한 팀이 없어요." />}
        renderActions={(reg) => {
          const isLocked = !!reg.rosterLockedAt;
          return (
            <>
              {reg.status === 'awaiting_payment' && (
                <ActionButton
                  onClick={() => handleConfirmPayment(reg)}
                  disabled={confirmPayment.isPending}
                  icon={<Check size={13} />}
                  label="입금확인"
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
                    label="잠금해제"
                    tone="gray"
                  />
                ) : (
                  <ActionButton
                    onClick={() => handleRosterLock(reg)}
                    disabled={rosterLock.isPending}
                    icon={<Lock size={13} />}
                    label="명단잠금"
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
              {reg.status !== 'cancelled' && (
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
      : '[color:var(--text-muted)] bg-gray-100 hover:bg-gray-200';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'inline-flex items-center gap-1 min-h-[44px] px-2.5 rounded-lg tm-text-caption font-medium transition-colors whitespace-nowrap',
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

  // ── Assign team form ────────────────────────────────────────────────
  const [assignGroupId, setAssignGroupId] = useState('');
  const [assignRegId, setAssignRegId] = useState('');

  // ── Create fixture form ─────────────────────────────────────────────
  const [fixtureGroupId, setFixtureGroupId] = useState('');
  const [fixtureRound, setFixtureRound] = useState('');
  const [fixtureNumber, setFixtureNumber] = useState('1');
  const [fixtureHomeRegId, setFixtureHomeRegId] = useState('');
  const [fixtureAwayRegId, setFixtureAwayRegId] = useState('');

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
    createGroup.mutate(
      { name: groupName.trim(), phase: groupPhase },
      {
        onSuccess: () => { setGroupName(''); showToast('조를 만들었어요.', 'success'); },
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
          showToast('픽스처를 만들었어요.', 'success');
        },
        onError: (err) => showToast(extractErrorMessage(err, '픽스처 생성에 실패했어요.'), 'error'),
      },
    );
  };

  const handleRecordResult = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resultFixture) return;
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

  return (
    <div className="flex flex-col gap-6">

      {/* ── 조 만들기 ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 px-5 py-5">
        <h3 className="tm-text-body font-bold text-[color:var(--text-strong)] mb-4">조 만들기</h3>
        <form onSubmit={handleCreateGroup} noValidate className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex flex-col gap-1">
            <label htmlFor="group-name" className="tm-text-label text-[color:var(--text-strong)]">
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
            <label htmlFor="group-phase" className="tm-text-label text-[color:var(--text-strong)]">
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
              <option value="third_place">3위결정</option>
            </select>
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
      </div>

      {/* ── 팀 배정 ─────────────────────────────────────────────────── */}
      {groups.length > 0 && confirmedRegistrations.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 px-5 py-5">
          <h3 className="tm-text-body font-bold text-[color:var(--text-strong)] mb-4">팀 배정</h3>
          <form onSubmit={handleAssignTeam} noValidate className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex flex-col gap-1">
              <label htmlFor="assign-group" className="tm-text-label text-[color:var(--text-strong)]">
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
              <label htmlFor="assign-team" className="tm-text-label text-[color:var(--text-strong)]">
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
          <p className="tm-text-caption mt-1" aria-live="polite">확정된 팀만 배정할 수 있어요.</p>
        </div>
      )}

      {/* ── 조별 순위표 ──────────────────────────────────────────────── */}
      {groups.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="tm-text-body font-bold text-[color:var(--text-strong)]">조별 순위표</h3>
            <button
              type="button"
              onClick={handleRecalculate}
              disabled={recalculate.isPending}
              className="inline-flex items-center gap-1 min-h-[44px] px-3 rounded-lg tm-text-caption font-medium text-[color:var(--text-muted)] bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
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
                render: (s) => <span className="tabular-nums [color:var(--text-muted)]">{s.position}</span>,
              },
              {
                key: 'teamName',
                header: '팀',
                render: (s) => <span className="font-medium [color:var(--text-strong)]">{s.teamName ?? s.registrationId}</span>,
              },
              {
                key: 'wins',
                header: '승',
                align: 'center',
                render: (s) => <span className="tabular-nums">{s.wins}</span>,
              },
              {
                key: 'draws',
                header: '무',
                align: 'center',
                render: (s) => <span className="tabular-nums">{s.draws}</span>,
              },
              {
                key: 'losses',
                header: '패',
                align: 'center',
                render: (s) => <span className="tabular-nums">{s.losses}</span>,
              },
              {
                key: 'goalsFor',
                header: '득점',
                align: 'center',
                render: (s) => <span className="tabular-nums">{s.goalsFor}</span>,
              },
              {
                key: 'goalsAgainst',
                header: '실점',
                align: 'center',
                render: (s) => <span className="tabular-nums">{s.goalsAgainst}</span>,
              },
              {
                key: 'points',
                header: '승점',
                align: 'right',
                render: (s) => <span className="tabular-nums font-semibold text-blue-600">{s.points}</span>,
              },
            ];
            return (
              <div key={group.id} className="flex flex-col gap-2">
                <h4 className="tm-text-label font-bold text-[color:var(--text-muted)] px-1">{group.name}</h4>
                <AdminDataTable<V1AdminBracketStanding>
                  columns={standingColumns}
                  rows={standings}
                  keyExtractor={(s) => s.id}
                  empty={<AdminEmpty title="팀이 없어요" description="배정된 팀이 없어요." />}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* ── 픽스처 만들기 ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 px-5 py-5">
        <h3 className="tm-text-body font-bold text-[color:var(--text-strong)] mb-4">픽스처 만들기</h3>
        <form onSubmit={handleCreateFixture} noValidate className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="fixture-round" className="tm-text-label text-[color:var(--text-strong)]">라운드</label>
            <input id="fixture-round" type="text" value={fixtureRound} onChange={(e) => setFixtureRound(e.target.value)} placeholder="예: 조별 1라운드" disabled={createFixture.isPending} maxLength={30} className={inputCls} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="fixture-number" className="tm-text-label text-[color:var(--text-strong)]">번호</label>
            <input id="fixture-number" type="number" min="1" value={fixtureNumber} onChange={(e) => setFixtureNumber(e.target.value)} disabled={createFixture.isPending} className={inputCls} />
          </div>
          {groups.length > 0 && (
            <div className="flex flex-col gap-1">
              <label htmlFor="fixture-group" className="tm-text-label text-[color:var(--text-strong)]">소속 조 (선택)</label>
              <select id="fixture-group" value={fixtureGroupId} onChange={(e) => setFixtureGroupId(e.target.value)} disabled={createFixture.isPending} className={inputCls}>
                <option value="">조 없음</option>
                {groups.map((g) => (<option key={g.id} value={g.id}>{g.name}</option>))}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label htmlFor="fixture-home" className="tm-text-label text-[color:var(--text-strong)]">홈 팀 (선택)</label>
            <select id="fixture-home" value={fixtureHomeRegId} onChange={(e) => setFixtureHomeRegId(e.target.value)} disabled={createFixture.isPending} className={inputCls}>
              <option value="">미정</option>
              {confirmedRegistrations.map((r) => (<option key={r.id} value={r.id}>{r.teamName ?? r.teamId}</option>))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="fixture-away" className="tm-text-label text-[color:var(--text-strong)]">어웨이 팀 (선택)</label>
            <select id="fixture-away" value={fixtureAwayRegId} onChange={(e) => setFixtureAwayRegId(e.target.value)} disabled={createFixture.isPending} className={inputCls}>
              <option value="">미정</option>
              {confirmedRegistrations.map((r) => (<option key={r.id} value={r.id}>{r.teamName ?? r.teamId}</option>))}
            </select>
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={!fixtureRound.trim() || !fixtureNumber || createFixture.isPending} className={submitBtnCls + ' w-full sm:w-auto'}>
              <Plus size={14} aria-hidden="true" />픽스처 추가
            </button>
          </div>
        </form>
      </div>

      {/* ── 픽스처 목록 (f13: AdminDataTable — 모바일 card reflow 자동 적용) ── */}
      {fixtures.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="tm-text-body font-bold text-[color:var(--text-strong)]">픽스처 목록</h3>
          <AdminDataTable<V1AdminBracketFixture>
            columns={[
              {
                key: 'round',
                header: '라운드',
                render: (f) => <span className="[color:var(--text-muted)]">{f.round}</span>,
              },
              {
                key: 'fixtureNumber',
                header: '번호',
                render: (f) => <span className="tabular-nums [color:var(--text-muted)]">{f.fixtureNumber}</span>,
              },
              {
                key: 'homeTeamName',
                header: '홈',
                render: (f) => <span className="font-medium [color:var(--text-strong)]">{f.homeTeamName ?? '—'}</span>,
              },
              {
                key: 'awayTeamName',
                header: '어웨이',
                render: (f) => <span className="font-medium [color:var(--text-strong)]">{f.awayTeamName ?? '—'}</span>,
              },
              {
                key: 'result',
                header: '결과',
                render: (f) => (
                  <span className="tabular-nums [color:var(--text-muted)]">
                    {f.result
                      ? `${f.result.homeScore} : ${f.result.awayScore}${f.result.hasPenalty ? ` (PK ${f.result.homePenaltyScore}:${f.result.awayPenaltyScore})` : ''}`
                      : '—'}
                  </span>
                ),
              },
            ]}
            rows={fixtures}
            keyExtractor={(f) => f.id}
            renderActions={(f) => (
              <button
                type="button"
                onClick={() => {
                  setResultFixture(f);
                  setHomeScore(String(f.result?.homeScore ?? 0));
                  setAwayScore(String(f.result?.awayScore ?? 0));
                  setHasPenalty(f.result?.hasPenalty ?? false);
                  setHomePenalty(String(f.result?.homePenaltyScore ?? 0));
                  setAwayPenalty(String(f.result?.awayPenaltyScore ?? 0));
                  setResultOpen(true);
                }}
                aria-label={`${f.round} ${f.fixtureNumber}번 결과 입력`}
                className="inline-flex items-center gap-1 min-h-[44px] px-3 rounded-lg tm-text-caption font-medium text-[color:var(--text-muted)] bg-gray-100 hover:bg-gray-200 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
              >
                결과 입력
              </button>
            )}
          />
        </div>
      )}

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
              <label htmlFor="home-score" className="tm-text-label text-[color:var(--text-strong)]">
                홈
              </label>
              {(resultFixture?.homeTeamName ?? resultFixture?.homeRegistrationId) && (
                <p className="tm-text-caption truncate max-w-[140px]">
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
            <span className="text-xl font-bold text-[color:var(--text-caption)] mt-5" aria-hidden="true">:</span>
            <div className="flex flex-col gap-1 flex-1">
              <label htmlFor="away-score" className="tm-text-label text-[color:var(--text-strong)]">
                어웨이
              </label>
              {(resultFixture?.awayTeamName ?? resultFixture?.awayRegistrationId) && (
                <p className="tm-text-caption truncate max-w-[140px]">
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

          <label className="flex items-center gap-2 tm-text-label text-[color:var(--text-strong)] cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={hasPenalty}
              onChange={(e) => setHasPenalty(e.target.checked)}
              disabled={recordResult.isPending}
              className="w-4 h-4 rounded accent-blue-500"
            />
            승부차기 있음
          </label>

          {hasPenalty && (
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-1 flex-1">
                <label htmlFor="home-penalty" className="tm-text-label text-[color:var(--text-strong)]">홈 PK</label>
                <input id="home-penalty" type="number" min="0" value={homePenalty} onChange={(e) => setHomePenalty(e.target.value)} disabled={recordResult.isPending} className={inputCls} />
              </div>
              <span className="text-xl font-bold text-[color:var(--text-caption)] mt-5" aria-hidden="true">:</span>
              <div className="flex flex-col gap-1 flex-1">
                <label htmlFor="away-penalty" className="tm-text-label text-[color:var(--text-strong)]">어웨이 PK</label>
                <input id="away-penalty" type="number" min="0" value={awayPenalty} onChange={(e) => setAwayPenalty(e.target.value)} disabled={recordResult.isPending} className={inputCls} />
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setResultOpen(false)}
              disabled={recordResult.isPending}
              className="flex-1 h-[44px] rounded-xl tm-text-label text-[color:var(--text-muted)] bg-gray-100 hover:bg-gray-200 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={recordResult.isPending}
              className={'flex-1 ' + submitBtnCls}
            >
              {recordResult.isPending ? '저장 중…' : '저장'}
            </button>
          </div>
        </form>
      </SimpleModal>
    </div>
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
  const publishAnnouncement = useV1PublishAnnouncement(tournamentId);

  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annAudience, setAnnAudience] = useState<V1AnnouncementAudience>('all_registered');
  const [annPublish, setAnnPublish] = useState(false);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitle.trim() || !annBody.trim()) return;
    createAnnouncement.mutate(
      {
        title: annTitle.trim(),
        body: annBody.trim(),
        audience: annAudience,
        publish: annPublish,
      },
      {
        onSuccess: () => {
          setAnnTitle('');
          setAnnBody('');
          setAnnPublish(false);
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

  return (
    <div className="flex flex-col gap-6">
      {/* ── 공지 작성 폼 ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 px-5 py-5">
        <h3 className="tm-text-body font-bold text-[color:var(--text-strong)] mb-4">공지 작성</h3>
        <form onSubmit={handleCreate} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ann-title" className="tm-text-label text-[color:var(--text-strong)]">
              제목 <span className="text-red-500" aria-hidden="true">*</span>
              <span className="sr-only">(필수)</span>
            </label>
            <input
              id="ann-title"
              type="text"
              value={annTitle}
              onChange={(e) => setAnnTitle(e.target.value)}
              disabled={createAnnouncement.isPending}
              placeholder="공지 제목"
              maxLength={100}
              required
              aria-required="true"
              className={inputCls}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="ann-body" className="tm-text-label text-[color:var(--text-strong)]">
              내용 <span className="text-red-500" aria-hidden="true">*</span>
              <span className="sr-only">(필수)</span>
            </label>
            <textarea
              id="ann-body"
              value={annBody}
              onChange={(e) => setAnnBody(e.target.value)}
              disabled={createAnnouncement.isPending}
              rows={4}
              placeholder="공지 내용을 입력해 주세요."
              required
              aria-required="true"
              className={textareaCls}
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <label htmlFor="ann-audience" className="tm-text-label text-[color:var(--text-strong)]">
                대상
              </label>
              <select
                id="ann-audience"
                value={annAudience}
                onChange={(e) => setAnnAudience(e.target.value as V1AnnouncementAudience)}
                disabled={createAnnouncement.isPending}
                className={inputCls}
              >
                <option value="all_registered">모든 신청팀</option>
                <option value="confirmed_only">확정팀만</option>
                <option value="waitlist">대기팀만</option>
              </select>
            </div>

            <label className="flex items-center gap-2 tm-text-label text-[color:var(--text-strong)] cursor-pointer min-h-[44px] self-end sm:pb-0.5">
              <input
                type="checkbox"
                checked={annPublish}
                onChange={(e) => setAnnPublish(e.target.checked)}
                disabled={createAnnouncement.isPending}
                className="w-4 h-4 rounded accent-blue-500"
              />
              즉시 발행
            </label>
          </div>

          <button
            type="submit"
            disabled={!annTitle.trim() || !annBody.trim() || createAnnouncement.isPending}
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
                  <p className="tm-text-label font-bold text-[color:var(--text-strong)] mb-0.5 truncate">{ann.title}</p>
                  <p className="tm-text-caption">
                    {ann.publishedAt ? `발행 · ${formatDate(ann.publishedAt)}` : '미발행'}
                    {' '}·{' '}
                    {ann.audience === 'all_registered'
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
                    className="inline-flex items-center gap-1 min-h-[44px] px-3 rounded-lg tm-text-caption font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 shrink-0"
                  >
                    <Send size={12} aria-hidden="true" />
                    발행
                  </button>
                )}
              </div>
              <p className="mt-2 tm-text-label text-[color:var(--text-muted)] whitespace-pre-wrap leading-relaxed">
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

  const [activeTab, setActiveTab] = useState<TabId>('registrations');

  // ── Registration data (needed by bracket tab for confirmed teams) ────
  const { data: regData } = useV1AdminTournamentRegistrations(id);
  const registrations = regData?.items ?? [];

  // ── Status change ────────────────────────────────────────────────────
  const handleStatusChange = (nextStatus: V1TournamentStatus) => {
    changeStatus.mutate(
      { status: nextStatus },
      {
        onSuccess: (res) => {
          if (res.alreadyInStatus) {
            showToast('이미 해당 상태예요.', 'success');
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


  return (
    <>
      {/* ── Back link ─────────────────────────────────────────────────── */}
      <div className="mb-4">
        <Link
          href="/admin/tournaments"
          className="inline-flex items-center gap-1 tm-text-label text-[color:var(--text-caption)] hover:text-[color:var(--text-muted)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
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
        description={`${TOURNAMENT_STATUS_LABEL[tournament.status] ?? tournament.status} · ${tournament.venue ?? '장소 미정'} · ${formatDate(tournament.scheduledAt)}`}
      />

      {/* ── Status change actions (f9: separate row, flex-wrap, h-[44px]) ── */}
      {canWrite && nextStatuses.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {nextStatuses.map((s) => {
            const isDestructive = s === 'cancelled';
            const label =
              s === 'open' ? '접수 시작하기' :
              s === 'closed' ? '접수 마감하기' :
              s === 'in_progress' ? '대회 시작하기' :
              s === 'completed' ? '대회 완료 처리' :
              s === 'cancelled' ? '대회 취소하기' :
              `${TOURNAMENT_STATUS_LABEL[s] ?? s}(으)로 변경`;
            return (
              <button
                key={s}
                type="button"
                onClick={() => handleStatusChange(s)}
                disabled={changeStatus.isPending}
                className={[
                  'inline-flex items-center h-[44px] px-4 rounded-xl tm-text-label font-semibold',
                  'transition-colors disabled:opacity-50',
                  'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 whitespace-nowrap',
                  isDestructive
                    ? 'text-red-600 bg-red-50 hover:bg-red-100'
                    : 'text-white bg-blue-500 hover:bg-blue-600',
                ].join(' ')}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Info card ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4 mb-6">
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
          {[
            { label: '참가비', value: formatCurrency(tournament.entryFee) },
            { label: '팀 수', value: `${tournament.teamCount}팀` },
            { label: '선수 수', value: `${tournament.minPlayers}~${tournament.maxPlayers}명` },
            { label: '신청 수', value: `${tournament.registrationCount}팀` },
            { label: '은행', value: tournament.bankName ? `${tournament.bankName} ${tournament.bankAccount} (${tournament.bankHolder})` : '—' },
            { label: '신청 마감', value: formatDate(tournament.registrationDeadlineAt) },
            { label: '대회 일정', value: formatDate(tournament.scheduledAt) },
          ].map(({ label, value }) => (
            <div key={label}>
              <dt className="tm-text-caption text-[color:var(--text-muted)] font-medium mb-0.5">{label}</dt>
              <dd className="tm-text-label text-[color:var(--text-strong)]">{value}</dd>
            </div>
          ))}
        </dl>
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
                'inline-flex items-center min-h-[44px] px-4 rounded-lg tm-text-label font-medium transition-colors',
                'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                active
                  ? 'bg-white [color:var(--text-strong)] shadow-sm'
                  : '[color:var(--text-muted)] hover:text-[color:var(--text-strong)]',
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

      <AdminToasts toasts={toasts} />
    </>
  );
}
