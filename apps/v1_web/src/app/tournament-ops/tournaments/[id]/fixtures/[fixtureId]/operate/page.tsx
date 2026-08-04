import { OperateConsole } from './operate-console';

interface Props {
  params: Promise<{ id: string; fixtureId: string }>;
}

export default async function TournamentFixtureOperatePage({ params }: Props) {
  const { id, fixtureId } = await params;
  return <OperateConsole tournamentId={id} fixtureId={fixtureId} />;
}
