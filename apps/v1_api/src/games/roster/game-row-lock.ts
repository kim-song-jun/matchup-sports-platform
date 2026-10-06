import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Roster writes must yield to source-first result/bracket locks instead of waiting in UUID order. */
export async function lockGameRows(
  tx: Prisma.TransactionClient,
  gameIds: readonly string[],
  waitForLocks = true,
): Promise<void> {
  for (const gameId of [...new Set(gameIds)].sort()) {
    try {
      if (waitForLocks) {
        await tx.$queryRaw`SELECT id FROM v1_games WHERE id = ${gameId} FOR UPDATE`;
      } else {
        await tx.$queryRaw`SELECT id FROM v1_games WHERE id = ${gameId} FOR UPDATE NOWAIT`;
      }
    } catch (error: unknown) {
      if (!waitForLocks && error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2010' && error.meta?.code === '55P03') {
        throw new ConflictException({
          code: 'COMMAND_CONCURRENCY_CONFLICT',
          message: '경기가 동시에 변경되어 명단을 저장하지 못했어요. 다시 시도해 주세요.',
          details: { gameId },
        });
      }
      throw error;
    }
  }
}
