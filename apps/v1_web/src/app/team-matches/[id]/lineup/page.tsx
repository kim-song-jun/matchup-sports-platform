import { RequireAuth } from '@/components/auth/require-auth';
import { TeamMatchLineupPageClient } from './lineup-client';

// Next 16: params는 async — 형제 page.tsx(edit/detail)와 동일하게 await 해야 id가 채워진다.
export default async function TeamMatchLineupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RequireAuth>
      <TeamMatchLineupPageClient teamMatchId={id} />
    </RequireAuth>
  );
}
