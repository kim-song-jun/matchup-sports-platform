import { V1GameLineupState, type Prisma } from '@prisma/client';
import type { GameRosterSummaryEntry, TeamUpcomingGame } from './lineup-todo.service';

/**
 * 이 사용자가 각 경기에 **출전하는지** — 홈 "다음 경기"와 팀 상세 "다가오는 경기"의 "내 출전" 칩이
 * 같은 판정을 쓰도록 한 곳에 둔다. 웹은 명단을 따로 받아 비교하지 않고 이 결과만 읽는다.
 *
 * - 대회·리그: 계산된 경기 명단(참가 명단 − 조정 − 결장 − 출전정지)의 출전자.
 * - 친선: 사이드의 가장 최근 **제출본**(SUBMITTED·LOCKED) 참석명단에 든 사람. 임시 저장(DRAFT)만 있으면
 *   아무도 출전이 아니고, 제출 뒤 다시 열린 초안은 직전 제출본을 밀어내지 않는다
 *   (`games/core/latest-lineup-participants.ts` 의 "새 DRAFT 는 예전 제출을 무효화하지 않는다"와 같은 선).
 *
 * 반환은 출전하는 경기의 `gameId` 집합이다. 사이드를 못 찾은 경기와 기준 명단이 없는 경기는 빠진다.
 */
export async function loadViewerParticipation(
  tx: Prisma.TransactionClient,
  input: {
    readonly userId: string;
    readonly games: readonly Pick<TeamUpcomingGame, 'gameId' | 'competitionKind'>[];
    readonly rosters: ReadonlyMap<string, GameRosterSummaryEntry>;
  },
): Promise<ReadonlySet<string>> {
  const participating = new Set<string>();
  const gameIdBySideId = new Map<string, string>();

  for (const game of input.games) {
    const roster = input.rosters.get(game.gameId);
    if (roster === undefined) continue;
    if (game.competitionKind === 'FRIENDLY') {
      gameIdBySideId.set(roster.sideId, game.gameId);
    } else if (roster.participantUserIds?.has(input.userId) === true) {
      participating.add(game.gameId);
    }
  }
  if (gameIdBySideId.size === 0) return participating;

  const submitted = await tx.v1GameLineup.findMany({
    where: {
      sideId: { in: [...gameIdBySideId.keys()] },
      invalidatedAt: null,
      state: { in: [V1GameLineupState.SUBMITTED, V1GameLineupState.LOCKED] },
    },
    orderBy: [{ sideId: 'asc' }, { revision: 'desc' }],
    distinct: ['sideId'],
    select: { id: true, sideId: true },
  });
  if (submitted.length === 0) return participating;

  const mine = await tx.v1GameParticipant.findMany({
    where: { lineupId: { in: submitted.map((lineup) => lineup.id) }, userId: input.userId },
    select: { lineupId: true },
  });
  const myLineupIds = new Set(mine.map((row) => row.lineupId));
  for (const lineup of submitted) {
    const gameId = gameIdBySideId.get(lineup.sideId);
    if (gameId !== undefined && myLineupIds.has(lineup.id)) participating.add(gameId);
  }
  return participating;
}
