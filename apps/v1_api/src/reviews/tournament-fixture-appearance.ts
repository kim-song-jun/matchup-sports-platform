import type { PrismaService } from '../prisma/prisma.service';

export type AppearanceGamePrismaLike = Pick<
  PrismaService,
  'v1GameResultParticipant' | 'v1GameParticipant' | 'v1GameSide'
>;

type AppearanceFixture = {
  game: { id: string; currentOfficialRevision: { id: string; state: string } | null } | null;
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
 * 쿼리는 fixture 1건당 정확히 3회다(N+1 아님). `V1GameParticipant` 에는 side relation 이 없고
 * `sideId` 컬럼만 있어(schema.prisma:2757-) `V1GameSide` 조회가 별도로 필요하다.
 */
export async function appearedUserIdsBySide(
  prisma: AppearanceGamePrismaLike,
  fixture: AppearanceFixture,
): Promise<{ home: Set<string>; away: Set<string> } | null> {
  const revision = fixture.game?.currentOfficialRevision;
  if (!fixture.game || !revision || revision.state !== 'OFFICIAL') return null;

  const resultParticipants = await prisma.v1GameResultParticipant.findMany({
    where: { resultRevisionId: revision.id },
    select: { participantId: true },
  });
  if (resultParticipants.length === 0) return { home: new Set(), away: new Set() };

  // 공식 결과에 실린 participantId 로만 좁힌다 -- 라인업 전체를 가져오면 명단에만 있고
  // 실제로는 뛰지 않은 선수까지 "출전"으로 잡혀 이 게이트의 존재 이유가 사라진다.
  const participantIds = resultParticipants.map((row) => row.participantId);
  const participants = await prisma.v1GameParticipant.findMany({
    where: { id: { in: participantIds } },
    select: { id: true, userId: true, sideId: true },
  });

  const sideIds = [...new Set(participants.map((row) => row.sideId))];
  const sides = await prisma.v1GameSide.findMany({
    where: { id: { in: sideIds } },
    select: { id: true, sideKey: true },
  });
  const sideKeyById = new Map(sides.map((side) => [side.id, side.sideKey]));

  const home = new Set<string>();
  const away = new Set<string>();
  for (const participant of participants) {
    if (!participant.userId) continue;
    const sideKey = sideKeyById.get(participant.sideId);
    if (sideKey === 'HOME') home.add(participant.userId);
    else if (sideKey === 'AWAY') away.add(participant.userId);
  }
  return { home, away };
}
