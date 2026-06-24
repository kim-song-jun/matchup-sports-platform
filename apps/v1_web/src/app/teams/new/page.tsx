import { Suspense } from 'react';
import { TeamCreatePageClient } from '@/components/teams/teams-form-client';

export default function TeamCreatePage() {
  return (
    <Suspense fallback={null}>
      <TeamCreatePageClient />
    </Suspense>
  );
}
