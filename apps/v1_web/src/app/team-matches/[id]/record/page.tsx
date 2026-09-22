import { TeamMatchSharedRecord } from '@/components/team-matches/team-match-shared-record';
import { RequireAuth } from '@/components/auth/require-auth';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RequireAuth><TeamMatchSharedRecord teamMatchId={id} /></RequireAuth>;
}
