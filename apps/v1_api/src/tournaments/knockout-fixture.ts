import type { Prisma } from '@prisma/client';
import type { KnockoutFixtureFacts } from '../games/core/knockout-penalties';

type Transaction = Prisma.TransactionClient;

/**
 * Knockout 판별은 `V1TournamentGroup.phase`(semi/final/third_place)로만 한다 --
 * `V1TournamentFixture.round`는 한글/영문이 섞인 표시용 라벨이라 판별 기준으로
 * 쓰면 함정이다(프로젝트 메모리 기록 그대로). `groupId`가 없는 픽스처(어느
 * 조에도 배정되지 않음)는 knockout임을 확인할 방법이 없으므로 보수적으로
 * knockout이 아닌 것으로 취급한다 -- 승부차기를 지어낼 근거가 없을 때는
 * 허용하지 않는 쪽이 안전하다.
 *
 * 그 보수적 취급 때문에 "knockout이 아닌 것으로 판정되지만 진출 엣지는 있는"
 * 픽스처가 생길 수 있고, 그 무승부는 브래킷을 멈춘다 -- 그래서 무승부 가드는
 * 이 값 하나만 보지 않고 `hasAdvancementEdges`도 함께 본다
 * (`assertBracketResolvable` 참조).
 */
export async function readIsKnockoutFixture(
  tx: Transaction,
  tournamentFixtureId: string | null,
): Promise<boolean> {
  if (tournamentFixtureId === null) return false;
  const fixture = await tx.v1TournamentFixture.findUnique({
    where: { id: tournamentFixtureId },
    select: { group: { select: { phase: true } } },
  });
  return fixture?.group !== null && fixture?.group !== undefined && fixture.group.phase !== 'group';
}

/**
 * 승부차기 가드가 필요로 하는 두 사실을 **한 번의 질의로** 읽는다. 픽스처가
 * 아닌 게임(팀 매치 등)은 질의 없이 즉시 false/false다 -- 대회 외 `end`
 * 커맨드에는 추가 비용이 붙지 않는다.
 *
 * 진출 엣지 수는 별도 `count` 질의가 아니라 같은 `findUnique`의 `_count`로
 * 읽는다. 이 함수는 게임 행을 `FOR UPDATE`로 잠근 트랜잭션 안에서 호출되므로
 * 왕복 수가 곧 잠금 보유 시간이고, 리팩터 전 `end` 레인은 이 자리에서 최대
 * 1회만 질의했다 -- 2회로 늘리는 것은 근거 없는 회귀다.
 * `advancementSources`는 이 픽스처가 **source**인 엣지(= 이 경기 결과로 다음
 * 라운드가 정해지는 엣지)이며, `GameResultBracketProjectionService.project`가
 * 승자를 판정할지 말지를 정확히 그 집합의 크기(`edges.length === 0`이면
 * return)로 결정하므로 "무승부로 확정하면 브래킷이 멈추는가"의 유일한 근거다.
 *
 * 모든 레인(정본 `end`/복구/정정/재제출)이 이 한 함수로 사실을 읽어야 한다.
 * 레인마다 따로 읽으면 판정 기준이 갈리고, 정정 레인에 승부차기 가드가 아예
 * 복제되지 않았던 원래 결함이 다시 생긴다.
 */
export async function readKnockoutFixtureFacts(
  tx: Transaction,
  tournamentFixtureId: string | null,
): Promise<KnockoutFixtureFacts> {
  if (tournamentFixtureId === null) {
    return { isKnockoutFixture: false, hasAdvancementEdges: false };
  }
  const fixture = await tx.v1TournamentFixture.findUnique({
    where: { id: tournamentFixtureId },
    select: {
      group: { select: { phase: true } },
      _count: { select: { advancementSources: true } },
    },
  });
  return {
    isKnockoutFixture:
      fixture?.group !== null && fixture?.group !== undefined && fixture.group.phase !== 'group',
    hasAdvancementEdges: (fixture?._count.advancementSources ?? 0) > 0,
  };
}
