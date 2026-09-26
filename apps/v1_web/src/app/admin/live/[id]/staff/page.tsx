import { StaffClient } from '@/components/tournament-live/staff-client';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminTournamentStaffPage({ params }: Props) {
  const { id } = await params;
  return <StaffClient tournamentId={id} />;
}
