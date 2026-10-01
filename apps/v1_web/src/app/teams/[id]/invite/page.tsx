import { TeamInviteGatherPageClient } from '@/components/teams/team-invite-gather-client';

export default async function TeamInvitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TeamInviteGatherPageClient teamId={id} />;
}
