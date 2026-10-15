import { RequireAuth } from '@/components/auth/require-auth';
import { CompetitionRosterManager } from '@/components/game-roster/competition-roster-manager';

export default async function TournamentRosterPage({
  params,
}: {
  params: Promise<{ id: string; registrationId: string }>;
}) {
  const { id, registrationId } = await params;
  return (
    <RequireAuth>
      <CompetitionRosterManager competitionId={id} registrationId={registrationId} />
    </RequireAuth>
  );
}
