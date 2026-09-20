import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';
import { fillLeagueTeamRoster } from '../../src/league-matches/league-roster-autofill';
import { seedLeagueOnTournamentAxis } from '../fixtures/league-on-tournament-axis.fixture';
import { createV1IntegrationApp } from '../integration/integration-app';

/**
 * #9 후속 리뷰 지적(2026-09-19): `fillLeagueTeamRoster` 를 부르는 경로가 이제 둘이다
 * (D10 크론 · 대진 생성). 두 경로가 **같은 명단 미제출 등록**을 거의 동시에 발견하면 각자
 * `evaluateRosterCandidate` 통과자를 계산해 등록을 시도하는데, `(registrationId, userId)`
 * 유니크는 `removedAt` 과 무관한 전역 제약이라 둘 다 같은 사람을 넣으려 한다. 멤버마다
 * `create` 하던 시절엔 늦게 도착한 쪽이 그 자리에서 예외를 내 트랜잭션 전체가 롤백됐다.
 * 지금은 `createMany({ skipDuplicates: true })` 로 한 번에 넣으므로, 늦게 도착한 트랜잭션은
 * 예외 없이 "이미 있으면 넘어간다" 로 끝난다 — 두 트랜잭션을 실제로 동시에 돌려서 확인한다.
 */
describe('fillLeagueTeamRoster — 동시 호출 경쟁', () => {
  const suiteId = randomUUID().slice(0, 8);
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let sportId: string;
  let regionId: string;
  let seq = 0;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    const sport = await prisma.v1Sport.upsert({
      where: { code: 'futsal' },
      update: {},
      create: { code: 'futsal', name: '풋살' },
    });
    sportId = sport.id;
    const region = await prisma.v1Region.create({
      data: { code: `t164-autofill-race-region-${suiteId}`, name: 'D10 경쟁 테스트 지역', level: 2 },
    });
    regionId = region.id;
  });

  afterAll(async () => cleanup?.());

  async function makeUser(): Promise<string> {
    seq += 1;
    const userId = `t164-autofill-race-u-${suiteId}-${seq}`;
    await prisma.v1User.create({
      data: {
        id: userId,
        email: `${userId}@integration.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
        phone: `0102000${String(seq).padStart(4, '0')}`,
        phoneVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
        profile: { create: { nickname: `경쟁선수${seq}`, realName: `경쟁선수${seq}`, birthDate: '1995-01-01', gender: 'male' } },
      },
    });
    return userId;
  }

  async function makeMember(teamId: string): Promise<string> {
    const userId = await makeUser();
    await prisma.v1TeamMembership.create({
      data: { teamId, userId, role: 'member', status: 'active', joinedAt: new Date(Date.now() + seq * 1000) },
    });
    return userId;
  }

  it('크론과 대진 생성이 같은 등록을 동시에 채워도 예외 없이 중복 없는 명단이 된다', async () => {
    const ownerId = await makeUser();
    seq += 1;
    const team = await prisma.v1Team.create({
      data: { ownerUserId: ownerId, sportId, regionId, name: `t164-autofill-race-team-${suiteId}-${seq}` },
    });
    // owner 자신은 활성 멤버십 row 를 안 만들면 채움 후보가 아니다 — 채움 후보는 팀원
    // 3명으로 명확히 한정한다.
    const members = [await makeMember(team.id), await makeMember(team.id), await makeMember(team.id)];

    const league = await seedLeagueOnTournamentAxis(prisma, {
      title: `D10 경쟁 리그 ${suiteId}-${seq}`,
      sportId,
      regionId,
      state: 'active',
      teamIds: [team.id],
      appliedByUserId: members[0],
    });
    const registration = await prisma.v1TournamentRegistration.findUniqueOrThrow({
      where: { tournamentId_teamId: { tournamentId: league.id, teamId: team.id } },
    });
    expect(await prisma.v1TournamentPlayer.count({ where: { registrationId: registration.id } })).toBe(0);

    // 실제로 동시에 — 같은 등록을 두 개의 독립된 트랜잭션이 함께 채운다(크론 vs 대진 생성 재현).
    const outcomes = await Promise.all([
      prisma.$transaction((tx) => fillLeagueTeamRoster(tx, league.id, registration)),
      prisma.$transaction((tx) => fillLeagueTeamRoster(tx, league.id, registration)),
    ]);

    // 둘 다 예외 없이 끝난다 — 유니크 위반으로 트랜잭션이 롤백되지 않는다.
    expect(outcomes).toHaveLength(2);
    // 실제로 새로 들어간 합은 멤버 수와 같다(한쪽이 다 넣으면 다른 쪽은 skipDuplicates 로
    // 전부 건너뛰어 0을 보고할 수 있다 — 어느 쪽이 몇 명을 넣었는지는 실행 순서에 달렸고,
    // 이 테스트가 고정할 것은 "합쳐서 중복 없이 멤버 수만큼" 이다).
    expect(outcomes[0].added + outcomes[1].added).toBe(members.length);

    const players = await prisma.v1TournamentPlayer.findMany({ where: { registrationId: registration.id } });
    expect(players).toHaveLength(members.length);
    expect(new Set(players.map((p) => p.userId)).size).toBe(members.length);
  });
});
