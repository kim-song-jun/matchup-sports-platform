import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GamesService } from '../../src/games/games.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { TournamentBracketService } from '../../src/tournaments/tournament-bracket.service';
import { assignSlotsBatchInTx, TournamentSlotService } from '../../src/tournaments/slots/tournament-slot.service';
import { lockCompetitionForBracketMutationInTx } from '../../src/tournaments/slots/competition-bracket-lock';
import { BracketTemplateService } from '../../src/tournaments/templates/bracket-template.service';
import { competitionConfigFixture as ids, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';
import { seedBracketTournament, seedSupportAdmin } from '../helpers/bracket-canvas-fixture';

jest.setTimeout(120_000);
const prisma = new PrismaService();
const user = { id: ids.adminUserId, email: 'empty-template@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const context = new AdminContextService(prisma);
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const bracket = new TournamentBracketService(prisma, context, games);
const slots = new TournamentSlotService(prisma, context, games);
const templates = new BracketTemplateService(prisma, context, games);
async function seeded(label: string) {
  const data = await seedBracketTournament(prisma, { label, format: 'group_knockout', teamCount: 8 });
  await templates.apply(user, data.tournamentId, { kind: 'group_knockout', groupCount: 2, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: false });
  const entries = await prisma.v1TournamentSlot.findMany({ where: { tournamentId: data.tournamentId, kind: 'ENTRY' }, orderBy: { position: 'asc' } });
  for (const [i, slot] of entries.entries()) await slots.assignSlot(user, slot.id, data.registrationIds[i]);
  return { ...data, entries: await prisma.v1TournamentSlot.findMany({ where: { tournamentId: data.tournamentId, kind: 'ENTRY' }, orderBy: { position: 'asc' } }) };
}
async function deleteFixtures(tournamentId: string) {
  // Downstream first, like the production template replacement path.
  for (;;) {
    const rows = await prisma.v1TournamentMatchDetails.findMany({ where: { tournamentId, teamMatch: { deletedAt: null } }, include: { advancementSources: true } });
    if (rows.length === 0) return;
    const leaf = rows.find(row => row.advancementSources.length === 0)!;
    await bracket.deleteFixture(user, leaf.teamMatchId);
  }
}

describe('경기를 모두 삭제한 템플릿 조 정리 (PostgreSQL)', () => {
  beforeAll(async () => { await prisma.$connect(); await seedCompetitionConfigFixture(prisma, user); });
  afterAll(async () => { await prisma.$disconnect(); });
  it('연결 경기0인 ENTRY를 비우면 편성/순위를 해제하고 빈 조 및 빈 결선 조도 삭제한다', async () => {
    const { tournamentId, entries } = await seeded('empty-template');
    await deleteFixtures(tournamentId);
    for (const slot of entries) await slots.assignSlot(user, slot.id, null);
    expect(await prisma.v1TournamentGroupTeam.count({ where: { group: { tournamentId } } })).toBe(0);
    expect(await prisma.v1TournamentStanding.count({ where: { group: { tournamentId } } })).toBe(0);
    for (const group of await prisma.v1TournamentGroup.findMany({ where: { tournamentId } })) await bracket.deleteGroup(user, group.id);
    expect(await prisma.v1TournamentGroup.count({ where: { tournamentId } })).toBe(0);
    expect(await prisma.v1TournamentSlot.count({ where: { tournamentId } })).toBe(0);
    expect(await prisma.v1TournamentRegistration.count({ where: { tournamentId, status: 'confirmed' } })).toBe(8);
  });
  it('기존 버그로 ENTRY는 이미 미정인데 편성이 남은 조도 삭제하고 다른 조 배정은 보존한다', async () => {
    const { tournamentId, entries } = await seeded('old-orphan');
    await bracket.recalculateStandings(user, tournamentId);
    await deleteFixtures(tournamentId);
    const groupId = entries[0].groupId!;
    // Reproduce already-persisted production drift, not a new application mutation route.
    await prisma.v1TournamentSlot.updateMany({ where: { groupId, kind: 'ENTRY' }, data: { registrationId: null } });
    const other = await prisma.v1TournamentGroupTeam.findMany({ where: { group: { tournamentId }, groupId: { not: groupId } }, orderBy: { id: 'asc' } });
    await expect(bracket.deleteGroup(user, groupId)).resolves.toEqual({ deleted: true });
    expect(await prisma.v1TournamentGroupTeam.count({ where: { groupId } })).toBe(0);
    expect(await prisma.v1TournamentGroupTeam.findMany({ where: { group: { tournamentId }, groupId: { not: groupId } }, orderBy: { id: 'asc' } })).toEqual(other);
    expect(await prisma.v1TournamentSlot.count({ where: { OR: [{ groupId }, { sourceGroupId: groupId }] } })).toBe(0);
    expect(await prisma.v1TournamentOverallStanding.count({ where: { tournamentId } })).toBe(4);
  });
  it('남은 경기·팀 배정·다른 조 결선 참조·수동 편성과 support 권한은 여전히 보호한다', async () => {
    const { tournamentId, entries, registrationIds } = await seeded('protected-template');
    const groupId = entries[0].groupId!;
    const support = await seedSupportAdmin(prisma, 'empty-template-support');
    await expect(bracket.deleteGroup(support, groupId)).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    await expect(bracket.deleteGroup(user, groupId)).rejects.toMatchObject({ response: { code: 'GROUP_HAS_TEAMS' } });
    // Clear group assignments while knockout fixtures still reference its rank slots.
    for (const slot of entries.filter(s => s.groupId === groupId)) await slots.assignSlot(user, slot.id, null);
    const groupFixtures = await prisma.v1TournamentMatchDetails.findMany({ where: { groupId } });
    for (const row of groupFixtures) await bracket.deleteFixture(user, row.teamMatchId);
    await expect(bracket.deleteGroup(user, groupId)).rejects.toMatchObject({ response: { code: 'GROUP_HAS_SLOTS' } });
    const ranks = await prisma.v1TournamentSlot.findMany({ where: { sourceGroupId: groupId }, select: { id: true } });
    await prisma.v1TeamMatch.updateMany({ where: { OR: [{ homeSlotId: { in: ranks.map(s => s.id) } }, { awaySlotId: { in: ranks.map(s => s.id) } }] }, data: { status: 'cancelled' } });
    await expect(bracket.deleteGroup(user, groupId)).rejects.toMatchObject({ response: { code: 'GROUP_HAS_SLOTS' } });
    expect(await prisma.v1TournamentGroup.findUnique({ where: { id: groupId } })).not.toBeNull();
    const manual = await bracket.createGroup(user, tournamentId, { name: '수동 조', phase: 'quarter' });
    await bracket.createGroupTeam(user, tournamentId, { groupId: manual.id, registrationId: registrationIds[0] });
    await expect(bracket.deleteGroup(user, manual.id)).rejects.toMatchObject({ response: { code: 'GROUP_HAS_TEAMS' } });
  });
  it('경기0인 두 조의 자리를 맞바꿔도 최종 자리와 조 편성이 일치한다', async () => {
    const { tournamentId, entries } = await seeded('empty-swap');
    await bracket.recalculateStandings(user, tournamentId);
    await deleteFixtures(tournamentId);
    const home = entries[0], away = entries.find(s => s.groupId !== home.groupId)!;
    await prisma.$transaction(async tx => {
      await lockCompetitionForBracketMutationInTx(tx, { id: tournamentId, kind: 'regular_tournament' });
      const admin = await context.getMutationAdmin(user.id, tx);
      await assignSlotsBatchInTx(tx, { admin, adminContext: context, games }, [
        { slotId: home.id, registrationId: away.registrationId }, { slotId: away.id, registrationId: home.registrationId },
      ]);
    }, { timeout: 45_000 });
    for (const groupId of new Set(entries.map(s => s.groupId!))) {
      const placed = await prisma.v1TournamentSlot.findMany({ where: { groupId, kind: 'ENTRY' } });
      const members = await prisma.v1TournamentGroupTeam.findMany({ where: { groupId } });
      expect(members.map(m => m.registrationId).sort()).toEqual(placed.map(s => s.registrationId).sort());
    }
  });
  it('고아 편성 정리 뒤 자리 삭제가 실패하면 조·편성·순위·자리 모두 롤백된다', async () => {
    const { tournamentId, entries } = await seeded('cleanup-rollback');
    await bracket.recalculateStandings(user, tournamentId);
    await deleteFixtures(tournamentId);
    const groupId = entries[0].groupId!;
    await prisma.v1TournamentSlot.updateMany({ where: { groupId, kind: 'ENTRY' }, data: { registrationId: null } });
    const beforeTeams = await prisma.v1TournamentGroupTeam.count({ where: { groupId } });
    const beforeStandings = await prisma.v1TournamentStanding.count({ where: { groupId } });
    const beforeSlots = await prisma.v1TournamentSlot.count({ where: { groupId } });
    await prisma.$executeRawUnsafe(`CREATE FUNCTION empty_template_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'empty template test failure'; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER empty_template_test_failure BEFORE DELETE ON v1_tournament_slots FOR EACH ROW WHEN (OLD.group_id = '${groupId}') EXECUTE FUNCTION empty_template_test_failure()`);
    try {
      await expect(bracket.deleteGroup(user, groupId)).rejects.toThrow('empty template test failure');
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER empty_template_test_failure ON v1_tournament_slots');
      await prisma.$executeRawUnsafe('DROP FUNCTION empty_template_test_failure()');
    }
    expect(await prisma.v1TournamentGroup.findUnique({ where: { id: groupId } })).not.toBeNull();
    expect(await prisma.v1TournamentGroupTeam.count({ where: { groupId } })).toBe(beforeTeams);
    expect(await prisma.v1TournamentStanding.count({ where: { groupId } })).toBe(beforeStandings);
    expect(await prisma.v1TournamentSlot.count({ where: { groupId } })).toBe(beforeSlots);
  });
});
