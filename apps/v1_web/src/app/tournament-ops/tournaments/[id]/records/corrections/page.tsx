import { CorrectionsPageClient } from './corrections-page-client';

export default async function TournamentRecordsCorrectionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CorrectionsPageClient tournamentId={id} />;
}
