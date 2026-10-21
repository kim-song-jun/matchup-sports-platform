import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GamesService } from '../../src/games/games.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { TournamentSlotService } from '../../src/tournaments/slots/tournament-slot.service';
import { TournamentBracketService } from '../../src/tournaments/tournament-bracket.service';
import { runTournamentStandingsRecalculation } from '../../src/tournaments/tournament-standings-recalculation';
import { competitionConfigFixture as ids, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';
import { seedBracketTournament, seedSupportAdmin } from '../helpers/bracket-canvas-fixture';

jest.setTimeout(120_000);
const prisma = new PrismaService();
const user = { id: ids.adminUserId, email: 'finalists@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const adminContext = new AdminContextService(prisma);
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const slots = new TournamentSlotService(prisma, adminContext, games);
const bracket = new TournamentBracketService(prisma, adminContext, games);

async function settledManual(label: string, sizes: number[]) {
  const seeded = await seedBracketTournament(prisma, { label, format: 'group_knockout', teamCount: sizes.reduce((a, b) => a + b, 0) });
  let offset = 0, number = 1;
  for (const [index, size] of sizes.entries()) {
    const group = await bracket.createGroup(user, seeded.tournamentId, { name: `${index}조`, phase: 'group', advanceCount: 2, sortOrder: index });
    const regs = seeded.registrationIds.slice(offset, offset + size); offset += size;
    for (let home = 0; home < regs.length; home += 1) for (let away = home + 1; away < regs.length; away += 1) {
      const fixture = await bracket.createFixture(user, seeded.tournamentId, { groupId: group.id, round: '조별', fixtureNumber: number++, homeRegistrationId: regs[home], awayRegistrationId: regs[away] });
      const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId: fixture.id } });
      const revision = await prisma.v1GameResultRevision.create({ data: { gameId: game.id, revision: 1, state: 'DRAFT', score: { home: 1, away: 0 }, eventsHash: `finalist-${game.id}`, createdByActorType: 'SYSTEM', createdBySystemActor: 'TEST_FIXTURE' } });
      await prisma.v1GameResultRevision.update({ where: { id: revision.id }, data: { state: 'OFFICIAL', officialAt: new Date('2026-01-01T00:00:00Z') } });
      await prisma.v1Game.update({ where: { id: game.id }, data: { state: 'ENDED', currentOfficialRevisionId: revision.id } });
      await prisma.v1TeamMatch.update({ where: { id: fixture.id }, data: { status: 'completed' } });
    }
  }
  const quarter = await bracket.createGroup(user, seeded.tournamentId, { name: '8강', phase: 'quarter', sortOrder: 4 });
  const fixtureIds: string[] = [];
  for (let i = 0; i < 4; i += 1) {
    const fixture = await bracket.createFixture(user, seeded.tournamentId, { groupId: quarter.id, round: '8강', fixtureNumber: number++ }); fixtureIds.push(fixture.id);
  }
  expect((await runTournamentStandingsRecalculation(prisma)).quarantine).toEqual([]);
  return { ...seeded, fixtureIds };
}

describe('수동 결선 진출팀 실제 저장 계약', () => {
  beforeAll(async () => { await prisma.$connect(); await seedCompetitionConfigFixture(prisma, user); });
  afterAll(async () => { await prisma.$disconnect(); });
  it.each([[4, 4, 3, 3], [4, 4, 4, 3]])('불균등 %j조에서 기존 수동 8강을 채우고 교환하며 원본 순위는 보존한다', async (...sizes) => {
    const { tournamentId, fixtureIds } = await settledManual(`manual-finalist-${sizes.join('-')}`, sizes);
    const before = await prisma.v1TournamentStanding.findMany({ where: { group: { tournamentId, phase: 'group' } }, orderBy: { id: 'asc' } });
    const preview = await slots.finalistPreview(user, tournamentId);
    expect(preview.blockedReason).toBeNull(); expect(preview.targets).toHaveLength(8);
    const selected = preview.groups.flatMap((group) => group.teams.slice(0, 2).map((team) => team.registrationId));
    const input = { version: preview.version, reason: '불균등 조 진출 확인', assignments: preview.targets.map((target, i) => ({ fixtureId: target.fixtureId, side: target.side, registrationId: selected[i] })) };
    await slots.finalistApply(user, tournamentId, input);
    const saved = await slots.finalistPreview(user, tournamentId);
    expect(saved.targets.map((target) => target.currentRegistrationId)).toEqual(selected);
    for (const [index, id] of fixtureIds.entries()) {
      const fixture = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id }, include: { tournamentDetails: true, game: { include: { sides: true } } } });
      expect([fixture.tournamentDetails!.homeRegistrationId, fixture.tournamentDetails!.awayRegistrationId]).toEqual(selected.slice(index * 2, index * 2 + 2));
      expect(fixture.game!.sides.every((side) => side.teamId !== null)).toBe(true);
    }
    const swapped = { ...input, version: saved.version, assignments: input.assignments.map((row) => ({ ...row })) };
    [swapped.assignments[0].registrationId, swapped.assignments[1].registrationId] = [swapped.assignments[1].registrationId, swapped.assignments[0].registrationId];
    await slots.finalistApply(user, tournamentId, swapped);
    expect((await slots.finalistPreview(user, tournamentId)).targets.map((target) => target.currentRegistrationId)).toEqual(swapped.assignments.map((row) => row.registrationId));
    expect(await prisma.v1TournamentStanding.findMany({ where: { group: { tournamentId, phase: 'group' } }, orderBy: { id: 'asc' } })).toEqual(before);
    // DB가 채우기 도중 실패해도 앞서 비운/채운 자리까지 모두 롤백해야 한다.
    const beforeFailure = await slots.finalistPreview(user, tournamentId);
    await prisma.$executeRawUnsafe(`CREATE FUNCTION finalist_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'finalist test write failure'; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER finalist_test_failure BEFORE UPDATE ON v1_tournament_slots FOR EACH ROW WHEN (NEW.kind = 'GROUP_RANK' AND NEW.position = 8 AND OLD.registration_id IS NULL AND NEW.registration_id IS NOT NULL) EXECUTE FUNCTION finalist_test_failure()`);
    const failing = { ...swapped, version: beforeFailure.version, assignments: swapped.assignments.map((row) => ({ ...row })) };
    [failing.assignments[6].registrationId, failing.assignments[7].registrationId] = [failing.assignments[7].registrationId, failing.assignments[6].registrationId];
    try {
      await expect(slots.finalistApply(user, tournamentId, failing)).rejects.toThrow('finalist test write failure');
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER finalist_test_failure ON v1_tournament_slots');
      await prisma.$executeRawUnsafe('DROP FUNCTION finalist_test_failure()');
    }
    expect((await slots.finalistPreview(user, tournamentId)).targets).toEqual(beforeFailure.targets);
    await expect(slots.finalistApply(user, tournamentId, input)).rejects.toMatchObject({ response: { code: 'FINALIST_PREVIEW_STALE' } });
    const support = await seedSupportAdmin(prisma, `finalist-support-${sizes.join('-')}`);
    await expect(slots.finalistApply(support, tournamentId, swapped)).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    const current = await slots.finalistPreview(user, tournamentId);
    const invalid = { ...swapped, version: current.version, assignments: swapped.assignments.map((row) => ({ ...row })) };
    invalid.assignments[7].registrationId = invalid.assignments[0].registrationId;
    await expect(slots.finalistApply(user, tournamentId, invalid)).rejects.toMatchObject({ response: { code: 'FINALIST_ASSIGNMENT_INVALID' } });
    expect((await slots.finalistPreview(user, tournamentId)).targets).toEqual(current.targets);
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId: fixtureIds[0] } });
    await prisma.v1Game.update({ where: { id: game.id }, data: { state: 'LIVE' } });
    const started = await slots.finalistPreview(user, tournamentId);
    await expect(slots.finalistApply(user, tournamentId, { ...swapped, version: started.version })).rejects.toMatchObject({ response: { code: 'FINALIST_NOT_READY' } });
  });
});
