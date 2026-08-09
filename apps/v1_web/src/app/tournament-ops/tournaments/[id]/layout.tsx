import type { ReactNode } from 'react';
import { TournamentOpsGate } from './_gate';

interface Props {
  children: ReactNode;
  params: Promise<{ id: string }>;
}

export default async function TournamentOpsTournamentLayout({ children, params }: Props) {
  const { id } = await params;
  return <TournamentOpsGate tournamentId={id}>{children}</TournamentOpsGate>;
}
