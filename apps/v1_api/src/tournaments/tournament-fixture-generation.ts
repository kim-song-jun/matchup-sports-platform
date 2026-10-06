import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/** Called under the tournament generation lock, after confirming the coordinate is free.
 * Renumbering moves the coordinate, but creation records and match IDs remain immutable.
 */
export async function nextFixtureCreationCommandId(
  tx: Prisma.TransactionClient, baseKey: string, tournamentId: string, archivedCount: number, actorUserId: string,
): Promise<string> {
  const records = await tx.v1IdempotencyRecord.findMany({
    where: { actorUserId, action: 'source_create', resourceType: 'TEAM_MATCH', OR: [
      { idempotencyKey: baseKey }, { idempotencyKey: { startsWith: `${baseKey}:revision:` } },
    ] },
    select: { idempotencyKey: true, resourceId: true },
  });
  if (records.length === 0) return archivedCount ? `${baseKey}:revision:${archivedCount}` : baseKey;
  const details = await tx.v1TournamentMatchDetails.findMany({
    where: { teamMatchId: { in: records.map((record) => record.resourceId) } },
    select: { teamMatchId: true, tournamentId: true },
  });
  let generation = archivedCount;
  for (const record of records) {
    const suffix = record.idempotencyKey === baseKey ? '0' : record.idempotencyKey.slice(`${baseKey}:revision:`.length);
    if (!/^\d+$/.test(suffix) || !Number.isSafeInteger(Number(suffix)) ||
      !details.some((detail) => detail.teamMatchId === record.resourceId && detail.tournamentId === tournamentId)) {
      throw new ConflictException({ code: 'TEAM_MATCH_IDEMPOTENCY_INCOMPLETE', message: '기존 대진 생성 기록이 완전하지 않아요.' });
    }
    generation = Math.max(generation, Number(suffix) + 1);
  }
  return `${baseKey}:revision:${generation}`;
}
