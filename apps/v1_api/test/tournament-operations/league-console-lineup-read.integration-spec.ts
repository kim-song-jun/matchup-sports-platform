import { randomUUID } from 'node:crypto';
import type { V1AuthUser } from '../../src/auth/v1-auth-user';
import { GamesService } from '../../src/games/games.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import type { SaveTeamMatchLineupDto } from '../../src/team-matches/dto/team-match-lineup.dto';
import { TeamMatchLineupService } from '../../src/team-matches/team-match-lineup.service';
import { TournamentFixtureLineupService } from '../../src/tournament-operations/lineups/tournament-fixture-lineup.service';
import { createV1IntegrationApp } from '../integration/integration-app';

/**
 * **콘솔이 리그 경기의 라인업을 읽을 수 있는가 (real DB, Task 165 BE-4 사전 실측).**
 *
 * 운영 콘솔(`/admin/live/:id/fixtures/:fid/operate`)은 라인업을 **읽기만** 한다
 * (`operate/` 전체에 저장 훅 0건). 그 읽기는 `GamesService.listLineups(user, gameId)` 로
 * 게임 축이다 — 그러니 **리그에서도 그대로 동작해야 맞다.** 막혀 있던 것은 그 앞의
 * `fixtureId → gameId` 해석 한 자리뿐이라는 것이 BE-4 의 전제다.
 *
 * 이 스펙이 그 전제를 **실제 DB 로** 검증한다:
 * 1. 팀매치 라인업 서비스로 저장한 명단이
 * 2. 콘솔이 쓰는 `listLineups` 에서 **같은 행으로** 읽히는가
 *
 * 코드만 보면 둘 다 `V1GameLineup` 을 쓰지만, **읽는 쪽에 `resolveActor` 가 있다** —
 * 팀매치 게임에서 어드민이 통과하는지, 참가자(`V1GameParticipant`)가 `lineupId` 로
 * 딸려 나오는지는 DB 없이 알 수 없다.
 */
const ids = {
  sport: 'c9000000-0000-4000-8000-000000000010',
  region: 'c9000000-0000-4000-8000-000000000020',
  adminUser: 'c9000000-0000-4000-8000-000000000030',
  ownerUser: 'c9000000-0000-4000-8000-000000000031',
  league: 'c9000000-0000-4000-8000-000000000040',
  teamA: 'c9000000-0000-4000-8000-000000000050',
  teamB: 'c9000000-0000-4000-8000-000000000051',
} as const;

describe('콘솔의 라인업 읽기 — 리그 경기', () => {
  let app: Awaited<ReturnType<typeof createV1IntegrationApp>>['app'];
  let cleanup: () => Promise<void>;
  let prisma: PrismaService;
  let games: GamesService;
  let teamMatchLineup: TeamMatchLineupService;
  let consoleLineup: TournamentFixtureLineupService;
  let teamMatchId: string;
  let gameId: string;

  const adminActor: V1AuthUser = {
    id: ids.adminUser,
    email: null,
    accountStatus: 'active',
    onboardingStatus: 'completed',
  };
  const ownerActor: V1AuthUser = { ...adminActor, id: ids.ownerUser };

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for this integration verification');
    }
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    games = app.get(GamesService);
    teamMatchLineup = app.get(TeamMatchLineupService);
    consoleLineup = app.get(TournamentFixtureLineupService);

    await prisma.v1Sport.create({
      data: { id: ids.sport, code: 'futsal-task165-be4', name: '풋살', sortOrder: 1 },
    });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'task165-be4-region', name: '검증 지역', level: 2, isActive: true },
    });
    for (const [id, email] of [
      [ids.adminUser, 'be4-admin@example.test'],
      [ids.ownerUser, 'be4-owner@example.test'],
    ] as const) {
      await prisma.v1User.create({
        data: { id, email, accountStatus: 'active', onboardingStatus: 'completed' },
      });
    }
    const admin = await prisma.v1AdminUser.create({
      data: { userId: ids.adminUser, adminRole: 'owner', status: 'active' },
    });
    for (const [id, name] of [
      [ids.teamA, 'BE4 팀 A'],
      [ids.teamB, 'BE4 팀 B'],
    ] as const) {
      await prisma.v1Team.create({
        data: {
          id,
          name,
          sportId: ids.sport,
          regionId: ids.region,
          status: 'active',
          ownerUserId: ids.ownerUser,
        },
      });
      await prisma.v1TeamMembership.create({
        data: { teamId: id, userId: ids.ownerUser, role: 'owner', status: 'active' },
      });
    }

    const startsOn = new Date(Date.now() + 7 * 86_400_000);
    // BE-5 drop: 통합 축 행 하나가 리그다(아래 create). 로스터는 confirmed 등록으로 만든다.
    await prisma.v1Tournament.create({
      data: {
        id: ids.league,
        kind: 'regular_league',
        sportId: ids.sport,
        regionId: ids.region,
        title: 'BE4 콘솔 라인업 리그',
        status: 'in_progress',
        scheduledAt: startsOn,
      },
    });

    const config = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({
      where: { status: 'ACTIVE' },
      orderBy: { version: 'desc' },
      select: { id: true },
    });
    const teamMatch = await prisma.v1TeamMatch.create({
      data: {
        title: 'BE4 1주차',
        sportId: ids.sport,
        regionId: ids.region,
        leagueId: ids.league,
        createdByUserId: ids.adminUser,
        hostTeamId: ids.teamA,
        approvedApplicantTeamId: ids.teamB,
        placeName: '검증 구장',
        startAt: startsOn,
        status: 'matched',
      },
    });
    teamMatchId = teamMatch.id;

    // 게임과 사이드는 리그 대진 생성이 만드는 것과 같은 모양으로 둔다.
    const game = await prisma.v1Game.create({
      data: { sourceType: 'TEAM_MATCH', teamMatchId, competitionConfigVersionId: config.id },
    });
    gameId = game.id;
    await prisma.v1GameSide.createMany({
      data: [
        { gameId, sideKey: 'HOME', teamId: ids.teamA, displayNameSnapshot: 'BE4 팀 A' },
        { gameId, sideKey: 'AWAY', teamId: ids.teamB, displayNameSnapshot: 'BE4 팀 B' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.v1GameParticipant.deleteMany({ where: { gameId } });
    await prisma.v1GameLineup.deleteMany({ where: { gameId } });
    await prisma.v1GameSide.deleteMany({ where: { gameId } });
    await prisma.v1Game.deleteMany({ where: { id: gameId } });
    await prisma.v1TeamMatch.deleteMany({ where: { leagueId: ids.league } });
    await prisma.v1TournamentRegistration.deleteMany({ where: { tournamentId: ids.league } });
    await prisma.v1Tournament.deleteMany({ where: { id: ids.league } });
    await prisma.v1TeamMembership.deleteMany({ where: { userId: ids.ownerUser } });
    await prisma.v1Team.deleteMany({ where: { sportId: ids.sport } });
    await prisma.v1AdminActionLog.deleteMany({ where: { adminUser: { userId: ids.adminUser } } });
    await prisma.v1AdminUser.deleteMany({ where: { userId: ids.adminUser } });
    await prisma.v1User.deleteMany({ where: { id: { startsWith: 'c9000000' } } });
    await prisma.v1Region.deleteMany({ where: { id: ids.region } });
    await prisma.v1Sport.deleteMany({ where: { id: ids.sport } });
    await cleanup();
  });

  it('팀매치로 저장한 라인업을 콘솔의 listLineups 가 같은 명단으로 읽는다', async () => {
    // 팀 오너가 팀매치 경로로 저장한다 — 163 이후의 "명단 = 출전자" 모양.
    // `as never` 를 쓰지 않는다 — 캐스팅은 DTO 가 바뀌어도 스펙이 조용히 통과하게 만든다.
    // 포지션은 빼둔다: 이 픽스처의 설정 버전 카탈로그에 없는 코드면 #978 의
    // `LINEUP_POSITION_INVALID` 가드에 걸린다. 이 스펙이 보는 것은 **명단이 콘솔에
    // 읽히는가** 이지 포지션 검증이 아니다.
    const lineupDto: SaveTeamMatchLineupDto = {
      expectedVersion: 0,
      participants: [
        { displayName: '가나다', jerseyNumber: 7 },
        { displayName: '라마바', jerseyNumber: 9 },
      ],
    };
    const saved = await teamMatchLineup.saveLineup(ownerActor, teamMatchId, randomUUID(), lineupDto);
    expect(saved).toBeDefined();

    // 콘솔이 쓰는 읽기 — 게임 축이다.
    const lineups = await games.listLineups(adminActor, gameId);

    expect(lineups.length).toBeGreaterThan(0);
    const names = lineups
      .flatMap((lineup) => lineup.participants)
      .map((participant) => participant.displayNameSnapshot)
      .sort();
    expect(names).toEqual(['가나다', '라마바']);
  });

  it('어드민은 양 팀 라인업을 모두 본다 — 참가팀 액터만 자기 쪽으로 좁혀진다', async () => {
    const lineups = await games.listLineups(adminActor, gameId);
    const sideIds = new Set(lineups.map((lineup) => lineup.sideId));
    // 이 시점엔 홈만 저장돼 있으므로 1개다. 중요한 것은 **어드민이 필터되지 않는다**는 것 —
    // `resolveActor` 가 팀매치 게임에서 admin 을 통과시키지 않으면 여기서 0개가 나온다.
    expect(sideIds.size).toBeGreaterThan(0);
  });

  it('콘솔 진입점(리그 거울 id + 팀매치 id)이 200 으로 같은 명단을 준다', async () => {
    // 이게 BE-4 가 고친 자리다. 예전엔 `V1TournamentFixture` 만 봐서 **404** 였다 —
    // 리그 경기의 id 는 팀매치 id 라 그 행이 없다.
    const result = await consoleLineup.listLineups(adminActor, ids.league, teamMatchId);

    expect(result.gameId).toBe(gameId);
    const names = result.lineups
      .flatMap((lineup) => lineup.participants)
      .map((participant) => participant.displayNameSnapshot)
      .sort();
    // 팀매치 경로로 저장한 명단과 **같아야** 한다 — 콘솔이 다른 소스를 읽으면 여기서 갈린다.
    expect(names).toEqual(['가나다', '라마바']);
  });

  it('같은 id 라도 다른 리그로 물으면 404 — 리그 스코프가 유지된다', async () => {
    await expect(
      consoleLineup.listLineups(adminActor, 'c9000000-0000-4000-8000-0000000000ff', teamMatchId),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_FIXTURE_GAME_NOT_FOUND' } });
  });

  it('대진 행은 있는데 게임이 없으면 404 다 — 팀매치를 뒤지지 않는다', async () => {
    // 리그 fallback 은 **대진 행이 없을 때만** 돈다. 대진이 있는데 게임만 없는 것은
    // 대회 경기의 정상적인 "아직 게임 없음" 이지 리그일 가능성이 아니다(Copilot 리뷰).
    const fixtureOnlyTournament = await prisma.v1Tournament.create({
      data: {
        kind: 'regular_tournament',
        sportId: ids.sport,
        regionId: ids.region,
        title: 'BE4 게임 없는 대진',
        status: 'in_progress',
      },
    });
    const fixture = await prisma.v1TournamentFixture.create({
      data: { tournamentId: fixtureOnlyTournament.id, round: 'R1', fixtureNumber: 1 },
    });
    const spy = jest.spyOn(prisma.v1TeamMatch, 'findFirst');
    try {
      await expect(
        consoleLineup.listLineups(adminActor, fixtureOnlyTournament.id, fixture.id),
      ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_FIXTURE_GAME_NOT_FOUND' } });
      // 404 만 보면 fallback 이 돌고 못 찾아 404 인 경우와 구분되지 않는다 — 조회 자체가
      // 없었다는 것까지 본다.
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      await prisma.v1TournamentFixture.deleteMany({ where: { tournamentId: fixtureOnlyTournament.id } });
      await prisma.v1Tournament.deleteMany({ where: { id: fixtureOnlyTournament.id } });
    }
  });
});
