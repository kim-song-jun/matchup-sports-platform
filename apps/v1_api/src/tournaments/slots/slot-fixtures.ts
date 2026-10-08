import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

export type SlotFixture = {
  id: string;
  homeSlotId: string | null;
  awaySlotId: string | null;
  groupId: string | null;
  groupPhase: string | null;
  game: { id: string; state: string; currentOfficialRevisionId: string | null } | null;
};

/** "자리를 쓰는 경기"(스펙 S1) — 비삭제·비취소만. 반영·잠금 판정이 모두 이 목록을 쓴다. id 오름차순. */
export async function loadSlotUsingFixtures(
  tx: Prisma.TransactionClient,
  slotIds: readonly string[],
): Promise<SlotFixture[]> {
  if (slotIds.length === 0) return [];
  const rows = await tx.v1TeamMatch.findMany({
    where: {
      deletedAt: null,
      status: { not: 'cancelled' },
      OR: [{ homeSlotId: { in: [...slotIds] } }, { awaySlotId: { in: [...slotIds] } }],
    },
    select: {
      id: true,
      homeSlotId: true,
      awaySlotId: true,
      game: { select: { id: true, state: true, currentOfficialRevisionId: true } },
      tournamentDetails: { select: { groupId: true, group: { select: { phase: true } } } },
    },
    orderBy: { id: 'asc' },
  });
  return rows.map((row) => ({
    id: row.id,
    homeSlotId: row.homeSlotId,
    awaySlotId: row.awaySlotId,
    groupId: row.tournamentDetails?.groupId ?? null,
    groupPhase: row.tournamentDetails?.group?.phase ?? null,
    game: row.game,
  }));
}

export function sidesUsingSlot(fixture: SlotFixture, slotId: string): Array<'HOME' | 'AWAY'> {
  return [
    ...(fixture.homeSlotId === slotId ? (['HOME'] as const) : []),
    ...(fixture.awaySlotId === slotId ? (['AWAY'] as const) : []),
  ];
}

/** 게임이 SCHEDULED 가 아니거나 공식 결과가 붙은 경기. 게임이 없으면 시작 전으로 볼 수 없다. */
export function isSlotFixtureStarted(fixture: SlotFixture): boolean {
  return fixture.game === null || fixture.game.state !== 'SCHEDULED' || fixture.game.currentOfficialRevisionId !== null;
}

export function assertSlotFixturesNotStarted(fixtures: readonly SlotFixture[]): void {
  const missing = fixtures.filter((fixture) => fixture.game === null);
  if (missing.length > 0) {
    throw new ConflictException({
      code: 'TOURNAMENT_MATCH_GAME_MISSING',
      message: '대회 경기의 정본 게임을 찾을 수 없어요.',
      details: { teamMatchIds: missing.map((fixture) => fixture.id) },
    });
  }
  const started = fixtures.filter(isSlotFixtureStarted);
  if (started.length > 0) {
    throw new ConflictException({
      code: 'SLOT_LOCKED',
      message: '이미 시작했거나 결과가 있는 경기가 있어 자리를 바꿀 수 없어요.',
      details: { teamMatchIds: started.map((fixture) => fixture.id) },
    });
  }
}
