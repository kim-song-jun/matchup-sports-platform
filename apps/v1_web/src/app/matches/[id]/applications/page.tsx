import { MatchApplicationsPageClient } from './client';

export default async function MatchApplicationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MatchApplicationsPageClient matchId={id} />;
}
