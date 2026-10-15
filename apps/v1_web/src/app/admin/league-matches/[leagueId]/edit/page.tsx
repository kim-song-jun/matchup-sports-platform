import LeagueSettingsClient from './league-settings-client';
import { LeagueInfoExtras } from './league-info-extras';

export default async function EditLeaguePage({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  return (
    <>
      <LeagueSettingsClient key={leagueId} leagueId={leagueId} />
      <LeagueInfoExtras leagueId={leagueId} />
    </>
  );
}
