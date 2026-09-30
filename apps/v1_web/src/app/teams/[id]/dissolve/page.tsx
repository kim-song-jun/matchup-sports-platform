import { Suspense } from 'react';
import { TeamDissolutionPageClient } from '@/components/teams/team-dissolution-client';

export default async function TeamDissolvePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <TeamDissolutionPageClient teamId={id} />
    </Suspense>
  );
}
