'use client';

import { TournamentSponsorsTab } from '../tournament-sponsors-tab';
import { useTournamentAdmin } from '../tournament-admin-context';

export default function AdminTournamentSponsorsPage() {
  const { tournamentId, showToast } = useTournamentAdmin();
  return <TournamentSponsorsTab tournamentId={tournamentId} showToast={showToast} />;
}
