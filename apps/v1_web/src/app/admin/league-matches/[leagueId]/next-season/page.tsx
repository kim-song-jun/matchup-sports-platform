import { LeagueNextSeasonManage } from './league-next-season-manage';

export default async function Page({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  return <LeagueNextSeasonManage leagueId={leagueId} />;
}
