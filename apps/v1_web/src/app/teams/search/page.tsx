import { TeamSearchPageClient } from '@/components/teams/teams-client';

export default async function TeamSearchPage({ searchParams }: { searchParams: Promise<{ query?: string; q?: string }> }) {
  const params = await searchParams;
  return <TeamSearchPageClient queryText={params.query ?? params.q ?? ''} />;
}
