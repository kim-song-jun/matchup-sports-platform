import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GamesService } from '../../src/games/games.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { TournamentStaffAccessService } from '../../src/tournaments/staff/tournament-staff-access.service';
import { TournamentBracketService } from '../../src/tournaments/tournament-bracket.service';
import { BracketTemplateService } from '../../src/tournaments/templates/bracket-template.service';
import { MultiFinalsService } from '../../src/tournaments/multi-finals/multi-finals.service';
import { ScheduleTimesService } from '../../src/tournaments/scheduling/schedule-times.service';
import { TournamentOperationsFieldsService } from '../../src/tournament-operations/fields/tournament-operations-fields.service';
import { competitionConfigFixture as ids, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';
import { seedBracketTournament } from '../helpers/bracket-canvas-fixture';

jest.setTimeout(120_000);
const prisma = new PrismaService();
const user = { id: ids.adminUserId, email: 'assignment-edit@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const admins = new AdminContextService(prisma);
const access = new TournamentStaffAccessService(prisma);
const auditWriter = new OperationAuditWriterService();
const games = new GamesService(prisma, auditWriter, new GameTakeoverService(), access);
const bracket = new TournamentBracketService(prisma, admins, games);
const multiFinals = new MultiFinalsService(prisma, admins, games, new BracketTemplateService(prisma, admins, games));
const times = new ScheduleTimesService(prisma, admins);
const fields = new TournamentOperationsFieldsService(prisma, access, auditWriter);
const original = '2026-12-20T01:00:00.000Z';
const moved = '2026-12-20T02:00:00.000Z';

async function fixtureGroup(label: string) {
  const seeded = await seedBracketTournament(prisma, { label, format: 'league', teamCount: 4 });
  await prisma.v1Tournament.update({ where: { id: seeded.tournamentId }, data: { format: 'league_knockouts', teamCount: 4 } });
  await multiFinals.setup(user, seeded.tournamentId, { expectedRevision: 0,
    groups: [0, 1].map(i => ({ name: `${i + 1}조`, capacity: 2, legs: 1 as const, registrationIds: seeded.registrationIds.slice(i * 2, i * 2 + 2) })),
    finals: [{ name: '챔피언', thirdPlace: false, rules: [{ groupId: '0', rank: 1 }, { groupId: '1', rank: 1 }], registrationIds: null }],
  });
  const fixtureIds = (await prisma.v1TournamentMatchDetails.findMany({ where: { tournamentId: seeded.tournamentId }, orderBy: { teamMatchId: 'asc' } })).map(row => row.teamMatchId);
  expect(fixtureIds).toHaveLength(2);
  for (const fixtureId of fixtureIds) {
    await bracket.updateFixture(user, fixtureId, {
      scheduledAt: original,
      venue: `${label} A구장`, venueAddress: '보존할 주소', venueLatitude: 37.5, venueLongitude: 127,
    });
  }
  const { item } = await times.create(user, seeded.tournamentId, { scheduledAt: original });
  return { ...seeded, fixtureIds, scheduleTimeId: item.id };
}

describe('등록 시간·구장 수정 (PostgreSQL)', () => {
  beforeAll(async () => { await prisma.$connect(); await seedCompetitionConfigFixture(prisma, user); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('moves real games/team calendars and renames assigned courts without losing their pins or IDs', async () => {
    const { tournamentId, fixtureIds, scheduleTimeId } = await fixtureGroup('assignment-edit-preserve');
    const before = await prisma.v1TeamMatch.findMany({ where: { id: { in: fixtureIds } }, orderBy: { id: 'asc' } });
    const preset = (await times.list(user, tournamentId)).items[0];
    const result = await times.update(user, tournamentId, { expectedScheduleTimeId: scheduleTimeId, expectedScheduledAt: original, scheduledAt: moved });
    expect(result).toMatchObject({ affectedFixtureCount: 2, item: { id: preset.id } });
    const after = await prisma.v1TeamMatch.findMany({ where: { id: { in: fixtureIds } }, orderBy: { id: 'asc' } });
    for (let index = 0; index < after.length; index++) {
      expect(after[index].startAt?.toISOString()).toBe(moved);
      expect(after[index].endAt!.getTime() - after[index].startAt!.getTime()).toBe(before[index].endAt!.getTime() - before[index].startAt!.getTime());
      expect(after[index]).toMatchObject({ fieldId: before[index].fieldId, placeName: before[index].placeName,
        placeAddress: '보존할 주소', placeLatitude: 37.5, placeLongitude: 127, hostTeamId: before[index].hostTeamId, approvedApplicantTeamId: before[index].approvedApplicantTeamId });
    }
    const schedules = await prisma.v1TeamSchedule.findMany({ where: { teamMatchId: { in: fixtureIds }, state: 'SCHEDULED' } });
    expect(schedules).toHaveLength(4);
    expect(schedules.every(row => row.startAt.toISOString() === moved)).toBe(true);
    const field = await prisma.v1TournamentField.findUniqueOrThrow({ where: { id: before[0].fieldId! } });
    await fields.update(user.id, tournamentId, field.id, { expectedVersion: field.version, name: '수정된 A구장', syncAssignedFixtures: true }, { requestId: 'assignment-rename-pin-preservation' });
    const renamed = await prisma.v1TeamMatch.findMany({ where: { id: { in: fixtureIds } } });
    expect(renamed).toHaveLength(2);
    for (const row of renamed) expect(row).toMatchObject({ fieldId: field.id, placeName: '수정된 A구장',
      placeAddress: '보존할 주소', placeLatitude: 37.5, placeLongitude: 127, startAt: new Date(moved) });
    await expect(fields.update(user.id, tournamentId, field.id, { expectedVersion: field.version, name: '오래된 수정', syncAssignedFixtures: true }, { requestId: 'assignment-rename-stale' }))
      .rejects.toMatchObject({ response: { code: 'STALE_FIELD_VERSION' } });
    expect(await prisma.v1TeamMatch.count({ where: { id: { in: fixtureIds }, placeName: '수정된 A구장' } })).toBe(2);
  });

  it('rolls games, team calendars and the preset back if the final audit fails, then blocks a started game', async () => {
    const { tournamentId, fixtureIds, scheduleTimeId } = await fixtureGroup('assignment-edit-rollback');
    const audit = jest.spyOn(admins, 'logAdminAction').mockRejectedValueOnce(new Error('audit write failed'));
    try {
      await expect(times.update(user, tournamentId, { expectedScheduleTimeId: scheduleTimeId, expectedScheduledAt: original, scheduledAt: moved })).rejects.toThrow('audit write failed');
    } finally { audit.mockRestore(); }
    expect(await prisma.v1TeamMatch.count({ where: { id: { in: fixtureIds }, startAt: new Date(original) } })).toBe(2);
    expect((await times.list(user, tournamentId)).items.map(row => row.scheduledAt.toISOString())).toEqual([original]);
    const schedules = await prisma.v1TeamSchedule.findMany({ where: { teamMatchId: { in: fixtureIds }, state: 'SCHEDULED' } });
    expect(schedules).toHaveLength(4); expect(schedules.every(row => row.startAt.toISOString() === original)).toBe(true);
    await prisma.v1Game.update({ where: { teamMatchId: fixtureIds[1] }, data: { state: 'LIVE' } });
    await expect(times.update(user, tournamentId, { expectedScheduleTimeId: scheduleTimeId, expectedScheduledAt: original, scheduledAt: moved }))
      .rejects.toMatchObject({ response: { code: 'SCHEDULE_TIME_FIXTURE_STARTED' } });
    expect(await prisma.v1TeamMatch.count({ where: { id: { in: fixtureIds }, startAt: new Date(original) } })).toBe(2);
  });
});
