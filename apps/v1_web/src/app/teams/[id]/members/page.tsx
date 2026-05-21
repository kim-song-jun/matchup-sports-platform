import { TeamMembersPageClient } from '@/components/teams/teams-client';

export default async function TeamMembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TeamMembersPageClient teamId={id} />;
}
