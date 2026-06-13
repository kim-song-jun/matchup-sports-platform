import { RequireAuth } from '@/components/auth/require-auth';
import { TournamentRosterPageClient } from './tournament-roster-client';

export default async function TournamentRosterPage({
  params,
}: {
  params: Promise<{ id: string; registrationId: string }>;
}) {
  const { id, registrationId } = await params;
  return (
    <RequireAuth>
      <TournamentRosterPageClient tournamentId={id} registrationId={registrationId} />
    </RequireAuth>
  );
}
