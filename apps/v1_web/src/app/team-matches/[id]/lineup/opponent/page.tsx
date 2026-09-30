import { RequireAuth } from '@/components/auth/require-auth';
import { TeamMatchOpponentLineupPageClient } from './opponent-lineup-client';

export default async function TeamMatchOpponentLineupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RequireAuth>
      <TeamMatchOpponentLineupPageClient teamMatchId={id} />
    </RequireAuth>
  );
}
