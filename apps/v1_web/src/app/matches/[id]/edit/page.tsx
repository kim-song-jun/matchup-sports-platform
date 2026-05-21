import { MatchEditPageClient } from '@/components/matches/matches-create-client';

export default function MatchEditPage({ params }: { params: { id: string } }) {
  return <MatchEditPageClient matchId={params.id} />;
}
