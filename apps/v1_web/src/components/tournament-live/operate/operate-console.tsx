'use client';

import { useV1FixtureLineup, useV1Game, postV1GameCommand } from '@/hooks/use-v1-game-operations';
import { useV1AuthMe, useV1GameResultRevisions } from '@/hooks/use-v1-api';
import { useV1GameOperationsConsole, gameOperationsErrorMessage, isRetryableGameOperationsErrorCode } from '@/hooks/use-v1-game-operations-console';
import { useQueryClient } from '@tanstack/react-query';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
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
  const authMe = useV1AuthMe();
  const queryClient = useQueryClient();
  const { confirm, ConfirmModal } = useConfirm();
  const operations = useV1GameOperationsConsole({
    gameId,
    initialLastSequence: gameDetail.data?.lastSequence ?? 0,
    takeoverEnabled: tournamentOpsRole !== 'SUPPORT_READONLY',
    gameDetailGameId: gameDetail.data?.id ?? null,
    gameDetailStatus: gameDetail.status,
    realtimeAuthorization: gameDetail.data?.realtimeAuthorization ?? null,
    operationMode: 'tournament-leased',
    gameSourceType: gameDetail.data?.sourceType ?? null,
    gameActorRole: gameDetail.data?.actorRole ?? null,
  });
  const resultRevisions = useV1GameResultRevisions(gameId, { enabled: (operations.gameSnapshot?.state ?? gameDetail.data?.state) === 'ENDED' });

  return (
    <OperateConsoleCore
      gameId={gameId}
      runtime={{
        authUserId: authMe.data?.user.id,
        resultRevisions: resultRevisions.data,
        queryClient,
        confirm,
        confirmModal: ConfirmModal,
        postGameCommand: postV1GameCommand,
        gameOperationsErrorMessage,
        isRetryableGameOperationsErrorCode,
        operations,
      }}
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
