import { MyTeamContactDetailClient } from '@/components/my/my-team-contacts-client';

type PageProps = {
  params: Promise<{ contactId: string }>;
};

export default async function MyTeamContactDetailPage({ params }: PageProps) {
  const { contactId } = await params;
  return <MyTeamContactDetailClient contactId={contactId} />;
}
