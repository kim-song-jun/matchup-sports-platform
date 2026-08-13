import { MyStaffFixturesPageClient } from '@/components/my/my-staff-fixtures-client';

export default async function MyStaffFixturesPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;
  return <MyStaffFixturesPageClient tournamentId={tournamentId} />;
}
