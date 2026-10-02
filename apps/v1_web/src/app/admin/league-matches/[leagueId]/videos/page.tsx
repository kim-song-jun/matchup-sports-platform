import LeagueVideosClient from './league-videos-client';

interface Props {
  params: Promise<{ leagueId: string }>;
}

export default async function AdminLeagueVideosPage({ params }: Props) {
  const { leagueId } = await params;
  return <LeagueVideosClient leagueId={leagueId} />;
}
