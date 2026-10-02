import { ConflictException } from '@nestjs/common';
import type { Prisma, V1Match } from '@prisma/client';

/** Caller must lock v1_matches before invoking this transaction-only transition. */
export async function completePersonalMatch(
  tx: Prisma.TransactionClient,
  match: Pick<V1Match, 'id' | 'status' | 'startAt' | 'endAt' | 'completedAt' | 'deletedAt'>,
  now = new Date(),
) {
  if (match.deletedAt || !['recruiting', 'closed', 'completed'].includes(match.status)) {
    throw new ConflictException({ code: 'STATE_CONFLICT', message: '취소되거나 보관된 매치는 완료할 수 없어요.' });
  }
  if (match.status !== 'completed' && (match.endAt ?? match.startAt) > now) {
    throw new ConflictException({ code: 'MATCH_NOT_ENDED', message: '경기가 끝난 뒤 참여를 확정해 주세요.' });
  }
  const completedAt = match.completedAt ?? now;
  await tx.v1Match.update({ where: { id: match.id }, data: { status: 'completed', completedAt } });
  // Incrementing a counter would double-count retries. The profile counts these rows.
  const participants = await tx.v1MatchParticipant.updateMany({
    where: { matchId: match.id, status: 'active' },
    data: { status: 'completed', completedAt },
  });
  await tx.v1MatchApplication.updateMany({
    where: { matchId: match.id, status: 'requested' },
    data: { status: 'expired', reviewedAt: now },
  });
  return { completedAt, completedParticipants: participants.count };
}
