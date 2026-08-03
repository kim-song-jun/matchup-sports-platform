import { OperateConsole } from './operate-console';

interface Props {
  params: Promise<{ tournamentId: string; fixtureId: string }>;
}

export default async function TournamentFixtureOperatePage({ params }: Props) {
  const { tournamentId, fixtureId } = await params;
  return <OperateConsole tournamentId={tournamentId} fixtureId={fixtureId} />;
}
