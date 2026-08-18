import LeagueMatchStandingsClient from './league-match-standings-client';

interface Props {
  params: Promise<{ leagueId: string }>;
}

export default async function LeagueMatchPage({ params }: Props) {
  const { leagueId } = await params;
  return <LeagueMatchStandingsClient leagueId={leagueId} />;
}
