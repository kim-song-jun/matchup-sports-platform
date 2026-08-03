import { OperationsBoardClient } from './operations-board-client';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TournamentOperationsBoardPage({ params }: Props) {
  const { id } = await params;
  return <OperationsBoardClient tournamentId={id} />;
}
