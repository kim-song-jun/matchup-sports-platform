import { HttpException } from '@nestjs/common';
import { V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TeamLineupHistoryService } from '../../src/team-lineups/team-lineup-history.service';
import { TeamLineupPresetService } from '../../src/team-lineups/team-lineup-preset.service';
import { TeamsService } from '../../src/teams/teams.service';
import { NotificationsService } from '../../src/notifications/notifications.service';

const ids = {
  ownerA: '71000000-0000-4000-8000-000000000001',
  managerA: '71000000-0000-4000-8000-000000000002',
  memberA: '71000000-0000-4000-8000-000000000003',
  ownerB: '71000000-0000-4000-8000-000000000004',
  sport: '71000000-0000-4000-8000-000000000010',
  region: '71000000-0000-4000-8000-000000000011',
  teamA: '71000000-0000-4000-8000-000000000020',
  teamB: '71000000-0000-4000-8000-000000000021',
  teamMatch: '71000000-0000-4000-8000-000000000030',
  game: '71000000-0000-4000-8000-000000000040',
  sideA: '71000000-0000-4000-8000-000000000041',
  sideB: '71000000-0000-4000-8000-000000000042',
  config: '71000000-0000-4000-8000-000000000050',
  // TeamMatchLineupService의 실제 저장 계약(BENCH_MARKER/GOALKEEPER_MARKER sentinel,
  // `started` 컬럼 미사용)을 재현하는 두 번째 게임 — 풋살처럼 사전 골키퍼 코드가 'GK'가
  // 아닌 config로 이 계약이 히스토리 리더에서 올바르게 풀리는지 확인한다.
  futsalTeamMatch: '71000000-0000-4000-8000-000000000060',
  futsalGame: '71000000-0000-4000-8000-000000000061',
  futsalSideA: '71000000-0000-4000-8000-000000000062',
  futsalConfig: '71000000-0000-4000-8000-000000000063',
} as const;

const prisma = new PrismaService();
const history = new TeamLineupHistoryService(prisma);
const presets = new TeamLineupPresetService(prisma);

const authUser = (id: string) => ({
  id,
  email: `${id}@example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

async function captureFailure(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error('Expected operation to fail');
}

function expectHttpCode(error: unknown, status: number, code: string) {
  expect(error).toBeInstanceOf(HttpException);
  const exception = error as HttpException;
  expect(exception.getStatus()).toBe(status);
  expect(exception.getResponse()).toEqual(expect.objectContaining({ code }));
}

describe('팀 스코프 라인업 재사용 (히스토리 · 프리셋 · 고정 등번호)', () => {
  let configId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required');
    }
    await prisma.$connect();
    // 시드에 의존하지 않고 이 스펙 전용 설정을 만든다 — 시드가 있든 없든 같은 결과가
    // 나와야 하고, 골키퍼 코드('GK')를 여기서 직접 정해야 히스토리가 그걸 boolean으로
    // 풀어 주는지 확인할 수 있다.
    const config = await prisma.v1CompetitionConfigVersion.create({
      data: {
        id: ids.config,
        sportCode: 'lineup-reuse-futsal',
        name: 'lineup-reuse-v1',
        version: 1,
        // DB 트리거(v1_validate_competition_config)가 이 JSON들의 모양을 강제한다 —
        // 빈 객체로는 행이 만들어지지 않으므로 최소 유효 형태를 갖춘다.
        periods: [{ code: 'H1', label: '전반', durationMinutes: 20, extraTime: false }],
        events: ['GOAL'],
        lineup: {
          minPlayers: 1,
          maxPlayers: 5,
          substitutions: 'rolling',
          maxSubstitutions: null,
          positions: [
            { code: 'GK', label: '골키퍼', short: 'GK', goalkeeper: true },
            { code: 'FP', label: '필드', short: 'FP' },
          ],
          formations: [],
        },
        result: {
          tournamentScorerPolicy: 'optional',
          teamMatchScorerPolicy: 'optional_with_warning',
          mvpMin: 0,
          mvpMax: 1,
        },
        tieBreak: {
          points: { win: 3, draw: 1, loss: 0 },
          order: ['points', 'head_to_head', 'goal_difference', 'goals_for', 'fair_play', 'seeded_draw'],
          seededDraw: 'sha256-v1',
        },
        visibility: { default: 'live', allowed: ['live', 'official'] },
        contentHash: 'lineup-reuse-content-hash',
      },
    });
    configId = config.id;

    await prisma.v1User.createMany({
      data: [ids.ownerA, ids.managerA, ids.memberA, ids.ownerB].map((id, index) => ({
        id,
        email: `lineup-reuse-${index}@example.test`,
        accountStatus: 'active' as const,
        onboardingStatus: 'completed' as const,
      })),
    });
    await prisma.v1Sport.create({ data: { id: ids.sport, code: 'lineup-reuse-futsal', name: '라인업재사용 풋살' } });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'LINEUP_REUSE_REGION', name: '라인업재사용 지역', level: 1 },
    });

    for (const [teamId, ownerId, name] of [
      [ids.teamA, ids.ownerA, '우리팀'],
      [ids.teamB, ids.ownerB, '상대팀'],
    ] as const) {
      await prisma.v1Team.create({
        data: { id: teamId, name, sportId: ids.sport, regionId: ids.region, ownerUserId: ownerId },
      });
    }
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: ids.teamA, userId: ids.ownerA, role: 'owner', status: 'active' },
        { teamId: ids.teamA, userId: ids.managerA, role: 'manager', status: 'active' },
        { teamId: ids.teamA, userId: ids.memberA, role: 'member', status: 'active' },
        { teamId: ids.teamB, userId: ids.ownerB, role: 'owner', status: 'active' },
      ],
    });

    // 두 팀이 맞붙은 경기 하나. 양쪽 다 라인업을 냈다 — 히스토리가 자기 팀 것만
    // 돌려주는지 확인하려면 상대팀 라인업이 실제로 DB에 있어야 한다.
    await prisma.v1TeamMatch.create({
      data: {
        id: ids.teamMatch,
        hostTeamId: ids.teamA,
        approvedApplicantTeamId: ids.teamB,
        sportId: ids.sport,
        regionId: ids.region,
        status: 'matched',
        title: '라인업 재사용 검증 경기',
        placeName: '검증 풋살장',
        startAt: new Date('2026-08-10T10:00:00.000Z'),
        createdByUserId: ids.ownerA,
        competitionConfigVersionId: configId,
      },
    });
    await prisma.v1Game.create({
      data: {
        id: ids.game,
        sourceType: V1GameSourceType.TEAM_MATCH,
        teamMatchId: ids.teamMatch,
        competitionConfigVersionId: configId,
      },
    });
    await prisma.v1GameSide.createMany({
      data: [
        { id: ids.sideA, gameId: ids.game, sideKey: V1GameSideKey.HOME, teamId: ids.teamA, displayNameSnapshot: '우리팀' },
        { id: ids.sideB, gameId: ids.game, sideKey: V1GameSideKey.AWAY, teamId: ids.teamB, displayNameSnapshot: '상대팀' },
      ],
    });

    // 우리 팀은 revision 1 → 2로 두 번 저장했다. 히스토리는 최신 하나만 보여야 한다.
    for (const [revision, jersey] of [[1, 7], [2, 9]] as const) {
      const lineup = await prisma.v1GameLineup.create({
        data: { gameId: ids.game, sideId: ids.sideA, revision, formation: '2-2' },
      });
      await prisma.v1GameParticipant.create({
        data: {
          gameId: ids.game,
          sideId: ids.sideA,
          lineupId: lineup.id,
          userId: ids.ownerA,
          displayNameSnapshot: '팀장A',
          jerseyNumber: jersey,
          started: true,
        },
      });
    }
    const opponentLineup = await prisma.v1GameLineup.create({
      data: { gameId: ids.game, sideId: ids.sideB, revision: 1 },
    });
    await prisma.v1GameParticipant.create({
      data: {
        gameId: ids.game,
        sideId: ids.sideB,
        lineupId: opponentLineup.id,
        userId: ids.ownerB,
        displayNameSnapshot: '상대팀선수',
        started: true,
      },
    });

    // 풋살처럼 골키퍼 사전 코드가 'GK'가 아닌(config: 'GOLEIRO') 두 번째 팀 매치.
    // TeamMatchLineupService(saveLineup)가 실제로 쓰는 계약을 그대로 재현한다 —
    // started 컬럼은 절대 세팅하지 않고(기본값 true), 골키퍼는 항상 GOALKEEPER_MARKER
    // ('GK') sentinel, 후보는 항상 BENCH_MARKER('BENCH') sentinel로만 구분한다.
    const futsalConfig = await prisma.v1CompetitionConfigVersion.create({
      data: {
        id: ids.futsalConfig,
        sportCode: 'lineup-reuse-futsal-goleiro',
        name: 'lineup-reuse-futsal-v1',
        version: 1,
        periods: [{ code: 'H1', label: '전반', durationMinutes: 20, extraTime: false }],
        events: ['GOAL'],
        lineup: {
          minPlayers: 1,
          maxPlayers: 6,
          substitutions: 'rolling',
          maxSubstitutions: null,
          positions: [
            { code: 'GOLEIRO', label: '골레이로', short: 'GK', goalkeeper: true },
            { code: 'FP', label: '필드', short: 'FP' },
          ],
          formations: [],
        },
        result: {
          tournamentScorerPolicy: 'optional',
          teamMatchScorerPolicy: 'optional_with_warning',
          mvpMin: 0,
          mvpMax: 1,
        },
        tieBreak: {
          points: { win: 3, draw: 1, loss: 0 },
          order: ['points', 'head_to_head', 'goal_difference', 'goals_for', 'fair_play', 'seeded_draw'],
          seededDraw: 'sha256-v1',
        },
        visibility: { default: 'live', allowed: ['live', 'official'] },
        contentHash: 'lineup-reuse-futsal-content-hash',
      },
    });
    await prisma.v1TeamMatch.create({
      data: {
        id: ids.futsalTeamMatch,
        hostTeamId: ids.teamA,
        approvedApplicantTeamId: null,
        sportId: ids.sport,
        regionId: ids.region,
        status: 'matched',
        title: '라인업 재사용 검증 경기 (풋살 GK 코드)',
        placeName: '검증 풋살장 2',
        startAt: new Date('2026-08-11T10:00:00.000Z'),
        createdByUserId: ids.ownerA,
        competitionConfigVersionId: futsalConfig.id,
      },
    });
    await prisma.v1Game.create({
      data: {
        id: ids.futsalGame,
        sourceType: V1GameSourceType.TEAM_MATCH,
        teamMatchId: ids.futsalTeamMatch,
        competitionConfigVersionId: futsalConfig.id,
      },
    });
    await prisma.v1GameSide.create({
      data: {
        id: ids.futsalSideA,
        gameId: ids.futsalGame,
        sideKey: V1GameSideKey.HOME,
        teamId: ids.teamA,
        displayNameSnapshot: '우리팀',
      },
    });
    const futsalLineup = await prisma.v1GameLineup.create({
      data: { gameId: ids.futsalGame, sideId: ids.futsalSideA, revision: 1, formation: '2-2' },
    });
    // TeamMatchLineupService.resolveEntries가 실제로 만드는 세 가지 행 모양을 그대로
    // 재현한다 — started는 어느 행에도 지정하지 않는다(기본값 true).
    await prisma.v1GameParticipant.createMany({
      data: [
        {
          gameId: ids.futsalGame,
          sideId: ids.futsalSideA,
          lineupId: futsalLineup.id,
          userId: ids.ownerA,
          displayNameSnapshot: '팀장A',
          jerseyNumber: 1,
          position: 'GK',
        },
        {
          gameId: ids.futsalGame,
          sideId: ids.futsalSideA,
          lineupId: futsalLineup.id,
          userId: ids.managerA,
          displayNameSnapshot: '매니저A',
          jerseyNumber: 2,
          position: null,
        },
        {
          gameId: ids.futsalGame,
          sideId: ids.futsalSideA,
          lineupId: futsalLineup.id,
          userId: ids.memberA,
          displayNameSnapshot: '멤버A',
          jerseyNumber: 3,
          position: 'BENCH',
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.v1GameParticipant.deleteMany({ where: { gameId: { in: [ids.game, ids.futsalGame] } } });
    await prisma.v1GameLineup.deleteMany({ where: { gameId: { in: [ids.game, ids.futsalGame] } } });
    await prisma.v1GameSide.deleteMany({ where: { gameId: { in: [ids.game, ids.futsalGame] } } });
    await prisma.v1Game.deleteMany({ where: { id: { in: [ids.game, ids.futsalGame] } } });
    await prisma.v1TeamMatch.deleteMany({ where: { id: { in: [ids.teamMatch, ids.futsalTeamMatch] } } });
    await prisma.v1TeamLineupPreset.deleteMany({ where: { teamId: { in: [ids.teamA, ids.teamB] } } });
    await prisma.v1TeamMembership.deleteMany({ where: { teamId: { in: [ids.teamA, ids.teamB] } } });
    await prisma.v1Team.deleteMany({ where: { id: { in: [ids.teamA, ids.teamB] } } });
    await prisma.v1Region.deleteMany({ where: { id: ids.region } });
    await prisma.v1Sport.deleteMany({ where: { id: ids.sport } });
    await prisma.v1CompetitionConfigVersion.deleteMany({ where: { id: { in: [ids.config, ids.futsalConfig] } } });
    await prisma.v1User.deleteMany({
      where: { id: { in: [ids.ownerA, ids.managerA, ids.memberA, ids.ownerB] } },
    });
    await prisma.$disconnect();
  });

  describe('GET /teams/:teamId/lineup-history', () => {
    it('상대팀 라인업은 결과에 들어오지 않는다 — 우리 팀 사이드만 본다', async () => {
      const result = await history.list(authUser(ids.ownerA), ids.teamA, 10);

      const names = result.items.flatMap((item) => item.participants.map((p) => p.displayName));
      expect(names).toContain('팀장A');
      expect(names).not.toContain('상대팀선수');
    });

    it('같은 경기의 옛 revision은 목록에 중복으로 오르지 않는다', async () => {
      const result = await history.list(authUser(ids.ownerA), ids.teamA, 10);

      const forThisGame = result.items.filter((item) => item.gameId === ids.game);
      expect(forThisGame).toHaveLength(1);
      // 최신 revision(등번호 9)이어야 한다 — 옛 revision(7)이 아니라.
      expect(forThisGame[0].participants[0].jerseyNumber).toBe(9);
    });

    it('상대팀 매니저는 우리 팀 히스토리를 볼 수 없다', async () => {
      const error = await captureFailure(() => history.list(authUser(ids.ownerB), ids.teamA, 10));

      expectHttpCode(error, 403, 'PERMISSION_DENIED');
    });

    it('같은 팀이라도 일반 멤버는 볼 수 없다 — 라인업은 관리 권한이 있는 사람의 일이다', async () => {
      const error = await captureFailure(() => history.list(authUser(ids.memberA), ids.teamA, 10));

      expectHttpCode(error, 403, 'PERMISSION_DENIED');
    });

    it('매니저는 팀장과 똑같이 볼 수 있다', async () => {
      const result = await history.list(authUser(ids.managerA), ids.teamA, 10);

      expect(result.items.length).toBeGreaterThan(0);
    });

    it(
      '팀 매치 소스는 started 컬럼이 아니라 position sentinel(BENCH/GK)로 선발·후보·골키퍼를 ' +
        '가른다 — 사전 골키퍼 코드가 GK가 아닌 종목(풋살 GOLEIRO)에서도 GK sentinel로 판정한다',
      async () => {
        const result = await history.list(authUser(ids.ownerA), ids.teamA, 20);
        const item = result.items.find((entry) => entry.gameId === ids.futsalGame);
        if (item === undefined) throw new Error('futsal team-match lineup missing from history');

        // 세 행 모두 DB의 `started` 컬럼은 기본값 true다(TeamMatchLineupService가
        // 절대 세팅하지 않으므로) — 그런데도 position sentinel만으로 선발 2 / 후보 1로
        // 정확히 갈려야 한다. started 컬럼을 그대로 믿었다면 3/0으로 나온다.
        expect(item.starterCount).toBe(2);
        expect(item.benchCount).toBe(1);

        const byName = new Map(item.participants.map((p) => [p.displayName, p]));
        const goalkeeper = byName.get('팀장A');
        const fieldPlayer = byName.get('매니저A');
        const benchPlayer = byName.get('멤버A');
        if (goalkeeper === undefined || fieldPlayer === undefined || benchPlayer === undefined) {
          throw new Error('expected futsal participants missing');
        }

        // 저장된 position은 'GK'(GOALKEEPER_MARKER)인데 이 게임의 사전 골키퍼 코드는
        // 'GOLEIRO'다 — 사전 코드로만 비교했다면 goalkeeper:false로 새고 position:'GK'가
        // 그대로 노출된다.
        expect(goalkeeper).toMatchObject({ goalkeeper: true, position: null, started: true });
        expect(fieldPlayer).toMatchObject({ goalkeeper: false, started: true });
        // 저장된 position은 'BENCH'(BENCH_MARKER)다 — started 컬럼(기본값 true)을
        // 그대로 믿었다면 이 사람도 선발로 나오고, position도 'BENCH' 문자열 그대로
        // 노출된다.
        expect(benchPlayer).toMatchObject({ goalkeeper: false, position: null, started: false });
      },
    );
  });

  describe('라인업 프리셋', () => {
    afterEach(async () => {
      await prisma.v1TeamLineupPreset.deleteMany({ where: { teamId: { in: [ids.teamA, ids.teamB] } } });
    });

    const entries = [{ displayName: '팀장A', userId: ids.ownerA, started: true, goalkeeper: true, jerseyNumber: 1 }];

    it('저장한 프리셋을 그대로 다시 읽는다', async () => {
      await presets.create(authUser(ids.ownerA), ids.teamA, { name: '주전 2-2', formation: '2-2', entries });
      const list = await presets.list(authUser(ids.ownerA), ids.teamA);

      expect(list.items).toHaveLength(1);
      expect(list.items[0]).toMatchObject({ name: '주전 2-2', formation: '2-2', starterCount: 1 });
      expect(list.items[0].entries[0]).toMatchObject({ userId: ids.ownerA, goalkeeper: true, jerseyNumber: 1 });
    });

    it('같은 이름으로 또 만들면 막는다 — 덮어쓰기는 수정으로만', async () => {
      await presets.create(authUser(ids.ownerA), ids.teamA, { name: '주전', entries });
      const error = await captureFailure(() =>
        presets.create(authUser(ids.ownerA), ids.teamA, { name: '주전', entries }),
      );

      expectHttpCode(error, 409, 'LINEUP_PRESET_NAME_TAKEN');
    });

    it('팀당 10개까지만 저장할 수 있다', async () => {
      for (let index = 0; index < 10; index += 1) {
        await presets.create(authUser(ids.ownerA), ids.teamA, { name: `프리셋${index}`, entries });
      }
      const error = await captureFailure(() =>
        presets.create(authUser(ids.ownerA), ids.teamA, { name: '열한번째', entries }),
      );

      expectHttpCode(error, 422, 'LINEUP_PRESET_LIMIT_EXCEEDED');
    });

    it('수정하면 엔트리가 통째로 교체된다', async () => {
      const created = await presets.create(authUser(ids.ownerA), ids.teamA, { name: '주전', entries });
      await presets.update(authUser(ids.ownerA), ids.teamA, created.presetId, {
        entries: [
          { displayName: '매니저A', userId: ids.managerA, started: true, goalkeeper: false },
          { displayName: '게스트', started: false, goalkeeper: false },
        ],
      });
      const list = await presets.list(authUser(ids.ownerA), ids.teamA);

      expect(list.items[0].entries.map((entry) => entry.displayName)).toEqual(['매니저A', '게스트']);
      expect(list.items[0]).toMatchObject({ starterCount: 1, benchCount: 1 });
    });

    it('다른 팀의 프리셋은 id를 알아도 건드릴 수 없다', async () => {
      const mine = await presets.create(authUser(ids.ownerA), ids.teamA, { name: '주전', entries });
      const error = await captureFailure(() =>
        presets.update(authUser(ids.ownerB), ids.teamB, mine.presetId, { name: '가로채기' }),
      );

      expectHttpCode(error, 404, 'LINEUP_PRESET_NOT_FOUND');
    });

    it('일반 멤버는 프리셋을 만들 수 없다', async () => {
      const error = await captureFailure(() =>
        presets.create(authUser(ids.memberA), ids.teamA, { name: '멤버가만든것', entries }),
      );

      expectHttpCode(error, 403, 'PERMISSION_DENIED');
    });
  });

  describe('팀 고정 등번호', () => {
    const teams = new TeamsService(prisma, { create: async () => undefined } as unknown as NotificationsService);

    afterEach(async () => {
      // updateMany로 한 번에 밀지 않는다 — 이 컬럼에는 (teamId, jerseyNumber) 부분
      // 유니크가 걸려 있어 타입 수준에서 updateMany 입력이 거부된다. 행마다 지운다.
      const rows = await prisma.v1TeamMembership.findMany({
        where: { teamId: ids.teamA },
        select: { id: true },
      });
      for (const row of rows) {
        await prisma.v1TeamMembership.update({ where: { id: row.id }, data: { jerseyNumber: null } });
      }
    });

    async function membershipIdOf(userId: string): Promise<string> {
      const membership = await prisma.v1TeamMembership.findFirstOrThrow({
        where: { teamId: ids.teamA, userId },
        select: { id: true },
      });
      return membership.id;
    }

    it('등번호를 지정하고 해제할 수 있다', async () => {
      const membershipId = await membershipIdOf(ids.memberA);

      const assigned = await teams.changeMembershipJersey(authUser(ids.ownerA), membershipId, { jerseyNumber: 7 });
      expect(assigned.jerseyNumber).toBe(7);

      const cleared = await teams.changeMembershipJersey(authUser(ids.ownerA), membershipId, { jerseyNumber: null });
      expect(cleared.jerseyNumber).toBeNull();
    });

    it('한 팀에서 같은 번호를 두 사람이 가질 수 없다', async () => {
      await teams.changeMembershipJersey(authUser(ids.ownerA), await membershipIdOf(ids.memberA), { jerseyNumber: 10 });
      const managerMembershipId = await membershipIdOf(ids.managerA);
      const error = await captureFailure(() =>
        teams.changeMembershipJersey(authUser(ids.ownerA), managerMembershipId, { jerseyNumber: 10 }),
      );

      expectHttpCode(error, 409, 'TEAM_JERSEY_NUMBER_TAKEN');
    });

    it('번호를 지정하지 않은 팀원은 여럿이어도 서로 부딪히지 않는다', async () => {
      // NULL을 서로 다른 값으로 취급하는 Postgres 부분 유니크 동작을 실제로 확인한다 —
      // 이게 깨지면 두 번째 팀원부터 등번호를 비워둘 수 없게 된다.
      await teams.changeMembershipJersey(authUser(ids.ownerA), await membershipIdOf(ids.memberA), { jerseyNumber: null });
      const result = await teams.changeMembershipJersey(authUser(ids.ownerA), await membershipIdOf(ids.managerA), {
        jerseyNumber: null,
      });

      expect(result.jerseyNumber).toBeNull();
    });

    it('일반 멤버는 남의 등번호를 바꿀 수 없다', async () => {
      const managerMembershipId = await membershipIdOf(ids.managerA);
      const error = await captureFailure(() =>
        teams.changeMembershipJersey(authUser(ids.memberA), managerMembershipId, { jerseyNumber: 3 }),
      );

      expectHttpCode(error, 403, 'PERMISSION_DENIED');
    });

    it('매니저는 팀장의 등번호도 정할 수 있다 — 등번호는 권한 계층과 무관하다', async () => {
      const result = await teams.changeMembershipJersey(authUser(ids.managerA), await membershipIdOf(ids.ownerA), {
        jerseyNumber: 1,
      });

      expect(result.jerseyNumber).toBe(1);
    });
  });
});
