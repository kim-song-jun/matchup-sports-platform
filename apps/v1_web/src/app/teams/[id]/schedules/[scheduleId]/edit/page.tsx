import { Suspense } from 'react';
import { TeamScheduleFormPageClient } from '@/components/team-schedules/team-schedules-client';

export default async function TeamScheduleEditPage({
  params,
}: {
  params: Promise<{ id: string; scheduleId: string }>;
}) {
  const { id, scheduleId } = await params;
  return (
    <Suspense fallback={null}>
      <TeamScheduleFormPageClient teamId={id} scheduleId={scheduleId} />
    </Suspense>
  );
}
