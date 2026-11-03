import { LeagueNextSeasonCreate } from './league-next-season-create';

export default async function Page({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  return <LeagueNextSeasonCreate leagueId={leagueId} />;
}
