import LeagueSettingsClient from './league-settings-client';
export default async function EditLeaguePage({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  return <LeagueSettingsClient key={leagueId} leagueId={leagueId} />;
}
