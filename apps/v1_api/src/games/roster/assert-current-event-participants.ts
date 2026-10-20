import { UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { selectLineupParticipantsWithDraftFallback } from '../core/latest-lineup-participants';

/** 이전 리비전의 참가자 FK는 보존하지만 새 기록 대상으로는 사용할 수 없다. */
export async function assertCurrentEventParticipants(
  tx: Prisma.TransactionClient,
  gameId: string,
  participantIds: readonly (string | null | undefined)[],
): Promise<void> {
  const ids = [...new Set(participantIds.filter((id): id is string => typeof id === 'string'))];
  if (ids.length === 0) return;
  const [lineups, participants] = await Promise.all([
    tx.v1GameLineup.findMany({
      where: { gameId },
      select: { id: true, sideId: true, revision: true, state: true, invalidatedAt: true },
    }),
    tx.v1GameParticipant.findMany({
      where: { gameId, id: { in: ids } },
      select: { id: true, sideId: true, lineupId: true },
    }),
  ]);
  const currentIds = new Set(selectLineupParticipantsWithDraftFallback(participants, lineups.filter((lineup) => lineup.invalidatedAt === null)).map((p) => p.id));
  if (ids.some((id) => !currentIds.has(id))) {
    throw new UnprocessableEntityException({
      code: 'PARTICIPANT_NOT_IN_CURRENT_ROSTER',
      message: '현재 경기 출전 명단에 없는 선수예요. 명단을 다시 불러와 주세요.',
    });
  }
}
