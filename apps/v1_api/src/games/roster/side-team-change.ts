import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

export const SYSTEM_REVOKER_ROLE = 'SYSTEM';

/**
 * 사이드 팀을 바꾼 트랜잭션이 부른다(진출 재투영·대진 수정·배정 해제). 새 팀이 아닌 활성 조정을
 * 시스템 되돌리기로 닫는다 — 계산은 지금 사이드 팀의 행만 읽지만, 닫지 않으면 옛 팀이 다시 배정될 때
 * 그 빼기가 되살아난다. 호출자가 경기 행을 먼저 잠갔다(조정 쓰기와 같은 행이라 둘이 직렬화된다).
 */
export async function revokeReplacedSideTeamAdjustments(
  tx: Tx,
  input: { gameId: string; sideId: string; nextTeamId: string | null },
): Promise<number> {
  const { count } = await tx.v1GameRosterAdjustment.updateMany({
    where: {
      gameId: input.gameId,
      sideId: input.sideId,
      revokedAt: null,
      ...(input.nextTeamId === null ? {} : { teamId: { not: input.nextTeamId } }),
    },
    data: { revokedAt: new Date(), revokedByUserId: null, revokedByRole: SYSTEM_REVOKER_ROLE },
  });
  return count;
}
