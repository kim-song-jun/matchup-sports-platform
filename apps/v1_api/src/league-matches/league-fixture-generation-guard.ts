import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { findTournamentOnSurface } from '../tournaments/tournament-surface-lookup';

/** Judges against the latest state after the canonical row lock — a hold can commit after the plan is computed. */
export async function assertLeagueFixtureGenerationAllowedInTx(
  tx: Prisma.TransactionClient,
  leagueId: string,
): Promise<void> {
  const league = await findTournamentOnSurface(tx, ['regular_league'], {
    where: { id: leagueId, deletedAt: null },
    select: { status: true },
  });
  if (league === null) {
    throw new NotFoundException({ code: 'LEAGUE_NOT_FOUND', message: '리그를 찾을 수 없어요.' });
  }
  if (league.status === 'on_hold') {
    throw new ConflictException({ code: 'LEAGUE_ON_HOLD', message: '보류 중에는 대진을 만들거나 다시 만들 수 없어요. 먼저 보류를 해제해 주세요.' });
  }
}
