'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AppChrome } from '@/components/v1-ui/shell';
import { AlertBanner, Card, SectionTitle } from '@/components/v1-ui/primitives';
import {
  useV1Tournament,
  useV1MyRegistration,
  useV1TournamentPlayers,
  useV1CancelRegistrationRequest,
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
      return { badgeClass: 'tm-badge-orange', label: '대기팀' };
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
    default: return status;
  }
}

function formatEntryFee(fee: number): string {
  if (fee === 0) return '무료';
  return `${fee.toLocaleString('ko-KR')}원`;
}

function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
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
              {isSubmitting ? '처리 중…' : '취소 요청'}
            </button>
          </div>
        </section>
      </div>
    </>
  );
}

/* ── Registration detail view ── */

function RegistrationDetailView({
  tournamentId,
  tournament,
  registration,
}: {
  tournamentId: string;
  tournament: { title: string; entryFee: number; minPlayers: number; maxPlayers: number };
  registration: V1TournamentRegistration;
}) {
  const { data: rosterData } = useV1TournamentPlayers(tournamentId, registration.id);
  const cancelRequest = useV1CancelRegistrationRequest(tournamentId, registration.id);

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

  async function handleCancelConfirm(reason: string) {
    setCancelError(null);
    try {
      await cancelRequest.mutateAsync({ reason: reason || undefined });
      setShowCancelModal(false);
    } catch (err) {
      setCancelError(extractErrorMessage(err, '취소 요청 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.'));
    }
  }

  return (
    <>
      <div className="tm-tournament-my-body">
      <div style={{ padding: '0 20px 32px', marginTop: 16 }}>
        {/* Status card */}
        <section aria-labelledby="reg-status-heading">
          <div style={{ marginLeft: -20, marginRight: -20 }}>
            <SectionTitle title="신청 상태" />
          </div>
          <Card pad={16} style={{ marginTop: 8 }}>
            <div id="reg-status-heading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span className="tm-text-label" style={{ color: 'var(--text-strong)', fontWeight: 700 }}>
                {tournament.title}
              </span>
              <span className={`tm-badge ${statusConfig.badgeClass}`}>
                {statusConfig.label}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
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
          </Card>
        </section>

        {/* Payment info */}
        <section aria-labelledby="payment-info-heading" style={{ marginTop: 16 }}>
          <div style={{ marginLeft: -20, marginRight: -20 }}>
            <SectionTitle id="payment-info-heading" title="결제 정보" />
          </div>
          <Card pad={16} style={{ marginTop: 8 }}>
            {registration.payment ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <InfoRow label="결제 수단" value={paymentMethodLabel(registration.payment.method)} />
                <InfoRow label="결제 금액" value={formatEntryFee(registration.payment.amount)} valueColor="var(--blue500)" />
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
                    : '결제 정보가 없어요.'}
                </div>
              </div>
            )}
          </Card>
        </section>

        {/* Roster */}
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
                  <span className="tm-badge tm-badge-red">인원 부족</span>
                ) : null}
                {isRosterLocked ? (
                  <span className="tm-badge tm-badge-grey">잠김</span>
                ) : null}
                {!isRosterLocked ? (
                  <Link
                    href={`/tournaments/${tournamentId}/registrations/${registration.id}/roster`}
                    className="tm-btn tm-btn-md tm-btn-primary"
                    aria-label="선수 명단 수정하기"
                  >
                    명단 수정
                  </Link>
                ) : null}
              </div>
            </div>
            {belowMinimum && !isRosterLocked ? (
              <p className="tm-text-caption" style={{ marginTop: 10, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                최소 인원을 채워야 참가 확정이 가능해요.
              </p>
            ) : null}
          </Card>
        </section>

        {/* Cancel / Reapply actions */}
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {registration.status === 'cancelled' || registration.status === 'draft' ? (
            <Link
              href={`/tournaments/${tournamentId}/apply`}
              className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
            >
              다시 신청하기
            </Link>
          ) : null}

          {canCancelRequest ? (
            <button
              type="button"
              className="tm-btn tm-btn-lg tm-btn-danger tm-btn-block"
              onClick={() => { setCancelError(null); setShowCancelModal(true); }}
            >
              취소 요청
            </button>
          ) : null}
        </div>

        <div style={{ marginTop: 12 }}>
          <Link
            href={`/tournaments/${tournamentId}`}
            className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block"
          >
            대회 상세 보기
          </Link>
        </div>
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
          title: tournament.title,
          entryFee: tournament.entryFee,
          minPlayers: tournament.minPlayers,
          maxPlayers: tournament.maxPlayers,
        }}
        registration={registration}
      />
    </AppChrome>
  );
}
