import { ConflictException } from '@nestjs/common';
import { V1GamePeriodState, V1GameState, type Prisma, type V1Game } from '@prisma/client';
import type { GameMutationResult } from './games.types';

/** Caller holds the canonical game row lock and owns authorization, idempotency and audit. */
export async function endLiveGamePeriod(
  tx: Prisma.TransactionClient,
  game: Pick<V1Game, 'id' | 'state'>,
  durableCommandId: string,
): Promise<GameMutationResult> {
  if (game.state !== V1GameState.LIVE) {
    throw new ConflictException({
      code: 'PERIOD_NOT_STARTED',
      message: '경기가 진행 중이어야 피리어드를 종료할 수 있어요',
    });
  }
  const current = await tx.v1GamePeriod.findFirst({
    where: { gameId: game.id, state: V1GamePeriodState.LIVE },
  });
  if (current === null) {
    throw new ConflictException({ code: 'PERIOD_NOT_STARTED', message: '진행 중인 피리어드가 없어요' });
  }
  const next = await tx.v1GamePeriod.findFirst({
    where: { gameId: game.id, number: current.number + 1 },
  });
  await tx.v1GamePeriod.update({
    where: { id: current.id },
    data: { state: V1GamePeriodState.ENDED, endedAt: new Date() },
  });
  if (next !== null) {
    await tx.v1GamePeriod.update({ where: { id: next.id }, data: { state: V1GamePeriodState.HALFTIME } });
  }
  const updated = await tx.v1Game.update({ where: { id: game.id }, data: { version: { increment: 1 } } });
  return {
    gameId: updated.id, state: updated.state, version: updated.version, durableCommandId, replayed: false,
  };
}
