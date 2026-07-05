import { PublicProfilePageClient } from '@/components/users/public-profile-client';

export default async function PublicUserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PublicProfilePageClient userId={id} />;
}
