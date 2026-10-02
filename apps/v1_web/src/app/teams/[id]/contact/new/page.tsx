import { TeamContactNewPageClient } from '@/components/teams/team-contact-new-client';

export default async function TeamContactNewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TeamContactNewPageClient teamId={id} />;
}
