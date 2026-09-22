import { TeamMatchResultEntry } from '@/components/team-matches/team-match-result-entry';

export default async function TeamMatchResultApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TeamMatchResultEntry teamMatchId={id} approval />;
}
