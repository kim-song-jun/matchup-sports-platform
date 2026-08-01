'use client';

import Link from 'next/link';
import type { V1PublicTournamentStatus } from '@/types/api';
import { TournamentCampaignPrimaryAction } from './tournament-campaign-primary-action';
import type { getCampaignActions } from './tournament-campaign-presentation';
import { getCampaignActionHeading } from './tournament-campaign-presentation';
import { useTournamentCampaignRegistration } from './tournament-campaign-registration-state';
import { TournamentRegistrationCountdown } from './tournament-registration-countdown';
import styles from './tournament-campaign-decision.module.css';

type TournamentCampaignDecisionProps = {
  readonly actions: ReturnType<typeof getCampaignActions>;
  readonly status: V1PublicTournamentStatus;
  readonly statusBadgeClass: string;
  readonly statusLabel: string;
};

export function TournamentCampaignDecision({
  actions,
  status,
  statusBadgeClass,
  statusLabel,
}: TournamentCampaignDecisionProps) {
  const { effectiveAvailability, registrationOpen } = useTournamentCampaignRegistration();
  const actionHeading = getCampaignActionHeading(status, effectiveAvailability);
  const decisionBadge = getDecisionBadge({
    status,
    availability: effectiveAvailability,
    statusLabel,
    statusBadgeClass,
  });
  const decisionDescription = status === 'open' && registrationOpen
    ? '신청 가능한 상태와 마감 시간을 확인한 뒤 참가팀 정보를 제출해 주세요.'
    : actions.primary
      ? '대회의 현재 단계에서 확인할 수 있는 다음 화면으로 바로 이어집니다.'
      : '현재 신청 상태와 대회 상세 안내를 먼저 확인해 주세요.';

  return (
    <section className={styles.decision} aria-labelledby="campaign-decision-title">
      <div className={styles.decisionCopy}>
        <div className={styles.decisionEyebrow}>
          <span className={`tm-badge ${decisionBadge.className}`}>{decisionBadge.label}</span>
          <span>참가 신청 안내</span>
        </div>
        <h2 id="campaign-decision-title" className={styles.decisionTitle}>
          {actionHeading}
        </h2>
        <p>{decisionDescription}</p>
      </div>
      <div className={styles.decisionConversion}>
        <TournamentRegistrationCountdown tone="surface" />
        <div className={styles.decisionActions}>
          <TournamentCampaignPrimaryAction
            action={actions.primary}
            enforceRegistrationDeadline={status === 'open'}
          />
          <Link className="tm-btn tm-btn-neutral tm-btn-lg" href={actions.secondary.href}>
            {actions.secondary.label}
          </Link>
        </div>
      </div>
    </section>
  );
}

function getDecisionBadge({
  status,
  availability,
  statusLabel,
  statusBadgeClass,
}: {
  readonly status: V1PublicTournamentStatus;
  readonly availability: Parameters<typeof getCampaignActionHeading>[1];
  readonly statusLabel: string;
  readonly statusBadgeClass: string;
}): { readonly label: string; readonly className: string } {
  if (status !== 'open' || availability === 'available') {
    return { label: statusLabel, className: statusBadgeClass };
  }
  switch (availability) {
    case 'deadline_passed': return { label: '접수 종료', className: 'tm-badge-grey' };
    case 'full': return { label: '모집 마감', className: 'tm-badge-grey' };
    case 'started': return { label: '대회 시작', className: 'tm-badge-green' };
    case 'closed': return { label: '접수 중단', className: 'tm-badge-grey' };
  }
}
