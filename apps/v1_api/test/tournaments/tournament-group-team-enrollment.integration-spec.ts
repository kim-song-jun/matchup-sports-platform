import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GamesService } from '../../src/games/games.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { TournamentBracketService } from '../../src/tournaments/tournament-bracket.service';
import { competitionConfigFixture as ids, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';

const prisma = new PrismaService();
const user = { id: ids.adminUserId, email: 'group-team-enrollment@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const bracket = new TournamentBracketService(prisma, new AdminContextService(prisma), games);

const [reg0, reg1, reg2, reg3] = ids.registrationIds;
let groupB: string;
let groupFinal: string;

const teamsOf = async (groupId: string) =>
  (await prisma.v1TournamentGroupTeam.findMany({ where: { groupId }, orderBy: { sortOrder: 'asc' } }))
    .map(({ registrationId, sortOrder }) => ({ registrationId, sortOrder }));

/** 조별 단계 편성에서 이 팀을 뗀다 — 시드 A조의 팀을 다른 조에 넣는 테스트의 명시적 준비. */
const detach = (...registrationIds: string[]) =>
  prisma.v1TournamentGroupTeam.deleteMany({ where: { registrationId: { in: registrationIds }, group: { tournamentId: ids.tournamentId, phase: 'group' } } });

/** 시드 상태 복원 — A조에 4팀, 다른 조별 조의 편성은 없음. 앞 테스트가 만든 편성에 기대는 테스트 앞에서 부른다. */
const restoreSeedStage = async () => {
  await prisma.v1TournamentGroupTeam.deleteMany({ where: { groupId: { not: ids.groupId }, group: { tournamentId: ids.tournamentId, phase: 'group' } } });
  const have = new Set((await teamsOf(ids.groupId)).map((team) => team.registrationId));
  const missing = ids.registrationIds.map((registrationId, sortOrder) => ({ groupId: ids.groupId, registrationId, sortOrder })).filter((row) => !have.has(row.registrationId));
  if (missing.length > 0) await prisma.v1TournamentGroupTeam.createMany({ data: missing });
};

describe('조별리그 경기와 조 편성 정합 (PostgreSQL)', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await seedCompetitionConfigFixture(prisma, user);
    groupB = (await bracket.createGroup(user, ids.tournamentId, { name: 'B조', phase: 'group' })).id;
    groupFinal = (await bracket.createGroup(user, ids.tournamentId, { name: '결승', phase: 'final' })).id;
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it('편성 안 된 팀으로 조 경기를 만들면 편성되고, 이미 편성된 팀은 중복 행 없이 그대로다', async () => {
    await detach(reg0, reg1, reg2);
    await bracket.createFixture(user, ids.tournamentId, {
      groupId: groupB, round: 'B조 1라운드', fixtureNumber: 101, homeRegistrationId: reg0, awayRegistrationId: reg1,
    });
    expect(await teamsOf(groupB)).toEqual([{ registrationId: reg0, sortOrder: 0 }, { registrationId: reg1, sortOrder: 1 }]);

    await bracket.createFixture(user, ids.tournamentId, {
      groupId: groupB, round: 'B조 2라운드', fixtureNumber: 102, homeRegistrationId: reg0, awayRegistrationId: reg2,
    });
    expect(await teamsOf(groupB)).toEqual([
      { registrationId: reg0, sortOrder: 0 }, { registrationId: reg1, sortOrder: 1 }, { registrationId: reg2, sortOrder: 2 },
    ]);
  });

  it('결선 단계 조의 경기와 조 없는 경기는 조 편성을 건드리지 않는다', async () => {
    await bracket.createFixture(user, ids.tournamentId, {
      groupId: groupFinal, round: '결승', fixtureNumber: 201, homeRegistrationId: reg0, awayRegistrationId: reg1,
    });
    await bracket.createFixture(user, ids.tournamentId, {
      round: '3·4위전', fixtureNumber: 202, homeRegistrationId: reg2, awayRegistrationId: reg3,
    });
    expect(await teamsOf(groupFinal)).toEqual([]);
    expect(await prisma.v1TournamentGroupTeam.count({ where: { registrationId: reg3 } })).toBe(1); // A조 기존 편성뿐
  });

  it('경기가 남은 팀의 편성 해제는 409, 경기 없는 팀은 해제된다', async () => {
    await detach(reg3);
    const busy = await prisma.v1TournamentGroupTeam.findFirstOrThrow({ where: { groupId: groupB, registrationId: reg1 } });
    await expect(bracket.removeGroupTeam(user, busy.id)).rejects.toMatchObject({ response: { code: 'GROUP_TEAM_HAS_FIXTURES' } });
    expect(await prisma.v1TournamentGroupTeam.count({ where: { id: busy.id } })).toBe(1);

    const idle = await bracket.createGroupTeam(user, ids.tournamentId, { groupId: groupB, registrationId: reg3 });
    await expect(bracket.removeGroupTeam(user, idle.id)).resolves.toEqual({ deleted: true });
    expect(await prisma.v1TournamentGroupTeam.count({ where: { id: idle.id } })).toBe(0);
  });

  describe('데이터 보정 마이그레이션', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../prisma/migrations/20261008120000_v1_group_team_backfill_for_fixtures/migration.sql'),
      'utf8',
    );
    const statements = sql.replace(/^\s*--.*$/gm, '').split(';').map((s) => s.trim()).filter((s) => s && !['BEGIN', 'COMMIT'].includes(s));
    const runBackfill = () => prisma.$transaction(async (tx) => {
      for (const statement of statements) await tx.$executeRawUnsafe(statement);
    });

    it('편성이 빠진 조만 채우고 이미 편성된 조·결선 조·삭제된 경기는 그대로이며 두 번 돌려도 같다', async () => {
      // B조: 경기는 있는데 편성이 사라진 상태. reg3 의 유일한 경기는 삭제 처리한다.
      await prisma.v1TournamentGroupTeam.deleteMany({ where: { groupId: groupB } });
      const lone = await bracket.createFixture(user, ids.tournamentId, {
        groupId: groupB, round: 'B조 3라운드', fixtureNumber: 103, homeRegistrationId: reg3, awayRegistrationId: reg0,
      });
      await prisma.v1TournamentGroupTeam.deleteMany({ where: { groupId: groupB } });
      await prisma.v1TeamMatch.update({ where: { id: lone.id }, data: { deletedAt: new Date() } });
      // reg3 는 이제 삭제된 경기에만 남는다. reg0 은 살아 있는 B조 경기(101,102)에도 있어 채워진다.
      await restoreSeedStage();
      const groupABefore = await prisma.v1TournamentGroupTeam.findMany({ where: { groupId: ids.groupId }, orderBy: { sortOrder: 'asc' } });

      await runBackfill();
      const afterFirst = await teamsOf(groupB);
      expect(afterFirst.map((team) => team.registrationId)).toEqual([reg0, reg1, reg2]);
      expect(afterFirst.map((team) => team.sortOrder)).toEqual([0, 1, 2]);

      // 이미 편성된 A조는 행 id·순서까지 그대로, 결선 조는 비어 있다.
      expect(groupABefore).toHaveLength(4);
      expect(await prisma.v1TournamentGroupTeam.findMany({ where: { groupId: ids.groupId }, orderBy: { sortOrder: 'asc' } })).toEqual(groupABefore);
      expect(await teamsOf(groupFinal)).toEqual([]);

      await runBackfill();
      expect(await teamsOf(groupB)).toEqual(afterFirst);
    });

    it('일부만 편성된 조는 빠진 팀만 뒤에 붙이고 기존 행은 건드리지 않는다', async () => {
      const kept = await prisma.v1TournamentGroupTeam.findFirstOrThrow({ where: { groupId: groupB, registrationId: reg1 } });
      await prisma.v1TournamentGroupTeam.deleteMany({ where: { groupId: groupB, registrationId: { in: [reg0, reg2] } } });

      await runBackfill();

      expect(await prisma.v1TournamentGroupTeam.findUniqueOrThrow({ where: { id: kept.id } })).toEqual(kept);
      const teams = await teamsOf(groupB);
      expect(teams.map((team) => team.registrationId)).toEqual([reg1, reg0, reg2]);
      expect(teams.map((team) => team.sortOrder)).toEqual([1, 2, 3]);
    });

    it('확정이 아닌 신청의 팀은 편성하지 않는다', async () => {
      await restoreSeedStage();
      await detach(reg1, reg2);
      const groupD = (await bracket.createGroup(user, ids.tournamentId, { name: 'D조', phase: 'group' })).id;
      await bracket.createFixture(user, ids.tournamentId, {
        groupId: groupD, round: 'D조 1라운드', fixtureNumber: 111, homeRegistrationId: reg1, awayRegistrationId: reg2,
      });
      await prisma.v1TournamentGroupTeam.deleteMany({ where: { groupId: groupD } });
      await prisma.v1TournamentRegistration.update({ where: { id: reg1 }, data: { status: 'cancelled' } });
      try {
        await runBackfill();
      } finally {
        await prisma.v1TournamentRegistration.update({ where: { id: reg1 }, data: { status: 'confirmed' } });
      }
      expect((await teamsOf(groupD)).map((team) => team.registrationId)).toEqual([reg2]);
    });

    it('정규 리그(kind=regular_league) 대회의 조 경기는 편성하지 않는다', async () => {
      await restoreSeedStage();
      await detach(reg0, reg2);
      const groupE = (await bracket.createGroup(user, ids.tournamentId, { name: 'E조', phase: 'group' })).id;
      await bracket.createFixture(user, ids.tournamentId, {
        groupId: groupE, round: 'E조 1라운드', fixtureNumber: 112, homeRegistrationId: reg0, awayRegistrationId: reg2,
      });
      await prisma.v1TournamentGroupTeam.deleteMany({ where: { groupId: groupE } });
      await prisma.v1Tournament.update({ where: { id: ids.tournamentId }, data: { kind: 'regular_league' } });
      try {
        await runBackfill();
      } finally {
        await prisma.v1Tournament.update({ where: { id: ids.tournamentId }, data: { kind: 'regular_tournament' } });
      }
      expect(await teamsOf(groupE)).toEqual([]);
    });
  });
  describe('자동 편성과 순위 행', () => {
    const standingsOf = async (groupId: string) =>
      (await prisma.v1TournamentStanding.findMany({ where: { groupId }, orderBy: { registrationId: 'asc' } }))
        .map(({ registrationId, points, wins, draws, losses, goalsFor, goalsAgainst, fairPlayPoints, position }) => (
          { registrationId, points, wins, draws, losses, goalsFor, goalsAgainst, fairPlayPoints, position }));

    it('순위 행이 없는 조는 자동 편성해도 순위 행을 만들지 않는다 (공개 화면이 0값 기준선을 내린다)', async () => {
      await restoreSeedStage();
      await detach(reg0, reg1);
      const groupC = (await bracket.createGroup(user, ids.tournamentId, { name: 'C조', phase: 'group' })).id;
      await bracket.createFixture(user, ids.tournamentId, {
        groupId: groupC, round: 'C조 1라운드', fixtureNumber: 121, homeRegistrationId: reg0, awayRegistrationId: reg1,
      });
      expect((await teamsOf(groupC)).map((team) => team.registrationId)).toEqual([reg0, reg1]);
      expect(await prisma.v1TournamentStanding.count({ where: { groupId: groupC } })).toBe(0);
    });

    it('순위 행이 있는 조에 팀이 자동 편성되면 그 팀의 순위 행이 같은 요청에서 생기고 기존 팀 값은 그대로다', async () => {
      await restoreSeedStage();
      await bracket.recalculateStandings(user, ids.tournamentId);
      const before = await standingsOf(ids.groupId);
      expect(before).toHaveLength(4);
      expect(before.some((row) => row.points > 0)).toBe(true);

      // reg3 의 편성과 순위 행을 지운 상태에서 reg3 가 들어간 새 경기를 만든다.
      await prisma.v1TournamentStanding.deleteMany({ where: { groupId: ids.groupId, registrationId: reg3 } });
      await prisma.v1TournamentGroupTeam.deleteMany({ where: { groupId: ids.groupId, registrationId: reg3 } });
      await bracket.createFixture(user, ids.tournamentId, {
        groupId: ids.groupId, round: 'A조 추가', fixtureNumber: 131, homeRegistrationId: reg3, awayRegistrationId: reg0,
      });

      expect(await teamsOf(ids.groupId)).toHaveLength(4);
      const after = await standingsOf(ids.groupId);
      expect(after.map((row) => row.registrationId)).toEqual(before.map((row) => row.registrationId));
      expect(after.find((row) => row.registrationId === reg3)).toEqual(before.find((row) => row.registrationId === reg3));
      expect(after.filter((row) => row.registrationId !== reg3)).toEqual(before.filter((row) => row.registrationId !== reg3));
    });
  });

  describe('한 팀 한 조 (결정 4) — 서버가 지킨다', () => {
    let groupC: string;
    let groupD: string;
    const createIn = (groupId: string, home: string | undefined, away: string | undefined, fixtureNumber: number) =>
      bracket.createFixture(user, ids.tournamentId, { groupId, round: `한팀한조 ${fixtureNumber}`, fixtureNumber, homeRegistrationId: home, awayRegistrationId: away });

    beforeAll(async () => {
      groupC = (await bracket.createGroup(user, ids.tournamentId, { name: '한팀한조 C조', phase: 'group' })).id;
      groupD = (await bracket.createGroup(user, ids.tournamentId, { name: '한팀한조 D조', phase: 'group' })).id;
    });
    beforeEach(() => detach(reg0, reg1, reg2, reg3)); // 모든 조별 조에서 뗀다 — 앞 블록이 남긴 B·C·D·E 편성 포함

    it('다른 조별 조에 편성된 팀으로 만들면 409 TEAM_IN_OTHER_GROUP 이고 경기도 편성도 생기지 않는다', async () => {
      await bracket.createGroupTeam(user, ids.tournamentId, { groupId: groupC, registrationId: reg0 });

      await expect(createIn(groupD, reg0, reg1, 301)).rejects.toMatchObject({ response: { code: 'TEAM_IN_OTHER_GROUP' } });

      expect(await teamsOf(groupD)).toEqual([]); // 상대 팀 reg1 도 편성되지 않았다
      expect(await prisma.v1TournamentMatchDetails.count({ where: { groupId: groupD } })).toBe(0);
    });

    it('같은 조에 편성된 팀은 허용되고, 어느 조에도 없는 상대 팀은 자동 편성된다 (대조군)', async () => {
      await bracket.createGroupTeam(user, ids.tournamentId, { groupId: groupC, registrationId: reg0 });

      await createIn(groupC, reg0, reg1, 302);

      expect((await teamsOf(groupC)).map((team) => team.registrationId)).toEqual([reg0, reg1]);
    });

    it('이미 두 조에 겹친 옛 데이터의 팀도 편성된 그 조 경기에는 계속 넣을 수 있다', async () => {
      // 게이트 이전에 생긴 겹침을 SQL 로 재현한다(서비스는 이제 만들지 못한다).
      await prisma.v1TournamentGroupTeam.createMany({ data: [
        { groupId: groupC, registrationId: reg2, sortOrder: 0 },
        { groupId: groupD, registrationId: reg2, sortOrder: 0 },
      ] });

      await expect(createIn(groupC, reg2, reg3, 303)).resolves.toBeDefined();

      expect(await prisma.v1TournamentGroupTeam.count({ where: { registrationId: reg2, group: { phase: 'group', tournamentId: ids.tournamentId } } })).toBe(2);
    });

    it('PATCH 로 다른 조 팀을 넣으면 409 이고 경기는 비어 있는 채다, 편성 안 된 팀은 들어가 자동 편성된다', async () => {
      await bracket.createGroupTeam(user, ids.tournamentId, { groupId: groupC, registrationId: reg0 });
      const fixture = await createIn(groupD, undefined, undefined, 304);

      await expect(bracket.updateFixture(user, fixture.id, { homeRegistrationId: reg0 })).rejects.toMatchObject({ response: { code: 'TEAM_IN_OTHER_GROUP' } });
      expect((await prisma.v1TournamentMatchDetails.findUniqueOrThrow({ where: { teamMatchId: fixture.id } })).homeRegistrationId).toBeNull();

      await bracket.updateFixture(user, fixture.id, { homeRegistrationId: reg1 });
      expect((await teamsOf(groupD)).map((team) => team.registrationId)).toEqual([reg1]);
    });

    it('목록 화면의 조 팀 배정도 다른 조 팀은 409, 결선 단계 조는 그대로 받는다', async () => {
      await bracket.createGroupTeam(user, ids.tournamentId, { groupId: groupC, registrationId: reg0 });

      await expect(bracket.createGroupTeam(user, ids.tournamentId, { groupId: groupD, registrationId: reg0 }))
        .rejects.toMatchObject({ response: { code: 'TEAM_IN_OTHER_GROUP' } });
      await expect(bracket.createGroupTeam(user, ids.tournamentId, { groupId: groupFinal, registrationId: reg0 })).resolves.toBeDefined();
    });
  });
});
