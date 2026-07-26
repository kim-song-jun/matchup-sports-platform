'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';

type PrimaryAction = {
  readonly label: string;
  readonly href: string;
};

export function TournamentCampaignPrimaryAction({
  action,
  registrationDeadlineAt,
  enforceRegistrationDeadline,
}: {
  readonly action: PrimaryAction | null;
  readonly registrationDeadlineAt: string | null;
  readonly enforceRegistrationDeadline: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!action) return null;
  if (
    enforceRegistrationDeadline
    && !isRegistrationDeadlineOpen(registrationDeadlineAt, now)
  ) return null;

  return (
    <Link className="tm-btn tm-btn-primary tm-btn-lg" href={action.href}>
      {action.label}
      <ArrowRight size={18} aria-hidden="true" />
    </Link>
  );
}

export function isRegistrationDeadlineOpen(
  registrationDeadlineAt: string | null,
  now: number,
): boolean {
  if (!registrationDeadlineAt) return true;
  const deadline = new Date(registrationDeadlineAt).getTime();
  return Number.isFinite(deadline) && deadline > now;
}
