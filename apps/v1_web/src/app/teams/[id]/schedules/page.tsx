import { TeamScheduleListPageClient } from '@/components/team-schedules/team-schedules-client';

export default async function TeamSchedulesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TeamScheduleListPageClient teamId={id} />;
}
