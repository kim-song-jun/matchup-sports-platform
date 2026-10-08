import { UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ROUND12_BYE_SORT_ORDERS } from '../templates/bracket-template-plan';

/**
 * 12강 그룹의 BYE 자리 <-> 부전승 저장 형태. 팀이 없으면 `V1TournamentByeSlot`(빈 자리), 팀이 정해지면
 * `V1TournamentGroupTeam(isBye=true)` — `TournamentBracketService.createBye` 와 같은 의미이고, 승계하는 행은
 * 같은 id·createdAt 을 쓴다. 공개 그래프는 GroupTeam(isBye) 가 8강 칸에 배정돼 있을 때 부전승 연결선을 그린다.
 */
export async function syncByeSlotInTx(
  tx: Prisma.TransactionClient,
  slot: { groupId: string | null; position: number },
  registrationId: string | null,
): Promise<void> {
  const sortOrder = ROUND12_BYE_SORT_ORDERS[slot.position - 1];
  if (slot.groupId === null || sortOrder === undefined) {
    throw new UnprocessableEntityException({ code: 'SLOT_BYE_POSITION_INVALID', message: '부전승 자리의 위치가 올바르지 않아요.' });
  }
  const groupId = slot.groupId;
  const team = await tx.v1TournamentGroupTeam.findFirst({ where: { groupId, isBye: true, sortOrder } });
  const empty = await tx.v1TournamentByeSlot.findUnique({ where: { groupId_sortOrder: { groupId, sortOrder } } });

  if (registrationId !== null) {
    if (team !== null) {
      await tx.v1TournamentGroupTeam.update({ where: { id: team.id }, data: { registrationId } });
    } else {
      await tx.v1TournamentGroupTeam.create({
        data: { ...(empty ? { id: empty.id, createdAt: empty.createdAt } : {}), groupId, registrationId, isBye: true, sortOrder },
      });
      if (empty !== null) await tx.v1TournamentByeSlot.delete({ where: { id: empty.id } });
    }
    return;
  }
  if (team !== null) {
    await tx.v1TournamentByeSlot.create({ data: { id: team.id, groupId, sortOrder, createdAt: team.createdAt } });
    await tx.v1TournamentGroupTeam.delete({ where: { id: team.id } });
    await tx.v1TournamentStanding.deleteMany({ where: { groupId, registrationId: team.registrationId } });
  } else if (empty === null) {
    await tx.v1TournamentByeSlot.create({ data: { groupId, sortOrder } });
  }
}
