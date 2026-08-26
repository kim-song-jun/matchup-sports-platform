import { CorrectionsPageClient } from '@/components/tournament-live/corrections-page-client';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminTournamentRecordsCorrectionsPage({ params }: Props) {
  const { id } = await params;
  return <CorrectionsPageClient tournamentId={id} />;
}
