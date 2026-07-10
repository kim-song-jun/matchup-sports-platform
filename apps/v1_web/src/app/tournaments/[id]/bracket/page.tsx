import { BracketPageClient } from './bracket-page-client';

export default async function TournamentBracketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BracketPageClient tournamentId={id} />;
}
