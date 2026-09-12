import type { PrismaService } from '../prisma/prisma.service';

export type AppearanceGamePrismaLike = Pick<
  PrismaService,
  'v1GameResultParticipant' | 'v1GameParticipant' | 'v1GameSide'
>;

export type AppearanceFixture = {
  tournamentId: string | null;
  leagueId: string | null;
  tournamentDetails: { teamMatchId: string; tournamentId: string } | null;
  id: string;
  game: { id: string; sourceType: string; currentOfficialRevision: { id: string; state: string } | null } | null;
};

/**
 * 대회 경기의 **실제 출전(appeared)** 사용자 집합을 홈/원정으로 나눠 반환한다 (스펙 §5.1).
 *
 * `null` 과 `{home:∅, away:∅}` 는 뜻이 다르다:
 * - `null` = **판정할 근거가 없다.** Game 미연결이거나 공식(OFFICIAL) 결과 리비전이 없다
 *   (VOID 로 넘어간 경우 포함). 호출자는 §5.2 폴백(등록 로스터 전체)으로 넘어가야 한다.
 * - 빈 집합 = 공식 결과는 있는데 출전 기록이 비어 있다. 이때는 폴백하지 않는다 --
 *   폴백해 버리면 "결과상 아무도 안 뛰었다"가 "전원 평가 가능"으로 뒤집힌다.
 *
 * `V1GameParticipant.userId` 가 null 인 행(신원 미연결 라인업 -- 게스트, 백필 이전 데이터)은
 * 판정에서 제외한다. 평가 대상은 계정이 있는 사람뿐이기 때문이다.
 *
 * 단일 fixture 호출은 내부 batch 경로를 사용해 기존 세 단계 조회 의미를 유지한다. 목록은
 * `appearedUserIdsBySideBatch`로 세 테이블을 각각 한 번만 조회한다. `V1GameParticipant`에는
 * side relation이 없고 `sideId` 컬럼만 있어(schema.prisma:2757-) `V1GameSide` 조회가 필요하다.
 */
export async function appearedUserIdsBySide(
  prisma: AppearanceGamePrismaLike,
  fixture: AppearanceFixture,
): Promise<{ home: Set<string>; away: Set<string> } | null> {
  return (await appearedUserIdsBySideBatch(prisma, [fixture])).get(fixture.id) ?? null;
}

/**
 * 여러 canonical fixture의 출전 집합을 한 번에 계산한다. 결과 리비전, 참가자, 사이드
 * 각각을 한 번씩 읽어 pending 목록의 fixture 수에 비례한 쿼리 폭증을 막는다.
 */
export async function appearedUserIdsBySideBatch(
  prisma: AppearanceGamePrismaLike,
  fixtures: readonly AppearanceFixture[],
): Promise<Map<string, { home: Set<string>; away: Set<string> } | null>> {
  const result = new Map<string, { home: Set<string>; away: Set<string> } | null>();
  const valid = fixtures.filter((fixture) => {
    const revision = fixture.game?.currentOfficialRevision;
    const isValid = Boolean(
      fixture.tournamentId &&
        fixture.leagueId === null &&
        fixture.tournamentDetails &&
        fixture.tournamentDetails.teamMatchId === fixture.id &&
        fixture.tournamentDetails.tournamentId === fixture.tournamentId &&
        fixture.game?.sourceType === 'TEAM_MATCH' &&
        fixture.game &&
        revision &&
        revision.state === 'OFFICIAL',
    );
    if (!isValid) result.set(fixture.id, null);
    return isValid;
  });
  if (!valid.length) return result;

  const gameByFixtureId = new Map(valid.map((fixture) => [fixture.id, fixture.game!]));
  const expectedGameByRevisionId = new Map(
    valid.map((fixture) => [fixture.game!.currentOfficialRevision!.id, fixture.game!.id]),
  );
  const resultParticipants = await prisma.v1GameResultParticipant.findMany({
    where: { resultRevisionId: { in: [...expectedGameByRevisionId.keys()] } },
    select: {
      participantId: true,
      resultRevisionId: true,
      resultRevision: { select: { gameId: true } },
    },
  });
  const participantIdsByGameId = new Map<string, Set<string>>();
  for (const row of resultParticipants) {
    const expectedGameId = expectedGameByRevisionId.get(row.resultRevisionId);
    if (!expectedGameId || row.resultRevision.gameId !== expectedGameId) continue;
    const participantIds = participantIdsByGameId.get(expectedGameId) ?? new Set<string>();
    participantIds.add(row.participantId);
    participantIdsByGameId.set(expectedGameId, participantIds);
  }

  for (const fixture of valid) {
    if (!participantIdsByGameId.has(fixture.game!.id)) result.set(fixture.id, { home: new Set(), away: new Set() });
  }
  const participantIds = [...new Set([...participantIdsByGameId.values()].flatMap((ids) => [...ids]))];
  if (!participantIds.length) return result;

  const participants = await prisma.v1GameParticipant.findMany({
    where: { id: { in: participantIds } },
    select: { id: true, gameId: true, userId: true, sideId: true },
  });
  const participantById = new Map(participants.map((participant) => [participant.id, participant]));
  const sideIds = [...new Set(participants.map((participant) => participant.sideId))];
  const sides = await prisma.v1GameSide.findMany({
    where: { id: { in: sideIds } },
    select: { id: true, gameId: true, sideKey: true },
  });
  const sideByGameAndId = new Map(sides.map((side) => [`${side.gameId}:${side.id}`, side.sideKey]));

  for (const [fixtureId, game] of gameByFixtureId) {
    const home = new Set<string>();
    const away = new Set<string>();
    for (const participantId of participantIdsByGameId.get(game.id) ?? []) {
      const participant = participantById.get(participantId);
      if (!participant || participant.gameId !== game.id || !participant.userId) continue;
      const sideKey = sideByGameAndId.get(`${game.id}:${participant.sideId}`);
      if (sideKey === 'HOME') home.add(participant.userId);
      else if (sideKey === 'AWAY') away.add(participant.userId);
    }
    result.set(fixtureId, { home, away });
  }
  return result;
}
