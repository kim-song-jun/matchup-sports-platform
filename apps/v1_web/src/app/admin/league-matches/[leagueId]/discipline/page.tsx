import { AdminDisciplinePanel } from '@/components/admin/discipline/admin-discipline-panel';

export default async function AdminLeagueDisciplinePage({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  return <AdminDisciplinePanel competitionId={leagueId} />;
}
