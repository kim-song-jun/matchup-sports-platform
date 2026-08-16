'use client';

import { useV1AdminTournament } from '@/hooks/use-v1-api';
import { RegistrationsTab } from '../tournament-detail-client';
import { useTournamentAdmin } from '../tournament-admin-context';

export default function AdminTournamentRegistrationsPage() {
  const { tournamentId, canWrite, showToast } = useTournamentAdmin();
  const { data: tournament } = useV1AdminTournament(tournamentId);

  return (
    <RegistrationsTab
      tournamentId={tournamentId}
      showToast={showToast}
      tournamentTeamCount={tournament?.teamCount}
      canWrite={canWrite}
    />
  );
}
