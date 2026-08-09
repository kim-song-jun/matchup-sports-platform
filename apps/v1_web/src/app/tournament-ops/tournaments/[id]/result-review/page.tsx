import { ResultReviewPageClient } from './result-review-page-client';

export default async function TournamentResultReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ResultReviewPageClient tournamentId={id} />;
}
