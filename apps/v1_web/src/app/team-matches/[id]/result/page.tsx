import { TeamMatchResultPageClient } from '@/components/team-matches/team-match-result-client';

// Next 16: params는 async — detail/edit page.tsx와 동일하게 await 해야 id가 채워진다.
export default async function TeamMatchResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TeamMatchResultPageClient teamMatchId={id} />;
}
