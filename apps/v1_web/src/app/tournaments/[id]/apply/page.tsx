import { RequireActivityProfile } from '@/components/auth/require-activity-profile';
import { RequireAuth } from '@/components/auth/require-auth';
import { TournamentApplyPageClient } from './tournament-apply-client';

export default async function TournamentApplyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RequireAuth>
      <RequireActivityProfile title="대회에 신청하려면 정보가 필요해요">
        <TournamentApplyPageClient tournamentId={id} />
      </RequireActivityProfile>
    </RequireAuth>
  );
}
