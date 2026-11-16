'use client';
import { usePublicTournamentPlayerRecords } from '@/components/public-game-records/use-public-game-records';
import { TournamentPlayerRecordsSections } from '@/components/public-game-records/player-records-sections';
import { extractErrorMessage } from '@/lib/error-message';
export function StageScopedRecords({ tournamentId, stageKey, poolKey }: { tournamentId: string; stageKey: string; poolKey?: string }) {
  const query = usePublicTournamentPlayerRecords(tournamentId, { stageKey, poolKey });
  return <TournamentPlayerRecordsSections goals={query.data?.goals} assists={query.data?.assists} hiddenByEligibility={query.data?.hiddenByEligibility ?? false} isLoading={query.isPending} isError={query.isError} errorMessage={extractErrorMessage(query.error, '개인 기록을 불러오지 못했어요.')} onRetry={() => void query.refetch()} />;
}
