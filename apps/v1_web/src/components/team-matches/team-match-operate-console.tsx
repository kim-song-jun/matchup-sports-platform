'use client';

import { useMemo } from 'react';
import { useV1Game, useV1GameOperationsLineup, postV1GameCommand } from '@/hooks/use-v1-game-operations';
import { useV1AuthMe, useV1GameResultRevisions } from '@/hooks/use-v1-api';
import { useV1GameOperationsConsole, gameOperationsErrorMessage, isRetryableGameOperationsErrorCode } from '@/hooks/use-v1-game-operations-console';
import { useQueryClient } from '@tanstack/react-query';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { ErrorState } from '@/components/v1-ui/primitives';
import { extractErrorMessage } from '@/lib/error-message';
import { OperateConsoleCore, type GameDetailQueryState } from '@/shared/game-operations';
import type { TeamMatchGameOperationsContext } from '@/types/game-operations';
import { AbnormalEndDialog } from '@/shared/game-operations';

export interface TeamMatchOperateConsoleProps {
  readonly gameId: string;
  readonly teamMatchContext: TeamMatchGameOperationsContext;
  readonly resultHref: string;
}

export function TeamMatchOperateConsole({ gameId, teamMatchContext, resultHref }: TeamMatchOperateConsoleProps) {
  const gameDetail = useV1Game(gameId);

  if (gameDetail.isLoading) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <p role="status" className="tm-text-body">경기 정보를 불러오는 중이에요.</p>
      </main>
    );
  }
  if (gameDetail.isError || !gameDetail.data) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <ErrorState
          title="경기 정보를 불러오지 못했어요"
          message={extractErrorMessage(gameDetail.error, '경기 정보를 불러오지 못했어요. 다시 시도해 주세요.')}
          onRetry={() => void gameDetail.refetch()}
          back={{ href: `/team-matches/${encodeURIComponent(teamMatchContext.teamMatchId)}`, label: '팀매치 상세로' }}
        />
      </main>
    );
  }

  const detail = gameDetail.data;
  if (detail.id !== gameId || detail.sourceType !== 'TEAM_MATCH') {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <ErrorState
          title="팀매치와 경기 정보가 일치하지 않아요"
          message="올바른 팀매치의 경기 정보를 확인할 수 없어요."
          back={{ href: `/team-matches/${encodeURIComponent(teamMatchContext.teamMatchId)}`, label: '팀매치 상세로' }}
        />
      </main>
    );
  }

  if (
    detail.actorRole !== 'team_owner' &&
    detail.actorRole !== 'team_manager'
  ) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <ErrorState
          title="경기 운영 권한이 없어요"
          message="호스트 팀장이나 매니저만 경기를 운영할 수 있어요."
          back={{ href: `/team-matches/${encodeURIComponent(teamMatchContext.teamMatchId)}`, label: '팀매치 상세로' }}
        />
      </main>
    );
  }

  if (detail.realtimeAuthorization.kind !== 'unscoped' || detail.realtimeAuthorization.subjectVersion !== 0) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <ErrorState
          title="경기 운영 권한을 확인할 수 없어요"
          message="잠시 후 다시 시도해 주세요."
          onRetry={() => void gameDetail.refetch()}
          back={{ href: `/team-matches/${encodeURIComponent(teamMatchContext.teamMatchId)}`, label: '팀매치 상세로' }}
        />
      </main>
    );
  }

  if (
    teamMatchContext.gameId !== detail.id ||
    teamMatchContext.status !== 'matched' ||
    !teamMatchContext.isStandalone ||
    !teamMatchContext.viewerCanManageHost
  ) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <ErrorState
          title="이 팀매치의 경기 운영을 열 수 없어요"
          message="상대팀이 확정된 호스트 팀장이나 매니저만 경기를 운영할 수 있어요."
          back={{ href: `/team-matches/${encodeURIComponent(teamMatchContext.teamMatchId)}`, label: '팀매치 상세로' }}
        />
      </main>
    );
  }

  return (
    <TeamMatchOperateConsoleWithGame
      gameId={gameId}
      gameDetail={gameDetail}
      teamMatchContext={teamMatchContext}
      resultHref={resultHref}
    />
  );
}

function TeamMatchOperateConsoleWithGame({
  gameId,
  gameDetail,
  teamMatchContext,
  resultHref,
}: TeamMatchOperateConsoleProps & { gameDetail: GameDetailQueryState }) {
  const lineups = useV1GameOperationsLineup(gameId);
  if (lineups.isLoading) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <p role="status" className="tm-text-body">경기 명단을 불러오는 중이에요.</p>
      </main>
    );
  }
  if (lineups.isError || !lineups.data) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <ErrorState
          title="경기 명단을 불러오지 못했어요"
          message={extractErrorMessage(lineups.error, '경기 명단을 불러오지 못했어요. 다시 시도해 주세요.')}
          onRetry={() => void lineups.refetch()}
          back={{ href: `/team-matches/${encodeURIComponent(teamMatchContext.teamMatchId)}`, label: '팀매치 상세로' }}
        />
      </main>
    );
  }

  return (
    <TeamMatchOperateConsoleRuntime
      gameId={gameId}
      gameDetail={gameDetail}
      lineups={lineups}
      teamMatchContext={teamMatchContext}
      resultHref={resultHref}
    />
  );
}

function TeamMatchOperateConsoleRuntime({
  gameId,
  gameDetail,
  lineups,
  teamMatchContext,
  resultHref,
}: TeamMatchOperateConsoleProps & {
  gameDetail: GameDetailQueryState;
  lineups: ReturnType<typeof useV1GameOperationsLineup>;
}) {
  const authMe = useV1AuthMe();
  const queryClient = useQueryClient();
  const { confirm, ConfirmModal } = useConfirm();
  const operations = useV1GameOperationsConsole({
    gameId,
    initialLastSequence: gameDetail.data?.lastSequence ?? 0,
    takeoverEnabled: true,
    gameDetailGameId: gameDetail.data?.id ?? null,
    gameDetailStatus: gameDetail.status,
    realtimeAuthorization: gameDetail.data?.realtimeAuthorization ?? null,
    operationMode: 'ordinary-host',
    gameSourceType: gameDetail.data?.sourceType ?? null,
    gameActorRole: gameDetail.data?.actorRole ?? null,
    teamMatchContext,
  });
  const resultRevisions = useV1GameResultRevisions(gameId, { enabled: (operations.gameSnapshot?.state ?? gameDetail.data?.state) === 'ENDED' });
  const safeLineups = useMemo(
    () => lineups.data?.map((lineup) => ({
      ...lineup,
      participants: lineup.participants.map((participant) => {
        const { identity, ...safeParticipant } = participant;
        void identity;
        return safeParticipant;
      }),
    })),
    [lineups.data],
  );
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
        data: safeLineups,
        isLoading: lineups.isLoading,
        isError: lineups.isError,
        error: lineups.error,
        refetch: () => lineups.refetch(),
      }}
      refreshLineupsAfterStart={async () => {
        await lineups.refetch({ throwOnError: true });
      }}
      leaseRequired={false}
      takeoverEnabled
      operatorScopeKey={JSON.stringify(teamMatchContext)}
      operationContextKey={teamMatchContext.teamMatchId}
      headerTopClass="top-[52px] lg:top-0"
      requiresLineupBeforeStart={false}
      allowPenaltyShootout={false}
      resultReviewEnabled={false}
      hostContext={teamMatchContext}
      resultHref={resultHref}
      renderAbnormalEndDialog={(props) => <AbnormalEndDialog {...props} />}
    />
  );
}
