import { Suspense } from 'react';
import { TeamScheduleFormPageClient } from '@/components/team-schedules/team-schedules-client';

export default async function TeamScheduleCreatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <TeamScheduleFormPageClient teamId={id} />
    </Suspense>
  );
}
