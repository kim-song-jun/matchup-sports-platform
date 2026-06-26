import { Suspense } from 'react';
import { TeamEditPageClient } from '@/components/teams/teams-form-client';

export default async function TeamEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <TeamEditPageClient teamId={id} />
    </Suspense>
  );
}
