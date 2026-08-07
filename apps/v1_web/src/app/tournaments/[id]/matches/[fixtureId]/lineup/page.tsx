import { RequireAuth } from '@/components/auth/require-auth';
import { FixtureLineupPageClient } from './lineup-client';

// Next 16: params는 async.
export default async function FixtureLineupPage({
  params,
}: {
  params: Promise<{ id: string; fixtureId: string }>;
}) {
  const { id, fixtureId } = await params;
  return (
    <RequireAuth>
      <FixtureLineupPageClient tournamentId={id} fixtureId={fixtureId} />
    </RequireAuth>
  );
}
