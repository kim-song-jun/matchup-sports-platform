import { TeamInternalMatchDetailPageClient } from '@/components/team-internal-matches/team-internal-match-detail';

export default async function TeamInternalMatchDetailPage({ params }: { params: Promise<{ id: string; matchId: string }> }) {
  const { id, matchId } = await params;
  return <TeamInternalMatchDetailPageClient teamId={id} matchId={matchId} />;
}
