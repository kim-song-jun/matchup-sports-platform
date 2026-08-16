'use client';

import { AwardsTab } from '../tournament-detail-client';
import { useTournamentAdmin } from '../tournament-admin-context';

export default function AdminTournamentAwardsPage() {
  const { tournamentId, showToast } = useTournamentAdmin();
  return <AwardsTab tournamentId={tournamentId} showToast={showToast} />;
}
