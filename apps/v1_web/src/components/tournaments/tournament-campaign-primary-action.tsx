'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useTournamentCampaignRegistration } from './tournament-campaign-registration-state';

type PrimaryAction = {
  readonly label: string;
  readonly href: string;
};

export function TournamentCampaignPrimaryAction({
  action,
  enforceRegistrationDeadline,
}: {
  readonly action: PrimaryAction | null;
  readonly enforceRegistrationDeadline: boolean;
}) {
  const { registrationOpen } = useTournamentCampaignRegistration();

  if (!action) return null;
  if (enforceRegistrationDeadline && !registrationOpen) return null;

  return (
    <Link className="tm-btn tm-btn-primary tm-btn-lg" href={action.href}>
      {action.label}
      <ArrowRight size={18} aria-hidden="true" />
    </Link>
  );
}
