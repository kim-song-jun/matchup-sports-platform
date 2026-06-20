'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AppChrome } from '@/components/v1-ui/shell';
import { AlertBanner, Card, SectionTitle } from '@/components/v1-ui/primitives';
import { ChevronRightIcon } from '@/components/v1-ui/icons';
import { getSportAccent } from '@/lib/v1-sport-accent';
import {
  useV1Tournament,
  useV1MyRegistration,
  useV1TournamentPlayers,
  useV1CancelRegistrationRequest,
  useV1Team,
} from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import type {
  V1TournamentRegistration,
  V1TournamentRegistrationStatus,
  V1TournamentPaymentMethod,
} from '@/types/api';

/* ── Status helpers ── */

type StatusConfig = { badgeClass: string; label: string };

function registrationStatusConfig(status: V1TournamentRegistrationStatus): StatusConfig {
  switch (status) {
    case 'draft':
      return { badgeClass: 'tm-badge-grey', label: '임시저장' };
    case 'awaiting_payment':
      return { badgeClass: 'tm-badge-orange', label: '입금 대기' };
    case 'payment_checking':
      return { badgeClass: 'tm-badge-blue', label: '입금 확인 중' };
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

function paymentStatusLabel(status: string): string {
  switch (status) {
    case 'ready': return '결제 대기';
    case 'paid': return '결제 완료';
    case 'cancelled': return '결제 취소';
    case 'refunded': return '환불';
    default: return '알 수 없음';
  }
}

function formatEntryFee(fee: number): string {
  if (fee === 0) return '무료';
  return `${fee.toLocaleString('ko-KR')}원`;
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
  venue: string | null;
  paymentSummary: string | null;
  rosterCount: number;
  minPlayers: number;
  isRosterLocked: boolean;
  belowMinimum: boolean;
}) {
  if (status !== 'confirmed' && status !== 'waitlisted' && status !== 'paid') return null;

  const accent = getSportAccent(sportCode);
  const statusCfg = registrationStatusConfig(status);
  const topAccent =
    status === 'waitlisted' ? 'var(--orange500)' : status === 'paid' ? 'var(--blue500)' : 'var(--green500)';
  const dateStr = formatMonthDay(scheduledAt);
  /* Roster next-step applies to active registrations; waitlisted shows a status note instead. */
  const showRosterFooter = status === 'confirmed' || status === 'paid';

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderTop: `3px solid ${topAccent}`,
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 16,
      }}
    >
      {/* Header: sport chip + status pill, title, team */}
      <div style={{ padding: '16px 18px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
          <span
            className="tm-text-micro"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: accent.badgeBg, color: accent.badgeText,
              fontWeight: 600, padding: '3px 9px', borderRadius: 999, flexShrink: 0,
            }}
          >
            <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: '50%', background: accent.dot }} />
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
          padding: '13px 18px',
          display: 'flex', flexDirection: 'column', gap: 9,
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
            padding: '13px 18px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div className="tm-text-caption" style={{ color: 'var(--text-muted)', fontWeight: 600 }}>선수 명단</div>
            <div className="tm-text-micro" style={{ color: 'var(--text-body)', marginTop: 1 }}>
              {isRosterLocked
                ? `${rosterCount}명 · 마감`
                : belowMinimum
                  ? `${rosterCount}명 / 최소 ${minPlayers}명 등록`
                  : `${rosterCount}명 등록 완료`}
            </div>
          </div>
          {!isRosterLocked ? (
            <Link
              href={`/tournaments/${tournamentId}/registrations/${registrationId}/roster`}
              className="tm-text-label"
              aria-label={belowMinimum ? '선수 명단 등록하기' : '선수 명단 수정하기'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 1,
                color: 'var(--blue500)', fontWeight: 700, flexShrink: 0,
                minHeight: 44, paddingLeft: 8,
              }}
            >
              {belowMinimum ? '선수 등록' : '선수 수정'}
              <ChevronRightIcon size={16} />
            </Link>
          ) : null}
        </div>
      ) : (
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 18px' }}>
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
            앞 순위 팀이 취소하면 자동으로 확정 알림을 드려요.
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Cancel confirmation modal ── */

function CancelModal({
  onConfirm,
  onClose,
  isSubmitting,
  error,
}: {
  onConfirm: (reason: string) => void;
  onClose: () => void;
  isSubmitting: boolean;
  error: string | null;
}) {
  const [reason, setReason] = useState('');

  return (
    <>
      {/* Scrim — v1 pattern */}
      <div
        aria-hidden="true"
        className="tm-filter-scrim"
        onClick={onClose}
      />
      {/* Sheet layer */}
      <div className="tm-filter-layer">
        <section
          className="tm-filter-sheet"
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

          <label htmlFor="cancel-reason" className="tm-text-caption" style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
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
            <div style={{ marginTop: 10 }}>
              <AlertBanner message={error} />
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button
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

/* ── Registration detail view ── */

function RegistrationDetailView({
  tournamentId,
  tournament,
  registration,
}: {
  tournamentId: string;
  tournament: {
    sportCode: string;
    title: string;
    entryFee: number;
    minPlayers: number;
    maxPlayers: number;
    scheduledAt: string | null;
    venue: string | null;
  };
  registration: V1TournamentRegistration;
}) {
  const { data: rosterData } = useV1TournamentPlayers(tournamentId, registration.id);
  const cancelRequest = useV1CancelRegistrationRequest(tournamentId, registration.id);
  const { data: teamData } = useV1Team(registration.teamId);

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const statusConfig = registrationStatusConfig(registration.status);
  const players = rosterData?.players ?? [];
  const belowMinimum = rosterData?.belowMinimum ?? false;
  const isRosterLocked = Boolean(registration.rosterLockedAt);
  const canCancelRequest =
    registration.status === 'awaiting_payment' ||
    registration.status === 'payment_checking' ||
    registration.status === 'paid' ||
    registration.status === 'confirmed' ||
    registration.status === 'waitlisted';

  /* #8: prominent nudge triggers when confirmed/paid AND roster is below minimum */
  const showRosterNudge =
    (registration.status === 'confirmed' || registration.status === 'paid') &&
    belowMinimum &&
    !isRosterLocked;

  /* Compact payment summary for the pass facts (full breakdown lives in the 신청 내역 card). */
  const paymentSummary = registration.payment
    ? `${formatEntryFee(registration.payment.amount)} · ${paymentStatusLabel(registration.payment.status)}`
    : formatEntryFee(tournament.entryFee);

  /* The pass owns the roster glance+action for active states; the standalone roster
   * card only renders for states without a pass (e.g. awaiting_payment). */
  const passShowsRoster =
    registration.status === 'confirmed' || registration.status === 'paid';

  async function handleCancelConfirm(reason: string) {
    setCancelError(null);
    try {
      await cancelRequest.mutateAsync({ reason: reason || undefined });
      setShowCancelModal(false);
    } catch (err) {
      setCancelError(extractErrorMessage(err, '취소 요청 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.'));
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
        {registration.confirmedAt ? (
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
            확정일 {formatDateShort(registration.confirmedAt)}
          </div>
        ) : null}
      </div>

      {/* Roster status summary */}
      <div
        style={{
          borderTop: '1px solid var(--border)',
          paddingTop: 14,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>선수 명단</span>
          {belowMinimum && !isRosterLocked ? (
            <span className={`tm-badge ${rosterShortagebadge(registration.status).badgeClass}`}>
              {rosterShortagebadge(registration.status).label}
            </span>
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
          href={`/tournaments/${tournamentId}/registrations/${registration.id}/roster`}
          className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
          aria-label="선수 명단 등록하기"
          style={{ marginBottom: 8 }}
        >
          선수 등록하기
        </Link>
      ) : !isRosterLocked ? (
        <Link
          href={`/tournaments/${tournamentId}/registrations/${registration.id}/roster`}
          className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
          aria-label="선수 명단 수정하기"
          style={{ marginBottom: 8 }}
        >
          선수 수정
        </Link>
      ) : null}

      {/* Secondary CTAs */}
      <Link
        href={`/tournaments/${tournamentId}`}
        className="tm-btn tm-btn-lg tm-btn-neutral tm-btn-block"
        style={{ marginBottom: 8 }}
      >
        대회 상세 보기
      </Link>

      {registration.status === 'cancelled' || registration.status === 'draft' ? (
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
          onClick={() => { setCancelError(null); setShowCancelModal(true); }}
          style={{ marginTop: 4 }}
        >
          참가 취소 신청
        </button>
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
              venue={tournament.venue}
              paymentSummary={paymentSummary}
              rosterCount={players.length}
              minPlayers={tournament.minPlayers}
              isRosterLocked={isRosterLocked}
              belowMinimum={belowMinimum}
            />

            {/* Registration record — 신청 + 결제 consolidated into one "신청 내역" card */}
            <section aria-labelledby="reg-detail-heading">
              <div style={{ marginLeft: -20, marginRight: -20 }}>
                <SectionTitle title="신청 내역" />
              </div>
              <Card pad={16} style={{ marginTop: 8 }}>
                {/* 신청 group */}
                <div id="reg-detail-heading" style={{ display: 'flex', flexDirection: 'column' }}>
                  <InfoRow
                    label="신청일"
                    value={formatDateShort(registration.createdAt)}
                    isLast={!registration.confirmedAt && !registration.cancelRequestedAt}
                  />
                  {registration.confirmedAt ? (
                    <InfoRow
                      label="확정일"
                      value={formatDateShort(registration.confirmedAt)}
                      isLast={!registration.cancelRequestedAt}
                    />
                  ) : null}
                  {registration.cancelRequestedAt ? (
                    <InfoRow label="취소 요청일" value={formatDateShort(registration.cancelRequestedAt)} isLast />
                  ) : null}
                </div>

                {/* 결제 group */}
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12 }}>
                  <div className="tm-text-micro" style={{ color: 'var(--text-caption)', fontWeight: 600, marginBottom: 6 }}>
                    결제
                  </div>
                  {registration.payment ? (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <InfoRow label="결제 수단" value={paymentMethodLabel(registration.payment.method)} />
                      <InfoRow label="결제 금액" value={formatEntryFee(registration.payment.amount)} />
                      <InfoRow
                        label="결제 상태"
                        value={paymentStatusLabel(registration.payment.status)}
                        isLast={!registration.payment.paidAt}
                      />
                      {registration.payment.paidAt ? (
                        <InfoRow label="결제일" value={formatDateShort(registration.payment.paidAt)} isLast />
                      ) : null}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <InfoRow
                        label="참가비"
                        value={formatEntryFee(tournament.entryFee)}
                        isLast={!registration.depositorName}
                      />
                      {registration.depositorName ? (
                        <InfoRow label="입금자명" value={registration.depositorName} isLast />
                      ) : null}
                      <div className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.6, paddingTop: 4 }}>
                        {registration.status === 'awaiting_payment'
                          ? '입금 완료 후 자동으로 상태가 변경돼요.'
                          : '아직 결제 정보가 없어요.'}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </section>

            {/* Roster — only for states without a pass (the pass footer owns roster for confirmed/paid) */}
            {!passShowsRoster ? (
            <section aria-labelledby="roster-heading" style={{ marginTop: 16 }}>
              <div style={{ marginLeft: -20, marginRight: -20 }}>
                <SectionTitle id="roster-heading" title="선수 명단" />
              </div>
              <Card pad={16} style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div className="tm-text-label" style={{ color: 'var(--text-strong)', fontWeight: 600 }}>
                      {players.length}명 등록됨
                    </div>
                    <div className="tm-text-micro" style={{ color: 'var(--text-caption)', marginTop: 2 }}>
                      {`최소 ${tournament.minPlayers}명 · 최대 ${tournament.maxPlayers}명`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {belowMinimum && !isRosterLocked ? (
                      /* P0: status-aware badge — shared helper keeps rail and body in sync */
                      <span className={`tm-badge ${rosterShortagebadge(registration.status).badgeClass}`}>
                        {rosterShortagebadge(registration.status).label}
                      </span>
                    ) : null}
                    {isRosterLocked ? (
                      <span className="tm-badge tm-badge-grey">마감</span>
                    ) : null}
                    {!isRosterLocked ? (
                      <Link
                        href={`/tournaments/${tournamentId}/registrations/${registration.id}/roster`}
                        className="tm-btn tm-btn-md tm-btn-neutral"
                        aria-label="선수 명단 수정하기"
                        style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                      >
                        선수 수정
                      </Link>
                    ) : null}
                  </div>
                </div>
                {belowMinimum && !isRosterLocked ? (
                  /* P0: copy branches on whether confirmation is still blocked */
                  registration.status === 'confirmed' || registration.status === 'paid' ? (
                    <p className="tm-text-caption" style={{ marginTop: 10, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      대회 전까지 선수를 더 등록할 수 있어요.
                    </p>
                  ) : (
                    <p className="tm-text-caption" style={{ marginTop: 10, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      최소 인원을 채워야 참가 확정이 가능해요.
                    </p>
                  )
                ) : null}
              </Card>
            </section>
            ) : null}

            {/* Mobile-only: Cancel / Reapply actions (hidden on desktop — rail handles them) */}
            <div className="tm-hide-desktop" style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {registration.status === 'cancelled' || registration.status === 'draft' ? (
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
                  onClick={() => { setCancelError(null); setShowCancelModal(true); }}
                >
                  참가 취소 신청
                </button>
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
      {showCancelModal ? (
        <CancelModal
          onConfirm={handleCancelConfirm}
          onClose={() => { setShowCancelModal(false); setCancelError(null); }}
          isSubmitting={cancelRequest.isPending}
          error={cancelError}
        />
      ) : null}
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

/* ── Main client ── */

export function MyRegistrationPageClient({ tournamentId }: { tournamentId: string }) {
  const { data: tournament, isLoading: loadingTournament } = useV1Tournament(tournamentId);
  const {
    data: registration,
    isLoading: loadingReg,
    isError: regError,
    error: regErr,
  } = useV1MyRegistration(tournamentId);

  const isLoading = loadingTournament || loadingReg;

  if (isLoading) {
    return (
      <AppChrome title="내 신청" backHref={`/tournaments/${tournamentId}`} bottomNav={false} activeTab="tournaments">
        <div aria-busy="true" aria-label="신청 정보 불러오는 중" style={{ padding: '0 20px', marginTop: 24 }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              aria-hidden="true"
              style={{ height: 80, borderRadius: 12, background: 'var(--grey100)', marginBottom: 10 }}
            />
          ))}
        </div>
      </AppChrome>
    );
  }

  // 404 from useV1MyRegistration means no registration for this user yet
  if (regError) {
    const err = regErr as { statusCode?: number } | undefined;
    if (err?.statusCode === 404) {
      return (
        <AppChrome title="내 신청" backHref={`/tournaments/${tournamentId}`} bottomNav={false} activeTab="tournaments">
          <NoRegistrationState tournamentId={tournamentId} />
        </AppChrome>
      );
    }
    const msg = extractErrorMessage(regErr, '신청 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    return (
      <AppChrome title="내 신청" backHref={`/tournaments/${tournamentId}`} bottomNav={false} activeTab="tournaments">
        <div style={{ padding: '0 20px', marginTop: 24 }}>
          <AlertBanner message={msg} />
          <Link
            href={`/tournaments/${tournamentId}`}
            className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block"
            style={{ marginTop: 14 }}
          >
            대회 상세로 돌아가기
          </Link>
        </div>
      </AppChrome>
    );
  }

  if (!registration || !tournament) {
    return (
      <AppChrome title="내 신청" backHref={`/tournaments/${tournamentId}`} bottomNav={false} activeTab="tournaments">
        <NoRegistrationState tournamentId={tournamentId} />
      </AppChrome>
    );
  }

  return (
    <AppChrome title="내 신청" backHref={`/tournaments/${tournamentId}`} bottomNav={false} activeTab="tournaments">
      <RegistrationDetailView
        tournamentId={tournamentId}
        tournament={{
          sportCode: tournament.sport.code,
          title: tournament.title,
          entryFee: tournament.entryFee,
          minPlayers: tournament.minPlayers,
          maxPlayers: tournament.maxPlayers,
          scheduledAt: tournament.scheduledAt,
          venue: tournament.venue,
        }}
        registration={registration}
      />
    </AppChrome>
  );
}
