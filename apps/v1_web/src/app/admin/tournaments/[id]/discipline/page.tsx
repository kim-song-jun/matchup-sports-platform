'use client';

import { AdminDisciplinePanel } from '@/components/admin/discipline/admin-discipline-panel';
import { useTournamentAdmin } from '../tournament-admin-context';

export default function AdminTournamentDisciplinePage() {
  const { tournamentId } = useTournamentAdmin();
  return <AdminDisciplinePanel competitionId={tournamentId} />;
}
