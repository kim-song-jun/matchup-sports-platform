'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { useShellOverride } from '@/components/v1-ui/shell-override';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertBanner, Card, EmptyState, SectionTitle } from '@/components/v1-ui/primitives';
import { ChevronRight, UsersRound } from 'lucide-react';
import { getSportAccent } from '@/lib/v1-sport-accent';
import { appRoute } from '@/lib/app-route';
import {
  useV1Tournament,
  useV1MyRegistrations,
  useV1TournamentPlayers,
  useV1CancelRegistrationRequest,
  useV1WithdrawCancelRegistrationRequest,
  useV1Team,
  useV1MyTeams,
} from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { formatEntryFee } from '@/lib/date-utils';
import {
  filterTournamentTeamsBySport,
  getTournamentTeamEmptyState,
} from '@/lib/tournament-team-eligibility';
import {
  describeTournamentCapacity,
  describeTournamentRegistrationBlock,
  resolveTournamentCapacity,
  resolveTournamentRegistrationBlock,
  type TournamentCapacity,
  type TournamentRegistrationBlockReason,
} from '@/lib/tournament-registration-availability';
import type {
  V1TournamentRegistration,
  V1TournamentRegistrationStatus,
  V1TournamentPaymentMethod,
  V1MyTeam,
} from '@/types/api';

function normalizeMyTeams(data: ReturnType<typeof useV1MyTeams>['data']): V1MyTeam[] {
  if (!data) return [];
  return 'items' in data ? data.items : (data as V1MyTeam[]);
}

/* ── Status helpers ── */

type StatusConfig = { badgeClass: string; label: string };

function registrationStatusConfig(status: V1TournamentRegistrationStatus): StatusConfig {
  switch (status) {
    case 'draft':
      return { badgeClass: 'tm-badge-grey', label: '임시저장' };
    case 'submitted':
      return { badgeClass: 'tm-badge-blue', label: '운영진 확인 중' };
    case 'awaiting_payment':
      return { badgeClass: 'tm-badge-orange', label: '입금 대기' };
    case 'payment_checking':
      return { badgeClass: 'tm-badge-blue', label: '명단 확인 중' };
    case 'paid':
      return { badgeClass: 'tm-badge-blue', label: '결제 완료' };
    case 'confirmed':
      return { badgeClass: 'tm-badge-green', label: '참가 확정' };
    case 'waitlisted':
      return { badgeClass: 'tm-badge-orange', label: '대기 중' };
    case 'cancel_requested':
      return { badgeClass: 'tm-badge-red', label: '취소 요청 중' };
    case 'cancelled':
      return { badgeClass: 'tm-badge-grey', label: '취소' };
    default:
      return { badgeClass: 'tm-badge-grey', label: status };
  }
}

function paymentMethodLabel(method: V1TournamentPaymentMethod): string {
  return method === 'pg' ? '카드 · 간편결제' : '계좌이체';
}

/**
 * 참가비가 없으면 결제 수단 대신 **"무료"** 라고 말한다.
 *
 * 무료 대회인데 "계좌이체" 라고 적으면 참가자는 내지도 않을 돈의 결제 수단을 확인하게 된다
 * (2026-09-04 alpha 실측 — 결함 #6). 신청 화면에서 결제 수단을 아예 묻지 않게 고쳤으므로
 * 이 표기도 함께 맞춘다.
 */
function paymentSummaryLabel(method: V1TournamentPaymentMethod, isFreeEntry: boolean): string {
  return isFreeEntry ? '무료' : paymentMethodLabel(method);
}

/**
 * 목록 카드 메타에 붙일 결제 조각. **무료 대회에서는 빈 문자열** — 결제 수단도 상태도 안 붙인다.
 *
 * "무료" 로만 바꾸면 뒤에 상태가 따라붙어 **"무료 · 결제 완료"** 가 된다. 내지도 않은 돈이
 * "완료" 됐다는 말이라 참가자에게 의미가 없다. 참가 확정 여부는 같은 카드의 상태 배지가 말한다.
 */
function paymentMetaSuffix(
  payment: { method: V1TournamentPaymentMethod; status: string } | null | undefined,
  isFreeEntry: boolean,
): string {
  if (isFreeEntry || !payment) return '';
  return ` · ${paymentMethodLabel(payment.method)} · ${paymentStatusLabel(payment.status)}`;
}

function paymentStatusLabel(status: string): string {
  switch (status) {
    case 'ready': return '결제 대기';
    case 'paid': return '결제 완료';
    case 'cancelled': return '결제 취소';
    case 'refunded': return '환불';
    default: return '알 수 없음';
  }
}

export function shouldShowBankTransferAccountInfo({
  paymentMethod,
  paymentStatus,
  bankName,
  bankAccount,
  bankHolder,
}: {
  paymentMethod: V1TournamentPaymentMethod | null | undefined;
  paymentStatus: string | null | undefined;
  bankName: string | null | undefined;
  bankAccount: string | null | undefined;
  bankHolder: string | null | undefined;
}) {
  return paymentMethod === 'bank_transfer' &&
    paymentStatus === 'ready' &&
    Boolean(bankName?.trim() && bankAccount?.trim() && bankHolder?.trim());
}

/**
 * confirmedAt을 "확정일"로 표시해도 되는가.
 *
 * 감사 finding #47: 서버가 예전엔 decision과 무관하게 confirmedAt을 채워, 대기(waitlisted)
 * 처리된 팀도 화면에 "확정일"이 함께 떴다. 서버는 이제 decision==='confirm'일 때만 채우지만
 * (admin-registrations.service.ts), 그 전에 이미 오염된 과거 데이터가 남아 있을 수 있어
 * status까지 함께 확인한다 — status가 실제로 'confirmed'일 때만 표시한다.
 */
export function shouldShowConfirmedAt(
  status: V1TournamentRegistrationStatus,
  confirmedAt: string | null | undefined,
): boolean {
  return Boolean(confirmedAt) && status === 'confirmed';
}

/** Returns the badge class + label for the roster shortage badge.
 *  Mirrors the body-card logic: confirmed/paid → softer orange; else → hard red. */
function rosterShortagebadge(status: V1TournamentRegistrationStatus): { badgeClass: string; label: string } {
  if (status === 'confirmed' || status === 'paid') {
    return { badgeClass: 'tm-badge-orange', label: '명단 부족' };
  }
  return { badgeClass: 'tm-badge-red', label: '인원 부족' };
}

function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function formatMonthDay(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function formatMonthDayRange(startStr: string | null, endStr: string | null): string {
  const start = formatMonthDay(startStr);
  if (!start) return '';
  const end = formatMonthDay(endStr);
  if (!end || end === start) return start;
  return `${start}~${end}`;
}

/* ── Inline fact icons for the registration pass (none of these exist in icons.tsx) ── */

function FactIconBase({ size = 15, children }: { size?: number; children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function CalendarIcon({ size }: { size?: number }) {
  return (
    <FactIconBase size={size}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </FactIconBase>
  );
}

function MapPinIcon({ size }: { size?: number }) {
  return (
    <FactIconBase size={size}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
      <circle cx="12" cy="10" r="3" />
    </FactIconBase>
  );
}

function ReceiptIcon({ size }: { size?: number }) {
  return (
    <FactIconBase size={size}>
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1V2l-2 1-2-1-2 1-2-1-2 1-2-1z" />
      <line x1="8" y1="8" x2="16" y2="8" />
      <line x1="8" y1="12" x2="14" y2="12" />
    </FactIconBase>
  );
}

/* ── Registration pass card (Direction A) — confirmed / waitlisted / paid ──
 * Replaces the old colored-box hero + orange roster-nudge box with a single
 * white "참가권" pass: sport chip + status pill + title, a dashed ticket-stub
 * divider, the show-up facts (일정·장소·결제), and a roster next-step footer. */

function PassFact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: 'var(--text-caption)', display: 'inline-flex', flexShrink: 0 }}>{icon}</span>
      <span className="tm-text-caption" style={{ color: 'var(--text-caption)', width: 38, flexShrink: 0 }}>{label}</span>
      <span className="tm-text-label" style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function RegistrationPass({
  tournamentId,
  registrationId,
  status,
  sportCode,
  title,
  teamName,
  scheduledAt,
  scheduledEndAt,
  venue,
  paymentSummary,
  rosterCount,
  minPlayers,
  isRosterLocked,
  belowMinimum,
}: {
  tournamentId: string;
  registrationId: string;
  status: V1TournamentRegistrationStatus;
  sportCode: string;
  title: string;
  teamName: string | null;
  scheduledAt: string | null;
  scheduledEndAt: string | null;
  venue: string | null;
  paymentSummary: string | null;
  rosterCount: number;
  minPlayers: number;
  isRosterLocked: boolean;
  belowMinimum: boolean;
}) {
  const rosterHref = appRoute(`/tournaments/${tournamentId}/registrations/${registrationId}/roster`);

  /* #24: awaiting_payment도 동등 강도로 렌더 — orange accent + 계좌 정보 안내 카드 */
  if (status === 'awaiting_payment') {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-container)',
          overflow: 'hidden',
          marginBottom: 16,
        }}
      >
        <div style={{ padding: '16px 20px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
            <span className="tm-badge tm-badge-orange">입금 대기</span>
          </div>
          <div className="tm-text-body-lg" style={{ color: 'var(--text-strong)', fontWeight: 700, lineHeight: 1.35 }}>
            {title}
          </div>
          {teamName ? (
            <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
              {teamName}
            </div>
          ) : null}
        </div>
        <div
          style={{
            borderTop: '1px dashed var(--border)',
            padding: '12px 20px',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}
        >
          <PassFact icon={<CalendarIcon />} label="일정" value={formatMonthDayRange(scheduledAt, scheduledEndAt) || '일정 미정'} />
          <PassFact icon={<MapPinIcon />} label="장소" value={venue || '장소 미정'} />
          {paymentSummary ? <PassFact icon={<ReceiptIcon />} label="참가비" value={paymentSummary} /> : null}
        </div>
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 20px' }}>
          <p className="tm-text-caption" style={{ color: 'var(--orange700)', lineHeight: 1.6, margin: 0, fontWeight: 600 }}>
            신청 내역에서 계좌 정보를 확인하고 참가비를 입금해 주세요.
          </p>
        </div>
      </div>
    );
  }

  if (status !== 'confirmed' && status !== 'waitlisted' && status !== 'paid') return null;

  const accent = getSportAccent(sportCode);
  const statusCfg = registrationStatusConfig(status);
  const dateStr = formatMonthDayRange(scheduledAt, scheduledEndAt);
  /* Roster next-step applies to active registrations; waitlisted shows a status note instead. */
  const showRosterFooter = status === 'confirmed' || status === 'paid';

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-container)',
        overflow: 'hidden',
        marginBottom: 16,
      }}
    >
      {/* Header: sport chip + status pill, title, team */}
      <div style={{ padding: '16px 20px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
          <span
            className="tm-text-micro"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: accent.badgeBg, color: accent.badgeText,
              fontWeight: 600, padding: '3px 8px', borderRadius: 'var(--radius-pill)', flexShrink: 0,
            }}
          >
            <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: 'var(--radius-circle)', background: accent.dot }} />
            {accent.label}
          </span>
          <span className={`tm-badge ${statusCfg.badgeClass}`}>{statusCfg.label}</span>
        </div>
        <div className="tm-text-body-lg" style={{ color: 'var(--text-strong)', fontWeight: 700, lineHeight: 1.35 }}>
          {title}
        </div>
        {teamName ? (
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
            {teamName}
          </div>
        ) : null}
      </div>

      {/* Facts: 일정 · 장소 · 결제 (dashed ticket-stub divider) */}
      <div
        style={{
          borderTop: '1px dashed var(--border)',
          padding: '12px 20px',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}
      >
        <PassFact icon={<CalendarIcon />} label="일정" value={dateStr || '일정 미정'} />
        <PassFact icon={<MapPinIcon />} label="장소" value={venue || '장소 미정'} />
        {paymentSummary ? <PassFact icon={<ReceiptIcon />} label="결제" value={paymentSummary} /> : null}
      </div>

      {/* Footer: roster next-step (confirmed/paid) or waitlist note */}
      {showRosterFooter ? (
        <div
          style={{
            borderTop: '1px solid var(--border)',
            padding: '12px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div className="tm-text-caption" style={{ color: 'var(--text-muted)', fontWeight: 600 }}>선수 명단</div>
            <div className="tm-text-micro" style={{ color: 'var(--text-body)', marginTop: 1 }}>
              {isRosterLocked
                ? belowMinimum
                  ? `${rosterCount}명 / 최소 ${minPlayers}명 · 마감`
                  : `${rosterCount}명 · 마감`
                : belowMinimum
                  ? `${rosterCount}명 / 최소 ${minPlayers}명 등록`
                  : `${rosterCount}명 등록 완료`}
            </div>
          </div>
          {/*
            감사 finding #51: 잠기면 이 링크가 통째로 사라져, 팀장이 대회 당일 자기 팀 확정
            명단을 앱에서 확인할 방법이 없었다(명단 페이지 자체는 잠금 상태에서도 읽기 전용으로
            잘 그린다 — tournament-roster-client.tsx 참조). 잠겼을 땐 라벨만 '명단 확인'으로
            바꿔 읽기 전용으로라도 계속 연결한다.
          */}
          <Link
            href={rosterHref}
            className="tm-text-label"
            aria-label={isRosterLocked ? '선수 명단 확인하기' : belowMinimum ? '선수 명단 등록하기' : '선수 명단 수정하기'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 1,
              color: 'var(--blue700)', fontWeight: 700, flexShrink: 0,
              minHeight: 44, paddingLeft: 8,
            }}
          >
            {isRosterLocked ? '명단 확인' : belowMinimum ? '선수 등록' : '선수 수정'}
            <ChevronRight size={16} />
          </Link>
        </div>
      ) : (
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 20px' }}>
          {/* 감사 finding(reg-confirm-reapply-state-machine #1): "자동으로"라는 문구가 실제로
              존재하지 않는 자동 승격을 약속하고 있었다 — 대기→확정 전이는 운영자가 수동으로
              처리한다(어드민 대기 신청 행의 "확정" 버튼). 이행 가능한 문구로 정정한다. */}
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
            앞 순위 팀이 취소하면 운영진이 확인 후 확정해 드려요.
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Cancel confirmation modal ── */

function CancelModal({
  open,
  onConfirm,
  onClose,
  isSubmitting,
  error,
}: {
  open: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
  isSubmitting: boolean;
  error: string | null;
}) {
  const [reason, setReason] = useState('');

  // 예전에는 부모가 조건부로 마운트해서 닫으면 이 state 가 자동으로 사라졌다.
  // 퇴장 애니메이션 때문에 컴포넌트를 살려 두게 되면서 그 초기화가 없어졌다 —
  // 취소 사유를 쓰다 닫으면 다시 열었을 때 그대로 남는다. 열릴 때 비운다.
  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  // 포커스 저장·복원, 초기 포커스, ESC, focus trap, 스크롤 잠금을 공용 훅에 맡긴다.
  // 직접 구현해 두면 퇴장 애니메이션을 넣을 때 그 전부를 mounted 기준으로 다시
  // 손봐야 하는데, 훅은 이미 그렇게 돼 있다(알림 시트에서 겪은 문제).
  // exitMs 는 .tm-filter-sheet.is-closing 의 0.22s 와 맞춘다 — 모달(160ms)보다 길다.
  const { dialogRef: sheetRef, initialFocusRef: closeBtnRef, onBackdropClick, mounted, closing } =
    useModalA11y<HTMLButtonElement, HTMLElement>({
      open,
      onClose,
      pending: isSubmitting,
      exitMs: 220,
    });

  if (!mounted) return null;

  return (
    <>
      {/* Scrim — v1 pattern */}
      <div
        aria-hidden="true"
        className={`tm-filter-scrim${closing ? ' is-closing' : ''}`}
        onClick={onBackdropClick}
      />
      {/* Sheet layer */}
      <div className="tm-filter-layer">
        <section
          ref={sheetRef}
          className={`tm-filter-sheet${closing ? ' is-closing' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-modal-title"
        >
          <div className="tm-filter-sheet-handle" />

          <div className="tm-filter-sheet-head" style={{ marginBottom: 8 }}>
            <h2
              id="cancel-modal-title"
              className="tm-text-body-lg"
              style={{ color: 'var(--text-strong)' }}
            >
              취소 요청
            </h2>
          </div>

          <p className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 16 }}>
            취소 요청을 보내면 운영진이 검토 후 처리해요. 환불 정책에 따라 환불 금액이 달라질 수 있어요.
          </p>

          <label htmlFor="cancel-reason" className="tm-text-caption" style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
            취소 사유 (선택)
          </label>
          <textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="취소 사유를 입력해 주세요."
            maxLength={200}
            rows={3}
            className="tm-input"
            style={{ width: '100%', resize: 'vertical', lineHeight: 1.5 }}
          />

          {error ? (
            <div style={{ marginTop: 12 }}>
              <AlertBanner message={error} />
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button
              ref={closeBtnRef}
              type="button"
              className="tm-btn tm-btn-lg tm-btn-neutral"
              style={{ flex: 1 }}
              onClick={onClose}
              disabled={isSubmitting}
            >
              닫기
            </button>
            <button
              type="button"
              className="tm-btn tm-btn-lg tm-btn-danger"
              style={{ flex: 2 }}
              onClick={() => onConfirm(reason)}
              disabled={isSubmitting}
            >
              {isSubmitting ? '취소 요청 중…' : '참가 취소 요청'}
            </button>
          </div>
        </section>
      </div>
    </>
  );
}

/* ── Info row (local, mirrors the primitives version) ── */

function InfoRow({
  label,
  value,
  valueColor,
  isLast,
}: {
  label: string;
  value: string;
  valueColor?: string;
  /** Pass true on the final row of a card to remove the redundant bottom hairline. */
  isLast?: boolean;
}) {
  return (
    <div
      className="tm-info-row"
      style={{ ...(isLast ? { borderBottom: 'none' } : {}) }}
    >
      <div className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>
        {label}
      </div>
      <div className="tm-text-label" style={{ textAlign: 'right', color: valueColor ?? 'var(--text-strong)' }}>
        {value}
      </div>
    </div>
  );
}

function StatusInfoRow({
  label,
  statusConfig,
}: {
  label: string;
  statusConfig: StatusConfig;
}) {
  return (
    <div className="tm-info-row">
      <div className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>
        {label}
      </div>
      <span className={`tm-badge ${statusConfig.badgeClass}`}>{statusConfig.label}</span>
    </div>
  );
}

/* ── Registration detail view ── */

function RegistrationDetailView({
  tournamentId,
  tournament,
  registration,
  canManageRegistration,
}: {
  tournamentId: string;
  tournament: {
    sportCode: string;
    title: string;
    entryFee: number;
    minPlayers: number;
    maxPlayers: number;
    scheduledAt: string | null;
    scheduledEndAt: string | null;
    venue: string | null;
  };
  registration: V1TournamentRegistration;
  canManageRegistration: boolean;
}) {
  const tournamentHref = appRoute(`/tournaments/${tournamentId}`);
  const rosterHref = appRoute(`/tournaments/${tournamentId}/registrations/${registration.id}/roster`);
  const { data: rosterData } = useV1TournamentPlayers(tournamentId, registration.id);
  const cancelRequest = useV1CancelRegistrationRequest(tournamentId, registration.id);
  const withdrawCancelRequest = useV1WithdrawCancelRegistrationRequest(tournamentId, registration.id);
  const { data: teamData } = useV1Team(registration.teamId);

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [withdrawCancelError, setWithdrawCancelError] = useState<string | null>(null);
  const cancelBusyRef = useRef(false);
  const withdrawCancelBusyRef = useRef(false);

  const statusConfig = registrationStatusConfig(registration.status);
  const players = rosterData?.players ?? [];
  const belowMinimum = rosterData?.belowMinimum ?? false;
  const isRosterLocked = Boolean(registration.rosterLockedAt);
  // 감사 finding #47 방어선 — shouldShowConfirmedAt 주석 참조.
  const showConfirmedAt = shouldShowConfirmedAt(registration.status, registration.confirmedAt);
  const isRosterEditBlockedByStatus =
    registration.status === 'cancel_requested' || registration.status === 'cancelled';
  const isRosterEditable = canManageRegistration && !isRosterLocked && !isRosterEditBlockedByStatus;
  const canCancelRequest =
    canManageRegistration &&
    (
      registration.status === 'awaiting_payment' ||
      registration.status === 'payment_checking' ||
      registration.status === 'paid' ||
      registration.status === 'confirmed' ||
      registration.status === 'waitlisted'
    );
  const canWithdrawCancelRequest =
    canManageRegistration &&
    registration.status === 'cancel_requested';

  /* #8: prominent nudge triggers when confirmed/paid AND roster is below minimum */
  const showRosterNudge =
    (registration.status === 'confirmed' || registration.status === 'paid') &&
    belowMinimum &&
    isRosterEditable;

  /* Compact payment summary for the pass facts (full breakdown lives in the 신청 내역 card). */
  const paymentSummary = registration.payment
    ? `${formatEntryFee(registration.payment.amount)} · ${paymentStatusLabel(registration.payment.status)}`
    : formatEntryFee(tournament.entryFee);

  /* The pass owns the roster glance+action for active states; the standalone roster
   * card only renders for states without a pass (e.g. awaiting_payment). */
  const passShowsRoster =
    registration.status === 'confirmed' || registration.status === 'paid';
  const paymentInstructions = registration.paymentInstructions;
  const shouldShowBankTransferAccount = shouldShowBankTransferAccountInfo({
    paymentMethod: registration.payment?.method,
    paymentStatus: registration.payment?.status,
    bankName: paymentInstructions?.bankName,
    bankAccount: paymentInstructions?.bankAccount,
    bankHolder: paymentInstructions?.bankHolder,
  });
  const paymentDetailMessage =
    registration.status === 'cancel_requested'
      ? '취소 요청을 검토 중이에요. 처리 결과를 안내받기 전에는 추가 입금을 하지 마세요.'
      : registration.status === 'payment_checking'
        ? '입금이 확인됐어요. 운영자가 선수 명단과 참가 조건을 확인하고 있어요.'
        : registration.status === 'awaiting_payment'
          ? paymentInstructions
            ? '위 계좌로 참가비를 입금해 주세요. 입금 확인 후 상태가 변경돼요.'
            : '입금 안내를 불러오지 못했어요. 새로고침 후에도 보이지 않으면 운영팀에 문의해 주세요.'
          : null;
  const showAwaitingPaymentNotice = registration.status === 'awaiting_payment';

  async function handleCancelConfirm(reason: string) {
    if (cancelBusyRef.current || cancelRequest.isPending) return;
    cancelBusyRef.current = true;
    setCancelError(null);
    try {
      await cancelRequest.mutateAsync({ reason: reason || undefined });
      setShowCancelModal(false);
    } catch (err) {
      setCancelError(extractErrorMessage(err, '취소 요청 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.'));
    } finally {
      cancelBusyRef.current = false;
    }
  }

  async function handleWithdrawCancelRequest() {
    if (withdrawCancelBusyRef.current || withdrawCancelRequest.isPending) return;
    withdrawCancelBusyRef.current = true;
    setWithdrawCancelError(null);
    try {
      await withdrawCancelRequest.mutateAsync();
    } catch (err) {
      setWithdrawCancelError(extractErrorMessage(err, '취소 요청 철회 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.'));
    } finally {
      withdrawCancelBusyRef.current = false;
    }
  }

  /* ── Desktop right rail content ── */
  const RailContent = (
    <>
      {/* Status summary */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>신청 상태</span>
          <span className={`tm-badge ${statusConfig.badgeClass}`}>{statusConfig.label}</span>
        </div>
        <div className="tm-text-label" style={{ color: 'var(--text-strong)', fontWeight: 700, lineHeight: 1.4 }}>
          {tournament.title}
        </div>
        {/* 감사 finding #47 방어선 — shouldShowConfirmedAt 주석 참조. */}
        {showConfirmedAt ? (
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
            확정일 {formatDateShort(registration.confirmedAt)}
          </div>
        ) : null}
      </div>

      {/* Roster status summary */}
      <div
        style={{
          borderTop: '1px solid var(--border)',
          paddingTop: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>선수 명단</span>
          {belowMinimum && !isRosterEditBlockedByStatus ? (
            <span className={`tm-badge ${rosterShortagebadge(registration.status).badgeClass}`}>
              {rosterShortagebadge(registration.status).label}
            </span>
          ) : isRosterEditBlockedByStatus ? (
            <span className="tm-badge tm-badge-grey">수정 불가</span>
          ) : isRosterLocked ? (
            <span className="tm-badge tm-badge-grey">마감</span>
          ) : (
            <span className="tm-badge tm-badge-green">수정 가능</span>
          )}
        </div>
        <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
          {players.length}명 · 최소 {tournament.minPlayers}명 · 최대 {tournament.maxPlayers}명
        </div>
      </div>

      {/* Primary CTA: roster registration if nudge is active */}
      {showRosterNudge ? (
        <Link
          href={rosterHref}
          className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
          aria-label="선수 명단 등록하기"
          style={{ marginBottom: 8 }}
        >
          선수 등록하기
        </Link>
      ) : isRosterEditable ? (
        <Link
          href={rosterHref}
          className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
          aria-label="선수 명단 수정하기"
          style={{ marginBottom: 8 }}
        >
          선수 수정
        </Link>
      ) : canManageRegistration && isRosterLocked ? (
        // 감사 finding #51: 명단이 잠기면 이 레일에서 명단으로 가는 링크가 통째로 사라져,
        // 팀장이 대회 당일 확정 명단을 확인할 방법이 없었다. 읽기 전용으로라도 계속 연결한다.
        <Link
          href={rosterHref}
          className="tm-btn tm-btn-lg tm-btn-neutral tm-btn-block"
          aria-label="선수 명단 확인하기"
          style={{ marginBottom: 8 }}
        >
          명단 확인
        </Link>
      ) : null}

      {/* Secondary CTAs */}
      <Link
        href={tournamentHref}
        className="tm-btn tm-btn-lg tm-btn-neutral tm-btn-block"
        style={{ marginBottom: 8 }}
      >
        대회 상세 보기
      </Link>

      {canManageRegistration && (registration.status === 'cancelled' || registration.status === 'draft') ? (
        <Link
          href={`/tournaments/${tournamentId}/apply`}
          className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
          style={{ marginBottom: 8 }}
        >
          다시 신청하기
        </Link>
      ) : null}

      {canCancelRequest ? (
        <button
          type="button"
          className="tm-btn tm-btn-lg tm-btn-neutral tm-btn-block"
          onClick={() => { setCancelError(null); setWithdrawCancelError(null); setShowCancelModal(true); }}
          style={{ marginTop: 4 }}
        >
          참가 취소 요청
        </button>
      ) : null}

      {canWithdrawCancelRequest ? (
        <button
          type="button"
          className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
          onClick={handleWithdrawCancelRequest}
          disabled={withdrawCancelRequest.isPending}
          style={{ marginTop: 4 }}
        >
          {withdrawCancelRequest.isPending ? '철회 중...' : '취소 요청 철회'}
        </button>
      ) : null}

      {withdrawCancelError ? (
        <div className="tm-text-caption" role="alert" style={{ color: 'var(--red700)', marginTop: 8, lineHeight: 1.5 }}>
          {withdrawCancelError}
        </div>
      ) : null}
    </>
  );

  return (
    <>
      <div className="tm-tournament-my-body">
        {/* #4 LAYOUT: form-grid — mobile: single column, desktop: 2-col */}
        <div className="tm-tournament-form-grid" style={{ padding: '16px 20px 0' }}>

          {/* LEFT: main content */}
          <div className="tm-tournament-form-main">
            {/* Registration pass (Direction A) — confirmation + facts + roster next-step.
                Replaces the old colored hero box + orange roster-nudge box (color collision removed). */}
            <RegistrationPass
              tournamentId={tournamentId}
              registrationId={registration.id}
              status={registration.status}
              sportCode={tournament.sportCode}
              title={tournament.title}
              teamName={teamData?.name ?? null}
              scheduledAt={tournament.scheduledAt}
              scheduledEndAt={tournament.scheduledEndAt}
              venue={tournament.venue}
              paymentSummary={paymentSummary}
              rosterCount={players.length}
              minPlayers={tournament.minPlayers}
              isRosterLocked={isRosterLocked}
              belowMinimum={belowMinimum}
            />

            {/* Roster — surface before 신청 내역 so users notice roster registration early. */}
            {!passShowsRoster ? (
            <section aria-labelledby="roster-heading" style={{ marginTop: 16 }}>
              <div style={{ marginLeft: -20, marginRight: -20 }}>
                <SectionTitle id="roster-heading" title="선수 명단" />
              </div>
              <Card pad={16} style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    {/* P1 숫자:단위 2:1 + tabular-nums */}
                  <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                      <span
                        className="tab-num"
                        style={{ fontSize: 'var(--font-size-subhead)', fontWeight: 700, color: 'var(--text-strong)', lineHeight: 1.2 }}
                      >
                        {players.length}
                      </span>
                      <span style={{ fontSize: 'var(--font-size-body)', color: 'var(--text-strong)', fontWeight: 500, lineHeight: 1.2 }}>명</span>
                      <span className="tm-text-caption" style={{ color: 'var(--text-muted)', marginLeft: 4 }}>등록됨</span>
                    </div>
                    <div className="tm-text-micro" style={{ color: 'var(--text-caption)', marginTop: 2 }}>
                      {`최소 ${tournament.minPlayers}명 · 최대 ${tournament.maxPlayers}명`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {belowMinimum && !isRosterEditBlockedByStatus ? (
                      /* P0: status-aware badge — shared helper keeps rail and body in sync */
                      <span className={`tm-badge ${rosterShortagebadge(registration.status).badgeClass}`}>
                        {rosterShortagebadge(registration.status).label}
                      </span>
                    ) : null}
                    {isRosterEditBlockedByStatus ? (
                      <span className="tm-badge tm-badge-grey">수정 불가</span>
                    ) : null}
                    {isRosterLocked ? (
                      <span className="tm-badge tm-badge-grey">마감</span>
                    ) : null}
                    {isRosterEditable ? (
                      <Link
                        href={rosterHref}
                        className="tm-btn tm-btn-md tm-btn-neutral"
                        aria-label="선수 명단 수정하기"
                        style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                      >
                        선수 수정
                      </Link>
                    ) : canManageRegistration && isRosterLocked ? (
                      // 감사 finding #51 — 위 데스크톱 레일과 같은 이유로 읽기 전용 링크를 남긴다.
                      <Link
                        href={rosterHref}
                        className="tm-btn tm-btn-md tm-btn-neutral"
                        aria-label="선수 명단 확인하기"
                        style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                      >
                        명단 확인
                      </Link>
                    ) : null}
                  </div>
                </div>
                {belowMinimum && !isRosterEditBlockedByStatus ? (
                  /* P0: copy branches on whether confirmation is still blocked */
                  registration.status === 'confirmed' || registration.status === 'paid' ? (
                    <p className="tm-text-caption" style={{ marginTop: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      대회 전까지 선수를 더 등록할 수 있어요.
                    </p>
                  ) : (
                    <p className="tm-text-caption" style={{ marginTop: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      최소 인원을 채워야 참가 확정이 가능해요.
                    </p>
                  )
                ) : null}
              </Card>
            </section>
            ) : null}

            {/* Registration record — 신청 + 결제 consolidated into one "신청 내역" card */}
            <section aria-labelledby="reg-detail-heading">
              <div style={{ marginLeft: -20, marginRight: -20 }}>
                <SectionTitle title="신청 내역" />
              </div>
              <Card pad={16} style={{ marginTop: 8 }}>
                {/* 신청 group */}
                <div id="reg-detail-heading" style={{ display: 'flex', flexDirection: 'column' }}>
                  <StatusInfoRow label="신청 상태" statusConfig={statusConfig} />
                  {/* 감사 finding #47 방어선 — 위 데스크톱 레일과 같은 이유로 status까지 함께 본다. */}
                  <InfoRow
                    label="신청일"
                    value={formatDateShort(registration.createdAt)}
                    isLast={!showConfirmedAt && !registration.cancelRequestedAt && !registration.cancelReason}
                  />
                  {showConfirmedAt ? (
                    <InfoRow
                      label="확정일"
                      value={formatDateShort(registration.confirmedAt)}
                      isLast={!registration.cancelRequestedAt && !registration.cancelReason}
                    />
                  ) : null}
                  {registration.cancelRequestedAt ? (
                    <InfoRow
                      label="취소 요청일"
                      value={formatDateShort(registration.cancelRequestedAt)}
                      isLast={!registration.cancelReason}
                    />
                  ) : null}
                  {registration.cancelReason ? (
                    <InfoRow label="취소 사유" value={registration.cancelReason} isLast />
                  ) : null}
                </div>

                {/* 결제 group */}
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12 }}>
                  <div className="tm-text-micro" style={{ color: 'var(--text-caption)', fontWeight: 600, marginBottom: 8 }}>
                    결제
                  </div>
                  {registration.payment ? (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <InfoRow
                        label="결제 수단"
                        value={paymentSummaryLabel(registration.payment.method, tournament.entryFee === 0)}
                      />
                      <InfoRow label="결제 금액" value={formatEntryFee(registration.payment.amount)} />
                      <InfoRow
                        label="결제 상태"
                        value={paymentStatusLabel(registration.payment.status)}
                        isLast={!registration.payment.paidAt && !shouldShowBankTransferAccount}
                      />
                      {registration.payment.paidAt ? (
                        <InfoRow label="결제일" value={formatDateShort(registration.payment.paidAt)} isLast={!shouldShowBankTransferAccount} />
                      ) : null}
                      {shouldShowBankTransferAccount ? (
                        <>
                          <InfoRow label="은행" value={paymentInstructions?.bankName ?? ''} />
                          <InfoRow label="계좌번호" value={paymentInstructions?.bankAccount ?? ''} />
                          <InfoRow label="예금주" value={paymentInstructions?.bankHolder ?? ''} isLast />
                          <div className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.6, paddingTop: 4 }}>
                            {paymentDetailMessage ?? '입금이 확인됐어요. 운영자가 신청 상태를 확인하고 있어요.'}
                          </div>
                        </>
                      ) : null}
                      {paymentDetailMessage && !shouldShowBankTransferAccount ? (
                        <div className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.6, paddingTop: 4 }}>
                          {paymentDetailMessage}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <InfoRow
                        label="참가비"
                        value={formatEntryFee(tournament.entryFee)}
                        isLast={!registration.depositorName && registration.status !== 'awaiting_payment'}
                      />
                      {registration.depositorName ? (
                        <InfoRow
                          label="입금자명"
                          value={registration.depositorName}
                          isLast={registration.status !== 'awaiting_payment'}
                        />
                      ) : null}
                      {/* awaiting_payment 상태이고 계좌 정보가 있으면 입금 안내 렌더 */}
                      {registration.status === 'awaiting_payment' && paymentInstructions ? (
                        <>
                          <InfoRow label="은행" value={paymentInstructions.bankName} />
                          <InfoRow label="계좌번호" value={paymentInstructions.bankAccount} />
                          <InfoRow label="예금주" value={paymentInstructions.bankHolder} isLast />
                        </>
                      ) : null}
                      <div className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.6, paddingTop: 4 }}>
                        {paymentDetailMessage ?? '아직 결제 정보가 없어요.'}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </section>

            {showAwaitingPaymentNotice ? (
              <Card pad={16} style={{ marginTop: 12, background: 'var(--grey50)' }}>
                <div className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.65 }}>
                  <p style={{ margin: 0 }}>아직 참가가 확정된 상태는 아닙니다.</p>
                  <p style={{ margin: '8px 0 0' }}>
                    안내된 계좌로 참가비를 입금해 주세요.
                    <br />
                    입금 확인이 완료되면 참가가 최종 확정됩니다.
                  </p>
                </div>
              </Card>
            ) : null}

            {/* Mobile-only: Cancel / Reapply actions (hidden on desktop — rail handles them) */}
            <div className="tm-hide-desktop" style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {canManageRegistration && (registration.status === 'cancelled' || registration.status === 'draft') ? (
                <Link
                  href={`/tournaments/${tournamentId}/apply`}
                  className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
                >
                  다시 신청하기
                </Link>
              ) : null}

              {/* P1: de-emphasised; red danger lives only inside CancelModal's confirm button */}
              {canCancelRequest ? (
                <button
                  type="button"
                  className="tm-btn tm-btn-lg tm-btn-neutral tm-btn-block"
                  onClick={() => { setCancelError(null); setWithdrawCancelError(null); setShowCancelModal(true); }}
                >
                  참가 취소 요청
                </button>
              ) : null}

              {canWithdrawCancelRequest ? (
                <button
                  type="button"
                  className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
                  onClick={handleWithdrawCancelRequest}
                  disabled={withdrawCancelRequest.isPending}
                >
                  {withdrawCancelRequest.isPending ? '철회 중...' : '취소 요청 철회'}
                </button>
              ) : null}

              {withdrawCancelError ? (
                <div className="tm-text-caption" role="alert" style={{ color: 'var(--red700)', lineHeight: 1.5 }}>
                  {withdrawCancelError}
                </div>
              ) : null}
            </div>

            <div className="tm-hide-desktop" style={{ marginTop: 12, marginBottom: 32 }}>
              <Link
                href={`/tournaments/${tournamentId}`}
                className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block"
              >
                대회 상세 보기
              </Link>
            </div>
          </div>

          {/* RIGHT RAIL: desktop only sticky summary + actions */}
          <aside
            className="tm-tournament-form-rail tm-show-desktop"
            role="complementary"
            aria-label="신청 요약"
          >
            {RailContent}
          </aside>
        </div>
      </div>

      {/* Cancel modal */}
      {/* 조건부 렌더 대신 open 을 넘긴다 — 부모가 즉시 언마운트하면 퇴장 애니메이션이
          재생될 틈이 없다. 실제 언마운트는 CancelModal 안의 훅이 지연시킨다. */}
      <CancelModal
        open={showCancelModal}
        onConfirm={handleCancelConfirm}
        onClose={() => { setShowCancelModal(false); setCancelError(null); }}
        isSubmitting={cancelRequest.isPending}
        error={cancelError}
      />
    </>
  );
}

/* ── No registration state ── */

function NoRegistrationState({ tournamentId }: { tournamentId: string }) {
  return (
    <div style={{ padding: '0 20px', marginTop: 16 }}>
      <Card pad={32} style={{ textAlign: 'center' }}>
        <div className="tm-text-body-lg" style={{ color: 'var(--text-strong)' }}>
          신청 내역이 없어요
        </div>
        <p className="tm-text-caption" style={{ marginTop: 8, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          신청 완료 후 이 페이지에서 상태를 확인할 수 있어요.
        </p>
        <Link
          href={`/tournaments/${tournamentId}/apply`}
          className="tm-btn tm-btn-lg tm-btn-primary"
          style={{ marginTop: 24, display: 'inline-block' }}
        >
          참가 신청하기
        </Link>
      </Card>
    </div>
  );
}

function MyRegistrationsList({
  tournamentId,
  registrations,
  isFreeEntry,
}: {
  tournamentId: string;
  registrations: V1TournamentRegistration[];
  isFreeEntry: boolean;
}) {
  return (
    <div style={{ padding: '0 20px 120px', marginTop: 16 }}>
      <div style={{ marginLeft: -20, marginRight: -20 }}>
        <SectionTitle title="팀별 신청 내역" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
        {registrations.map((registration) => {
          const status = registrationStatusConfig(registration.status);
          const href = appRoute(`/tournaments/${tournamentId}/my?reg=${registration.id}`);
          const teamName = registration.teamName ?? `팀 ${registration.teamId.slice(0, 8)}`;
          const primaryAction = registration.status === 'draft' ? '이어서 작성' : '상세 보기';
          return (
            <Link key={registration.id} href={href} style={{ display: 'block', textDecoration: 'none' }}>
              <Card pad={16}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span
                        className="tm-text-label"
                        style={{
                          color: 'var(--text-strong)',
                          fontWeight: 700,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {teamName}
                      </span>
                      <span className={`tm-badge ${status.badgeClass}`}>{status.label}</span>
                    </div>
                    <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 8 }}>
                      선수 {registration.playerCount}명
                      {paymentMetaSuffix(registration.payment, isFreeEntry)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}>
                    <span className="tm-text-caption">{primaryAction}</span>
                    <ChevronRight size={16} />
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main client ── */

function TeamRegistrationHub({
  tournamentId,
  tournamentSportId,
  teams,
  hasAnyTeam,
  registrations,
  capacity,
  blockReason,
  isFreeEntry,
}: {
  tournamentId: string;
  tournamentSportId: string | null;
  teams: V1MyTeam[];
  hasAnyTeam: boolean;
  registrations: V1TournamentRegistration[];
  capacity: TournamentCapacity | null;
  blockReason: TournamentRegistrationBlockReason | null;
  isFreeEntry: boolean;
}) {
  const registrationByTeamId = new Map(registrations.map((registration) => [registration.teamId, registration]));
  const emptyState = getTournamentTeamEmptyState(hasAnyTeam);
  const canStartNewRegistration = blockReason === null;
  // 정원이 입금대기 팀으로 차 있으면 "확정 5 / 8"만 보고 여유가 있다고 오해하게 된다.
  // 재신청이 막히는 이유를 이 화면에서 바로 읽을 수 있게 정원 구성을 그대로 노출한다.
  const blockMessage = blockReason && capacity
    ? describeTournamentRegistrationBlock(blockReason, capacity)
    : null;

  return (
    <div style={{ padding: '0 20px 120px', marginTop: 16 }}>
      <div style={{ marginLeft: -20, marginRight: -20 }}>
        <SectionTitle title="팀별 대회 신청" />
      </div>
      <p className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 4 }}>
        팀별로 신청하고 내역을 관리하세요.
      </p>

      {capacity ? (
        <div
          style={{
            marginTop: 12,
            padding: '12px 12px',
            borderRadius: 10,
            background: blockMessage ? 'var(--orange50)' : 'var(--grey50)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <span className="tm-text-caption" style={{ color: blockMessage ? 'var(--orange700)' : 'var(--text-strong)', fontWeight: 700 }}>
            정원 {describeTournamentCapacity(capacity)}
          </span>
          {blockMessage ? (
            <span className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {blockMessage}
            </span>
          ) : (
            <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
              {capacity.remainingCount}팀 더 신청할 수 있어요.
            </span>
          )}
        </div>
      ) : null}

      {teams.length === 0 ? (
        <div className="tm-tournament-registration-empty">
          {/* 신청이 막힌 대회에서 "팀 만들기"를 권하면, 바로 위 안내("지금은 참가 신청을
              받지 않아요")와 정면으로 어긋난다 — 팀을 만들어도 이 대회엔 신청할 수 없다. */}
          <EmptyState
            title={emptyState.title}
            sub={canStartNewRegistration ? emptyState.description : '이 대회는 지금 참가 신청을 받지 않아요.'}
            cta={canStartNewRegistration ? '팀 만들기' : undefined}
            onCta={canStartNewRegistration ? () => { window.location.href = '/teams/new'; } : undefined}
            icon={<UsersRound size={36} strokeWidth={1.5} />}
          />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          {teams.map((team) => {
            const registration = registrationByTeamId.get(team.teamId);
            const canManageTeam = team.role === 'owner' || team.role === 'manager';
            const matchesTournamentSport = team.sport.sportId === tournamentSportId;
            const canResumeRegistration =
              canManageTeam &&
              matchesTournamentSport &&
              Boolean(registration) &&
              (registration?.status === 'draft' || registration?.status === 'cancelled') &&
              canStartNewRegistration;
            const status = registration
              ? registrationStatusConfig(registration.status)
              : { badgeClass: 'tm-badge-grey', label: '미신청' };
            const actionLabel = !canManageTeam
              ? '권한 필요'
              : registration?.status === 'draft'
                ? '이어서 작성'
                : registration?.status === 'cancelled'
                  ? '다시 신청'
                  : registration
                    ? '상세 관리'
                    : '신청 시작';
            const href = registration && registration.status !== 'draft' && registration.status !== 'cancelled'
              ? appRoute(`/tournaments/${tournamentId}/my?reg=${registration.id}`)
              : appRoute(`/tournaments/${tournamentId}/apply?team=${team.teamId}`);
            const actionDisabled =
              !canManageTeam ||
              !matchesTournamentSport ||
              ((!registration || registration.status === 'cancelled') && !canStartNewRegistration);
            const displayActionLabel = registration
              ? canResumeRegistration
                ? actionLabel
                : canManageTeam
                  ? '\uC0C1\uC138 \uAD00\uB9AC'
                  : '\uC0C1\uC138 \uBCF4\uAE30'
              : actionLabel;
            const displayHref = registration && !canResumeRegistration
              ? appRoute(`/tournaments/${tournamentId}/my?reg=${registration.id}`)
              : href;
            const displayActionDisabled = registration ? false : actionDisabled;
            // 취소된 신청을 다시 넣으려는 팀에게는 "왜 지금 안 되는지"가 가장 필요한 정보다.
            const reapplyBlockedNote =
              registration?.status === 'cancelled' && blockMessage ? ` · ${blockMessage}` : '';
            const meta = registration
              ? `선수 ${registration.playerCount}명${paymentMetaSuffix(registration.payment, isFreeEntry)}${reapplyBlockedNote}`
              : canStartNewRegistration
                ? '아직 이 팀으로 신청하지 않았어요'
                : blockMessage ?? '현재 새 신청을 받을 수 없어요';

            const content = (
              <Card pad={16}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span
                        className="tm-text-label"
                        style={{
                          color: 'var(--text-strong)',
                          fontWeight: 700,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {team.name}
                      </span>
                      <span className={`tm-badge ${status.badgeClass}`}>{status.label}</span>
                      {canManageTeam ? (
                        <span className="tm-badge tm-badge-blue">{team.role === 'owner' ? '대표' : '관리자'}</span>
                      ) : (
                        <span className="tm-badge tm-badge-grey">멤버</span>
                      )}
                    </div>
                    <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
                      {team.sport.name}
                      {team.region ? ` · ${team.region.name}` : ''}
                      {` · ${meta}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: displayActionDisabled ? 'var(--text-caption)' : 'var(--blue700)' }}>
                    <span className="tm-text-caption" style={{ fontWeight: 700 }}>{displayActionLabel}</span>
                    {!displayActionDisabled ? <ChevronRight size={16} /> : null}
                  </div>
                </div>
              </Card>
            );

            return displayActionDisabled ? (
              <div key={team.teamId} aria-disabled="true">
                {content}
              </div>
            ) : (
              <Link key={team.teamId} href={displayHref} style={{ display: 'block', textDecoration: 'none' }}>
                {content}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MyRegistrationPageClient({ tournamentId }: { tournamentId: string }) {
  const searchParams = useSearchParams();
  const selectedRegistrationId = searchParams.get('reg');
  const { data: tournament, isLoading: loadingTournament } = useV1Tournament(tournamentId);
  const { data: myTeamsData, isLoading: loadingTeams } = useV1MyTeams();
  const {
    data: registrations = [],
    isLoading: loadingRegistrations,
    isError: registrationsError,
    error: registrationsErr,
  } = useV1MyRegistrations(tournamentId);

  const teams = normalizeMyTeams(myTeamsData);
  const isLoading = loadingTournament || loadingRegistrations || loadingTeams;
  const selectedRegistration = selectedRegistrationId
    ? registrations.find((item) => item.id === selectedRegistrationId)
    : null;
  // route-chrome 테이블(fragments/tournaments-extra.ts)의 backHref는 항상 대회 상세로
  // 고정돼 있다 — `?reg=`로 특정 신청 상세(RegistrationDetailView)를 보는 중일 때는 셸
  // topbar 뒤로가기가 같은 라우트의 목록(TeamRegistrationHub, 쿼리 없는 /my)으로 가야
  // 한다. selectedRegistrationId가 아니라 selectedRegistration(실제로 매칭된 신청 존재
  // 여부)로 분기한다 — 잘못된/만료된 reg 값이면 아래에서 이미 목록 뷰로 폴백하므로
  // undefined로 둬 테이블 기본값(대회 상세)을 그대로 쓴다.
  useShellOverride({ backHref: selectedRegistration ? `/tournaments/${tournamentId}/my` : undefined });

  if (isLoading) {
    return (
              <div aria-busy="true" aria-label="신청 정보 불러오는 중" style={{ padding: '0 20px', marginTop: 24 }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              aria-hidden="true"
              style={{ height: 80, borderRadius: 'var(--radius-control)', background: 'var(--grey100)', marginBottom: 12 }}
            />
          ))}
        </div>
      );
  }

  if (registrationsError) {
    const msg = extractErrorMessage(registrationsErr, '신청 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    return (
              <div style={{ padding: '0 20px', marginTop: 24 }}>
          <AlertBanner message={msg} />
          <Link
            href={`/tournaments/${tournamentId}`}
            className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block"
            style={{ marginTop: 16 }}
          >
            대회 상세로 돌아가기
          </Link>
        </div>
      );
  }

  if (!tournament) {
    return (
              <TeamRegistrationHub
                isFreeEntry={false}
          tournamentId={tournamentId}
          tournamentSportId={null}
          teams={teams}
          hasAnyTeam={teams.length > 0}
          registrations={registrations}
          capacity={null}
          blockReason="not_open"
        />
      );
  }

  if (!selectedRegistration) {
    const registrationTeamIds = new Set(registrations.map((registration) => registration.teamId));
    const eligibleTeams = filterTournamentTeamsBySport(teams, tournament.sportId);
    const visibleTeams = teams.filter(
      (team) => eligibleTeams.includes(team) || registrationTeamIds.has(team.teamId),
    );
    return (
              <TeamRegistrationHub
                isFreeEntry={tournament?.entryFee === 0}
          tournamentId={tournamentId}
          tournamentSportId={tournament.sportId}
          teams={visibleTeams}
          hasAnyTeam={teams.length > 0}
          registrations={registrations}
          capacity={resolveTournamentCapacity(tournament)}
          blockReason={resolveTournamentRegistrationBlock(tournament)}
        />
      );
  }

  const selectedTeam = teams.find((team) => team.teamId === selectedRegistration.teamId);
  const canManageSelectedRegistration = selectedTeam?.role === 'owner' || selectedTeam?.role === 'manager';

  return (
          <RegistrationDetailView
        tournamentId={tournamentId}
        tournament={{
          sportCode: tournament.sport.code,
          title: tournament.title,
          entryFee: tournament.entryFee,
          minPlayers: tournament.minPlayers,
          maxPlayers: tournament.maxPlayers,
          scheduledAt: tournament.scheduledAt,
          scheduledEndAt: tournament.scheduledEndAt,
          venue: tournament.venue,
        }}
        registration={selectedRegistration}
        canManageRegistration={canManageSelectedRegistration}
      />
  );
}
