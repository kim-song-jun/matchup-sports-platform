import { TournamentReviewsPageClient } from './reviews-page-client';

export default async function TournamentReviewsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TournamentReviewsPageClient tournamentId={id} />;
}
