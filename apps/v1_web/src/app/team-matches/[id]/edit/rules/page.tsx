import { TeamMatchEditPageClient } from '@/components/team-matches/team-matches-create-client';

export default async function TeamMatchEditRulesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TeamMatchEditPageClient teamMatchId={id} rulesStep />;
}
