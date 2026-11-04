import { redirect } from 'next/navigation';

export default async function DirectorTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/tournament-management/tournaments/${encodeURIComponent(id)}/overview`);
}
