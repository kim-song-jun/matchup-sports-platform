import { OperateConsole } from '@/components/tournament-live/operate/operate-console';

interface Props {
  params: Promise<{ id: string; fixtureId: string }>;
}

export default async function AdminTournamentFixtureOperatePage({ params }: Props) {
  const { id, fixtureId } = await params;
  return <OperateConsole tournamentId={id} fixtureId={fixtureId} />;
}
