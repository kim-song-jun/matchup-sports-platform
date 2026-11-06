import type { Prisma } from '@prisma/client';

type OwnTeamFixtureDb = Pick<Prisma.TransactionClient, 'v1TeamMatch' | 'v1TeamMembership'>;

/**
 * 참가팀 선수는 자기 팀 경기의 현장 담당자가 될 수 없다(2026-11-02 사용자 결정, MD-QA #193).
 * 자기 팀 점수·카드를 스스로 기록하는 길을 막는다. 배정·접근 판정·담당 경기 목록이 모두 이 함수를 쓴다.
 *
 * 경기의 두 팀은 리그면 TeamMatch 의 홈·원정 팀, 대회면 대진의 홈·원정 신청 팀이다. 둘 다 읽어 합친다.
 * 돌려주는 것은 `fixtureIds` 가운데 `userId` 가 한쪽 팀의 활성 멤버인 경기 id 다.
 */
export async function findOwnTeamFixtureIds(
  db: OwnTeamFixtureDb,
  userId: string,
  fixtureIds: readonly string[],
): Promise<Set<string>> {
  if (fixtureIds.length === 0) return new Set();
  const fixtures = await db.v1TeamMatch.findMany({
    where: { id: { in: [...fixtureIds] } },
    select: {
      id: true,
      hostTeamId: true,
      approvedApplicantTeamId: true,
      tournamentDetails: {
        select: {
          homeRegistration: { select: { teamId: true } },
          awayRegistration: { select: { teamId: true } },
        },
      },
    },
  });
  const teamsByFixture = fixtures.map((fixture) => ({
    id: fixture.id,
    teamIds: [
      fixture.hostTeamId,
      fixture.approvedApplicantTeamId,
      fixture.tournamentDetails?.homeRegistration?.teamId,
      fixture.tournamentDetails?.awayRegistration?.teamId,
    ].filter((teamId): teamId is string => typeof teamId === 'string'),
  }));
  const allTeamIds = [...new Set(teamsByFixture.flatMap((fixture) => fixture.teamIds))];
  if (allTeamIds.length === 0) return new Set();
  const memberships = await db.v1TeamMembership.findMany({
    where: { userId, status: 'active', teamId: { in: allTeamIds } },
    select: { teamId: true },
  });
  const myTeamIds = new Set(memberships.map((membership) => membership.teamId));
  return new Set(
    teamsByFixture.filter((fixture) => fixture.teamIds.some((teamId) => myTeamIds.has(teamId))).map((fixture) => fixture.id),
  );
}
