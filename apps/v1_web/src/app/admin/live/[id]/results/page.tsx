import { ResultsPageClient } from '@/components/tournament-live/results-page-client';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminTournamentResultsPage({ params }: Props) {
  const { id } = await params;
  return <ResultsPageClient tournamentId={id} />;
}
