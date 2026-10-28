'use client';

import { useV1FixtureLineup, useV1Game } from '@/hooks/use-v1-game-operations';
import { useTournamentOpsRole } from '@/components/tournament-ops/role-context';
import { OperateConsoleCore } from '@/shared/game-operations';
import { AbnormalEndDialog } from '@/shared/game-operations';
import { KickoffChecklist } from './kickoff-checklist';
import { ConsoleNextSteps } from './console-next-steps';
import { PenaltyShootoutPanel } from './penalty-shootout-panel';
import { GameResultReviewPanel } from '@/components/tournament-result-review/game-result-review-panel';

export interface OperateConsoleProps {
  readonly tournamentId: string;
  readonly fixtureId: string;
}

export function OperateConsole({ tournamentId, fixtureId }: OperateConsoleProps) {
  const tournamentOpsRole = useTournamentOpsRole();
  const fixtureLineup = useV1FixtureLineup(tournamentId, fixtureId);
  const gameId = fixtureLineup.data?.gameId ?? null;
  const gameDetail = useV1Game(gameId);

  return (
    <OperateConsoleCore
      gameId={gameId}
      gameDetail={gameDetail}
      lineupsQuery={{
        data: fixtureLineup.data?.lineups,
        isLoading: fixtureLineup.isLoading,
        isError: fixtureLineup.isError,
        error: fixtureLineup.error,
        refetch: () => fixtureLineup.refetch(),
      }}
      leaseRequired
      takeoverEnabled={tournamentOpsRole !== 'SUPPORT_READONLY'}
      operatorScopeKey={tournamentOpsRole}
      operationContextKey={JSON.stringify([tournamentId, fixtureId])}
      headerTopClass={tournamentOpsRole === 'FIELD_OPERATOR' ? 'top-[52px]' : 'top-[52px] lg:top-0'}
      requiresLineupBeforeStart={gameDetail.data?.sourceType === 'TEAM_MATCH'}
      allowPenaltyShootout={gameDetail.data?.isKnockoutFixture === true}
      resultReviewEnabled={Boolean(tournamentId && fixtureId)}
      renderResultReview={(resultGameId) => (
        <GameResultReviewPanel
          key={resultGameId}
          variant="console"
          gameId={resultGameId}
          tournamentId={tournamentId}
          confirmedFooter={<ConsoleNextSteps tournamentId={tournamentId} fixtureId={fixtureId} />}
        />
      )}
      renderAbnormalEndDialog={(props) => <AbnormalEndDialog {...props} />}
      renderKickoffChecklist={(props) => <KickoffChecklist {...props} />}
      renderPenaltyShootoutPanel={(props) => <PenaltyShootoutPanel {...props} />}
    />
  );
}


export { COMMAND_RESPONSE_TIMEOUT_MS, teammatesForSide } from '@/shared/game-operations';
