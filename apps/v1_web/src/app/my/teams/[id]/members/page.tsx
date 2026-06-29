import { redirect } from 'next/navigation';

export default async function MyTeamMembersDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/teams/${id}/members`);
}
