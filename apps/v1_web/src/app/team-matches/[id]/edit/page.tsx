import { TeamMatchEditPageClient } from '@/components/team-matches/team-matches-create-client';

export default function TeamMatchEditPage({ params }: { params: { id: string } }) {
  return <TeamMatchEditPageClient teamMatchId={params.id} />;
}
