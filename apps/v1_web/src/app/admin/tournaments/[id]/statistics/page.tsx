'use client';

import { TournamentStatisticsTab } from '../tournament-statistics-tab';
import { useTournamentAdmin } from '../tournament-admin-context';

export default function AdminTournamentStatisticsPage() {
  const { tournamentId } = useTournamentAdmin();
  return <TournamentStatisticsTab tournamentId={tournamentId} />;
}
