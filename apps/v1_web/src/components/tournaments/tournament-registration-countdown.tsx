'use client';

import { Clock3 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { V1TournamentRegistrationAvailability } from '@/types/tournament-campaign';
import styles from './tournament-registration-countdown.module.css';

export function TournamentRegistrationCountdown({
  deadlineAt,
  availability,
}: {
  readonly deadlineAt: string | null;
  readonly availability: V1TournamentRegistrationAvailability;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (availability !== 'available' || !deadlineAt) return null;
  const deadline = new Date(deadlineAt).getTime();
  if (!Number.isFinite(deadline) || deadline <= now) return null;

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
    <div className={styles.countdown} suppressHydrationWarning>
      <Clock3 aria-hidden="true" />
      <span>참가 신청 마감까지</span>
      <strong>{timeLabel}</strong>
    </div>
  );
}
