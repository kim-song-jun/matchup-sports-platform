'use client';

import { TournamentPopupTab } from '../tournament-popup-tab';
import { useTournamentAdmin } from '../tournament-admin-context';

export default function AdminTournamentPopupsPage() {
  const { tournamentId, canWrite, showToast } = useTournamentAdmin();
  return <TournamentPopupTab tournamentId={tournamentId} canWrite={canWrite} showToast={showToast} />;
}
