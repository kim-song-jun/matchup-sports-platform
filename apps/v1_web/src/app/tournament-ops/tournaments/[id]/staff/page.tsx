import { StaffClient } from './staff-client';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TournamentOperationsStaffPage({ params }: Props) {
  const { id } = await params;
  return <StaffClient tournamentId={id} />;
}
