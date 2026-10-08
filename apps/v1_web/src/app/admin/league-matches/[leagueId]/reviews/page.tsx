import LeagueReviewsClient from './league-reviews-client';

export default async function AdminLeagueReviewsPage({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  return <LeagueReviewsClient leagueId={leagueId} />;
}
