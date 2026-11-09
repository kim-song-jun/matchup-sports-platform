'use client';

import { useMultiFinals } from '@/hooks/use-multi-finals';
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
  if (tournament.stagePlan) return <AwardsTab tournamentId={tournamentId} canWrite={canWrite} showToast={showToast} allowSplitAwards stagePlan={tournament.stagePlan} finalTracks={tournament.stagePlan.stages.flatMap(s => s.pools.map(p => `stage:${p.key}`))} />;
  if (tournament.format === 'league_knockouts') return <NamedFinalAwards tournamentId={tournamentId} canWrite={canWrite} showToast={showToast} />;
  return <AwardsTab tournamentId={tournamentId} canWrite={canWrite} allowSplitAwards={tournament?.kind === 'regular_tournament'} showToast={showToast} />;
}

function NamedFinalAwards(props: { tournamentId: string; canWrite: boolean; showToast: (message: string, variant?: 'success' | 'error') => void }) {
  const { view } = useMultiFinals(props.tournamentId, true);
  if (view.isPending) return <p role="status" className="p-4">토너먼트 설정을 불러오고 있어요.</p>;
  if (view.isError) return <div role="alert" className="p-4"><p>토너먼트 설정을 불러오지 못했어요.</p><button type="button" className="min-h-11 underline" onClick={() => void view.refetch()}>다시 시도</button></div>;
  return <AwardsTab {...props} allowSplitAwards finalTracks={view.data.finals.map(final => final.name)} />;
}
