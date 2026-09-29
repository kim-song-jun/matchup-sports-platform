import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

export const SYSTEM_REVOKER_ROLE = 'SYSTEM';

/**
 * 사이드 팀을 실제로 바꾼 트랜잭션만 부른다(진출 재투영·대진 수정·배정 해제). 그 사이드의 활성 조정을
 * **팀을 가리지 않고 전부** 시스템 되돌리기로 닫는다 — 들어오는 팀의 정당한 활성 행은 있을 수 없다.
 * 새 팀 것을 남기면, 결과 검토(Serializable 스냅샷) 사이에 끼어든 옛 조정이 그 팀이 돌아올 때 되살아난다.
 * 호출자가 경기 행을 먼저 잠갔다(조정 쓰기와 같은 행이라 둘이 직렬화된다).
 */
export async function revokeReplacedSideTeamAdjustments(
  tx: Tx,
  input: { gameId: string; sideId: string },
): Promise<number> {
  const { count } = await tx.v1GameRosterAdjustment.updateMany({
    where: { gameId: input.gameId, sideId: input.sideId, revokedAt: null },
    data: { revokedAt: new Date(), revokedByUserId: null, revokedByRole: SYSTEM_REVOKER_ROLE },
  });
  return count;
}
