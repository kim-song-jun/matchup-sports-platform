import type { V1AdminTournamentRegistration } from '@/types/api';
import { formatDate } from './tournament-admin-shared';
import { formatRegistrationPaymentSubtitle } from './tournament-detail-shared';

export type RegistrationMetaPart = 'roster' | 'autoConfirmed' | 'depositor' | 'applied' | 'cancelRequested' | 'payment';

/** 행 아래 한 줄 — 호출하는 쪽이 보여 줄 조각만 고른다. 결제 요약은 금액이 있을 때만 붙는다(무료 참가는 말하지 않는다). */
export function registrationMetaText(
  registration: V1AdminTournamentRegistration,
  include: readonly RegistrationMetaPart[],
): string {
  const parts: string[] = [];
  if (include.includes('roster')) {
    parts.push(registration.playerCount > 0 ? `명단 ${registration.playerCount}명` : '명단 미등록');
  }
  // 시즌 시작까지 명단을 안 낸 팀은 잡이 현재 멤버로 명단을 만든다 — 팀이 검토한 적 없는 명단이라 운영 판단이 달라진다.
  if (include.includes('autoConfirmed') && registration.rosterAutoConfirmedAt) {
    parts.push(`자동 확정 ${formatDate(registration.rosterAutoConfirmedAt)}`);
  }
  if (include.includes('depositor') && registration.depositorName) parts.push(`입금자 ${registration.depositorName}`);
  if (include.includes('applied')) parts.push(`신청 ${formatDate(registration.createdAt)}`);
  if (include.includes('cancelRequested') && registration.cancelRequestedAt) {
    parts.push(`취소 요청 ${formatDate(registration.cancelRequestedAt)}`);
  }
  if (include.includes('payment') && registration.payment && registration.payment.amount > 0) {
    const summary = formatRegistrationPaymentSubtitle(registration.payment);
    if (summary) parts.push(summary);
  }
  return parts.join(' · ');
}

/** 팀이 남긴 취소 사유와 운영진 사유 — 둘 다 없으면 그리지 않는다. */
export function CancelReasonLines({ registration }: { registration: V1AdminTournamentRegistration }) {
  if (!registration.cancelReason && !registration.adminCancelReason) return null;
  return (
    <div className="mt-1 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
      {registration.cancelReason ? <p className="m-0 break-words">{`팀 취소 사유: ${registration.cancelReason}`}</p> : null}
      {registration.adminCancelReason ? <p className="m-0 break-words">{`운영진 사유: ${registration.adminCancelReason}`}</p> : null}
    </div>
  );
}
