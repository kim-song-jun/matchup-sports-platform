'use client';

import { AwardsTab } from '../awards-tab';
import { useTournamentAdmin } from '../tournament-admin-context';

export default function AdminTournamentAwardsPage() {
  const { tournamentId, showToast } = useTournamentAdmin();
  return <AwardsTab tournamentId={tournamentId} showToast={showToast} />;
}
