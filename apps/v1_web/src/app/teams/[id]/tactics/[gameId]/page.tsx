import { TacticsBoardClient } from './tactics-board-client';

export default async function TeamTacticsBoardPage({
  params,
}: {
  params: Promise<{ id: string; gameId: string }>;
}) {
  const { id, gameId } = await params;
  return <TacticsBoardClient teamId={id} gameId={gameId} />;
}
