import { ResultReviewPageClient } from '@/components/tournament-live/result-review-page-client';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminTournamentResultReviewPage({ params }: Props) {
  const { id } = await params;
  return <ResultReviewPageClient tournamentId={id} />;
}
