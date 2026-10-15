import LeagueMatchFixturesClient from '../league-match-fixtures-client';

interface Props {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ view?: string | string[] }>;
}

export default async function AdminLeagueSchedulePage({ params, searchParams }: Props) {
  const { leagueId } = await params;
  const { view } = await searchParams;
  return <LeagueMatchFixturesClient leagueId={leagueId} initialView={view === 'list' ? 'list' : 'board'} />;
}
