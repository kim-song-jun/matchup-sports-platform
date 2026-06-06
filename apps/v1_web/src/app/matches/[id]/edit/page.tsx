import { MatchEditPageClient } from '@/components/matches/matches-create-client';

export default async function MatchEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MatchEditPageClient matchId={id} />;
}
