import { MyTeamMembersPageClient } from '@/components/my/my-api-clients';

export default async function MyTeamMembersDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MyTeamMembersPageClient teamId={id} />;
}
