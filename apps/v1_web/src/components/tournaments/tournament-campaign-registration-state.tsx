'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { V1TournamentRegistrationAvailability } from '@/types/tournament-campaign';

type CampaignRegistrationState = {
  readonly effectiveAvailability: V1TournamentRegistrationAvailability;
  readonly now: number;
  readonly registrationOpen: boolean;
  readonly registrationDeadlineAt: string | null;
};

const CampaignRegistrationContext = createContext<CampaignRegistrationState | null>(null);

export function TournamentCampaignRegistrationProvider({
  availability,
  deadlineAt,
  children,
}: {
  readonly availability: V1TournamentRegistrationAvailability;
  readonly deadlineAt: string | null;
  readonly children: ReactNode;
}) {
  const [now, setNow] = useState(() => Date.now());
  const deadline = deadlineAt ? new Date(deadlineAt).getTime() : null;
  const hasFiniteDeadline = deadline !== null && Number.isFinite(deadline);

  useEffect(() => {
    if (availability !== 'available' || !hasFiniteDeadline || deadline <= now) return;
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [availability, deadline, hasFiniteDeadline, now]);

  const registrationOpen = availability === 'available'
    && (deadline === null || (hasFiniteDeadline && deadline > now));
  const effectiveAvailability = availability === 'available' && !registrationOpen
    ? 'deadline_passed'
    : availability;
  const value = useMemo<CampaignRegistrationState>(() => ({
    effectiveAvailability,
    now,
    registrationOpen,
    registrationDeadlineAt: deadlineAt,
  }), [deadlineAt, effectiveAvailability, now, registrationOpen]);

  return (
    <CampaignRegistrationContext.Provider value={value}>
      {children}
    </CampaignRegistrationContext.Provider>
  );
}

export function useTournamentCampaignRegistration(): CampaignRegistrationState {
  const state = useContext(CampaignRegistrationContext);
  if (state === null) throw new MissingCampaignRegistrationProviderError();
  return state;
}

class MissingCampaignRegistrationProviderError extends Error {
  constructor() {
    super('Tournament campaign registration components require their provider.');
    this.name = 'MissingCampaignRegistrationProviderError';
  }
}
