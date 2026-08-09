import { TeamMatchResultApprovalPageClient } from '@/components/team-matches/team-match-result-client';

export default async function TeamMatchResultApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TeamMatchResultApprovalPageClient teamMatchId={id} />;
}
