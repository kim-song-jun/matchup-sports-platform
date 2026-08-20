import { OperationsBoardClient } from '@/components/tournament-live/operations-board-client';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminTournamentOperationsBoardPage({ params }: Props) {
  const { id } = await params;
  return <OperationsBoardClient tournamentId={id} />;
}
