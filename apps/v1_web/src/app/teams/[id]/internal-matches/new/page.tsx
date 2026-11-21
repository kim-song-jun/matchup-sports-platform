import { TeamInternalMatchFormPageClient } from '@/components/team-internal-matches/team-internal-match-form';

export default async function TeamInternalMatchCreatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TeamInternalMatchFormPageClient teamId={id} />;
}
