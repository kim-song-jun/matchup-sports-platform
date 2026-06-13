import { RequireAuth } from '@/components/auth/require-auth';
import { TournamentApplyPageClient } from './tournament-apply-client';

export default async function TournamentApplyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RequireAuth>
      <TournamentApplyPageClient tournamentId={id} />
    </RequireAuth>
  );
}
