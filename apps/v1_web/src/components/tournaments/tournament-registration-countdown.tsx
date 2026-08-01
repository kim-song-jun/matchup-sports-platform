'use client';

import { Clock3 } from 'lucide-react';
import { useTournamentCampaignRegistration } from './tournament-campaign-registration-state';
import styles from './tournament-registration-countdown.module.css';

export function TournamentRegistrationCountdown({
  tone = 'overlay',
}: {
  readonly tone?: 'overlay' | 'surface';
}) {
  const { now, registrationDeadlineAt, registrationOpen } = useTournamentCampaignRegistration();
  if (!registrationOpen || !registrationDeadlineAt) return null;
  const deadline = new Date(registrationDeadlineAt).getTime();

  const remainingMinutes = Math.max(1, Math.ceil((deadline - now) / 60_000));
  const days = Math.floor(remainingMinutes / 1_440);
  const hours = Math.floor((remainingMinutes % 1_440) / 60);
  const minutes = remainingMinutes % 60;
  const timeLabel = days > 0
    ? `${days}일 ${hours}시간`
    : hours > 0
      ? `${hours}시간 ${minutes}분`
      : `${minutes}분`;

  return (
    <div className={styles.countdown} data-tone={tone} suppressHydrationWarning>
      <Clock3 aria-hidden="true" />
      <span>참가 신청 마감까지</span>
      <strong>{timeLabel}</strong>
    </div>
  );
}
