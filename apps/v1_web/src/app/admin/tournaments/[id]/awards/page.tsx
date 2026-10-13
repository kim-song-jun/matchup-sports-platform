'use client';

import { AwardsTab } from '../awards-tab';
import { useTournamentAdmin } from '../tournament-admin-context';
import { useV1AdminTournament } from '@/hooks/use-v1-api';
import { AdminTableSkeleton } from '@/components/admin';
import { extractErrorMessage } from '@/lib/error-message';

export default function AdminTournamentAwardsPage() {
  const { tournamentId, canWrite, showToast } = useTournamentAdmin();
  const { data: tournament, isPending, isError, error, refetch } = useV1AdminTournament(tournamentId);
  if (isPending) {
    return <div role="status" aria-busy="true" aria-label="대회 정보를 불러오는 중이에요" className="p-4"><AdminTableSkeleton rows={4} cols={3} /></div>;
  }
  if (isError || !tournament || tournament.kind === undefined) {
    return (
      <div role="alert" className="flex items-center gap-3 rounded-xl border border-[var(--tint-red-border)] bg-[var(--red50)] p-4">
        <p className="flex-1 tm-text-body text-[var(--red700)]">{extractErrorMessage(error, '대회 정보를 불러오지 못했어요.')}</p>
        <button type="button" onClick={() => void refetch()} className="min-h-[44px] rounded px-2 tm-text-label text-[var(--red700)] underline underline-offset-2">다시 시도</button>
      </div>
    );
  }
  return <AwardsTab tournamentId={tournamentId} canWrite={canWrite} allowSplitAwards={tournament?.kind === 'regular_tournament'} showToast={showToast} />;
}
