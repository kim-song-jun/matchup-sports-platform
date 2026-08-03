import { TeamScheduleDetailPageClient } from '@/components/team-schedules/team-schedules-client';

export default async function TeamScheduleDetailPage({
  params,
}: {
  params: Promise<{ id: string; scheduleId: string }>;
}) {
  const { id, scheduleId } = await params;
  return <TeamScheduleDetailPageClient teamId={id} scheduleId={scheduleId} />;
}
