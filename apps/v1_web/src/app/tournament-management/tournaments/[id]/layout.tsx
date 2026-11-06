import type { ReactNode } from 'react';
import { TournamentDirectorManagement } from '@/components/tournaments/tournament-director-management';

export default async function DirectorTournamentLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TournamentDirectorManagement id={id}>{children}</TournamentDirectorManagement>;
}
