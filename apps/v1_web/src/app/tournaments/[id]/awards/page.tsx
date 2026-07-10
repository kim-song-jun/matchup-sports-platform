import { AwardsPageClient } from './awards-page-client';

export default async function TournamentAwardsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AwardsPageClient tournamentId={id} />;
}
