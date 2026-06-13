import { TournamentDetailPageClient } from './tournament-detail-client';

export default async function TournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TournamentDetailPageClient tournamentId={id} />;
}
