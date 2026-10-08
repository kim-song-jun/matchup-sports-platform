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

describe('조별리그 경기와 조 편성 정합 (PostgreSQL)', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await seedCompetitionConfigFixture(prisma, user);
    groupB = (await bracket.createGroup(user, ids.tournamentId, { name: 'B조', phase: 'group' })).id;
    groupFinal = (await bracket.createGroup(user, ids.tournamentId, { name: '결승', phase: 'final' })).id;
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it('편성 안 된 팀으로 조 경기를 만들면 편성되고, 이미 편성된 팀은 중복 행 없이 그대로다', async () => {
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
      const groupABefore = await prisma.v1TournamentGroupTeam.findMany({ where: { groupId: ids.groupId }, orderBy: { sortOrder: 'asc' } });

      await runBackfill();
      const afterFirst = await teamsOf(groupB);
      expect(afterFirst.map((team) => team.registrationId)).toEqual([reg0, reg1, reg2]);
      expect(afterFirst.map((team) => team.sortOrder)).toEqual([0, 1, 2]);

      // 이미 편성된 A조는 행 id·순서까지 그대로, 결선 조는 비어 있다.
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
  });
});
