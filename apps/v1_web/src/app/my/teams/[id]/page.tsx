import { MyTeamDetailPageClient } from '@/components/my/my-api-clients';

export default async function MyTeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MyTeamDetailPageClient teamId={id} />;
}
