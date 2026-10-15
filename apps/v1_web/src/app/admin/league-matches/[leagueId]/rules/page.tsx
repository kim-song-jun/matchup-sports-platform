import LeagueRulesSection from './league-rules-section';

export default async function AdminLeagueRulesPage({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  return <LeagueRulesSection leagueId={leagueId} />;
}
