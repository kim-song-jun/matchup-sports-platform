import LeagueMatchFixturesClient from './league-match-fixtures-client';

interface Props {
  params: Promise<{ leagueId: string }>;
}

export default async function AdminLeagueMatchDetailPage({ params }: Props) {
  const { leagueId } = await params;
  return <LeagueMatchFixturesClient leagueId={leagueId} />;
}
