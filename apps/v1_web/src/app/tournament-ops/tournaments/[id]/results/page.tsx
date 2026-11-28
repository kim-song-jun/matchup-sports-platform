import { ResultsPageClient } from '@/components/tournament-live/results-page-client';

export default async function TournamentResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ResultsPageClient tournamentId={id} />;
}
