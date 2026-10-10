import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { findTournamentOnSurface } from '../tournaments/tournament-surface-lookup';

async function loadLeagueStatusInTx(tx: Prisma.TransactionClient, leagueId: string): Promise<string> {
  const league = await findTournamentOnSurface(tx, ['regular_league'], {
    where: { id: leagueId, deletedAt: null },
    select: { status: true },
  });
  if (league === null) {
    throw new NotFoundException({ code: 'LEAGUE_NOT_FOUND', message: '리그를 찾을 수 없어요.' });
  }
  return league.status;
}

function throwIfLeagueEnded(status: string): void {
  if (status === 'completed' || status === 'cancelled') {
    throw new ConflictException({ code: 'LEAGUE_ENDED', message: '끝났거나 취소된 리그는 대진을 만들거나 바꿀 수 없어요.' });
  }
}

/**
 * 끝남·취소만 막는다. 보류(on_hold) 중에도 운영자가 경기를 손으로 더하고 고치는 것은 허용해야 하는
 * 경로(수동 추가·수정)용이다 — 보류까지 막는 일괄 생성 가드와 섞어 쓰지 않는다.
 */
export async function assertLeagueNotEndedInTx(tx: Prisma.TransactionClient, leagueId: string): Promise<void> {
  throwIfLeagueEnded(await loadLeagueStatusInTx(tx, leagueId));
}

/** Judges against the latest state after the canonical row lock — a hold can commit after the plan is computed. */
export async function assertLeagueFixtureGenerationAllowedInTx(
  tx: Prisma.TransactionClient,
  leagueId: string,
): Promise<void> {
  const status = await loadLeagueStatusInTx(tx, leagueId);
  if (status === 'on_hold') {
    throw new ConflictException({ code: 'LEAGUE_ON_HOLD', message: '보류 중에는 대진을 만들거나 다시 만들 수 없어요. 먼저 보류를 해제해 주세요.' });
  }
  throwIfLeagueEnded(status);
}
