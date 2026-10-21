import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GamesService } from '../../src/games/games.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { BracketTemplateService } from '../../src/tournaments/templates/bracket-template.service';
import { TournamentSlotService } from '../../src/tournaments/slots/tournament-slot.service';
import { compareCrossGroupTeams } from '../../src/tournaments/slots/cross-group-round12-plan';
import { runTournamentStandingsRecalculation } from '../../src/tournaments/tournament-standings-recalculation';
import { competitionConfigFixture as ids, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';
import { seedBracketTournament, seedSupportAdmin } from '../helpers/bracket-canvas-fixture';

jest.setTimeout(120_000);
const prisma = new PrismaService();
const user = { id: ids.adminUserId, email: 'cross-group@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const adminContext = new AdminContextService(prisma);
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const templates = new BracketTemplateService(prisma, adminContext, games);
const slots = new TournamentSlotService(prisma, adminContext, games);

async function settledTournament(label: string, direct = false) {
  const seeded = await seedBracketTournament(prisma, { label, format: 'group_knockout', teamCount: 20 });
  await templates.apply(user, seeded.tournamentId, { kind: 'group_knockout', groupCount: 5, teamsPerGroup: 4,
    advancePerGroup: 2, legs: 1, thirdPlace: false, qualificationMode: 'cross_group_round12' });
  const entries = await prisma.v1TournamentSlot.findMany({ where: { tournamentId: seeded.tournamentId, kind: 'ENTRY' },
    orderBy: [{ groupId: 'asc' }, { position: 'asc' }] });
  for (const [index, slot] of entries.entries()) await slots.assignSlot(user, slot.id, seeded.registrationIds[index]);
  const fixtures = await prisma.v1TournamentMatchDetails.findMany({ where: { tournamentId: seeded.tournamentId,
    group: { phase: 'group' } }, include: { teamMatch: { include: { game: true } } } });
  for (const fixture of fixtures) {
    const home = entries.findIndex((entry) => entry.id === fixture.teamMatch.homeSlotId);
    const away = entries.findIndex((entry) => entry.id === fixture.teamMatch.awaySlotId);
    const homeRank = home % 4, awayRank = away % 4, group = Math.floor(home / 4);
    const score = homeRank < awayRank ? { home: 4 - homeRank + group, away: 0 } : { home: 0, away: 4 - awayRank + group };
    const game = fixture.teamMatch.game!;
    const revision = await prisma.v1GameResultRevision.create({ data: {
      gameId: game.id, revision: 1, state: 'DRAFT', score, eventsHash: `round12-${game.id}`,
      createdByActorType: 'SYSTEM', createdBySystemActor: 'TEST_FIXTURE',
    } });
    await prisma.v1GameResultRevision.update({ where: { id: revision.id }, data: { state: 'OFFICIAL', officialAt: new Date('2026-01-01T00:00:00Z') } });
    await prisma.v1Game.update({ where: { id: game.id }, data: { state: 'ENDED', currentOfficialRevisionId: revision.id } });
    await prisma.v1TeamMatch.update({ where: { id: fixture.teamMatchId }, data: { status: 'completed' } });
  }
  if (direct) {
    // 목록에서 직접 만든 것처럼 결선의 자리 링크만 제거한다. 경기·진출 연결·부전승은 실제 저장 형태다.
    const targetSlots = await prisma.v1TournamentSlot.findMany({ where: { tournamentId: seeded.tournamentId, kind: { in: ['BYE', 'GROUP_RANK'] } } });
    for (const slot of targetSlots) {
      await prisma.v1TeamMatch.updateMany({ where: { homeSlotId: slot.id }, data: { homeSlotId: null } });
      await prisma.v1TeamMatch.updateMany({ where: { awaySlotId: slot.id }, data: { awaySlotId: null } });
      await prisma.v1TournamentSlot.delete({ where: { id: slot.id } });
    }
  }
  expect((await runTournamentStandingsRecalculation(prisma)).quarantine).toEqual([]);
  return seeded;
}

async function selection(tournamentId: string) {
  const preview = await slots.round12Preview(user, tournamentId);
  const rankPicks = preview.ranks.map((rank) => {
    expect(rank.candidates).toHaveLength(1);
    return rank.candidates[0];
  });
  const teams = new Map(preview.teams.map((team) => [team.registrationId, team]));
  const rankingOrder = [1, 2, 3].flatMap((rank) => rankPicks.filter((_, index) => preview.ranks[index].rank === rank)
    .sort((a, b) => compareCrossGroupTeams(teams.get(a)!, teams.get(b)!)));
  return { preview, input: { version: preview.version, rankPicks, rankingOrder, assignments: rankingOrder.slice(0, 12), reason: '통합 테스트 진출팀 배정' } };
}

describe('5조·20팀→12강 실제 저장 계약', () => {
  beforeAll(async () => { await prisma.$connect(); await seedCompetitionConfigFixture(prisma, user); });
  afterAll(async () => { await prisma.$disconnect(); });
  it.each([false, true])('슬롯 없는 수동 대진=%s에서도 12팀·부전승4·8강직행을 저장하고 교환한다', async (direct) => {
    const { tournamentId } = await settledTournament(`round12-${direct}`, direct);
    const { preview, input } = await selection(tournamentId);
    await slots.round12Apply(user, tournamentId, input);
    const saved = await slots.round12Preview(user, tournamentId);
    expect(saved.targets.map((target) => target.currentRegistrationId)).toEqual(input.assignments);
    expect(await prisma.v1TournamentGroupTeam.count({ where: { group: { tournamentId }, isBye: true } })).toBe(4);
    expect(await prisma.v1TournamentByeSlot.count({ where: { group: { tournamentId } } })).toBe(0);
    expect(await prisma.v1TournamentSlot.count({ where: { tournamentId, kind: 'ENTRY', registrationId: { not: null } } })).toBe(20);
    for (const target of saved.targets) {
      const fixture = await prisma.v1TournamentMatchDetails.findUniqueOrThrow({ where: { teamMatchId: target.fixtureId } });
      expect(target.side === 'HOME' ? fixture.homeRegistrationId : fixture.awayRegistrationId).toBe(input.assignments[target.seed - 1]);
    }
    const bad = { ...input, version: saved.version, assignments: [...input.assignments] };
    bad.assignments[11] = bad.assignments[0];
    await expect(slots.round12Apply(user, tournamentId, bad)).rejects.toMatchObject({ response: { code: 'ROUND12_SELECTION_INVALID' } });
    expect((await slots.round12Preview(user, tournamentId)).targets.map((target) => target.currentRegistrationId)).toEqual(input.assignments);
    const swapped = { ...input, version: saved.version, assignments: [...input.assignments] };
    [swapped.assignments[0], swapped.assignments[1]] = [swapped.assignments[1], swapped.assignments[0]];
    await slots.round12Apply(user, tournamentId, swapped);
    expect((await slots.round12Preview(user, tournamentId)).targets.map((target) => target.currentRegistrationId)).toEqual(swapped.assignments);
    await expect(slots.round12Apply(user, tournamentId, { ...input, version: preview.version })).rejects.toMatchObject({ response: { code: 'ROUND12_PREVIEW_STALE' } });
    const started = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: saved.targets[4].fixtureId }, select: { game: { select: { id: true } } } });
    await prisma.v1Game.update({ where: { id: started.game!.id }, data: { state: 'LIVE' } });
    await expect(slots.round12Apply(user, tournamentId, swapped)).rejects.toMatchObject({ response: { code: 'ROUND12_NOT_READY' } });
    const stillAssigned = await prisma.v1TournamentMatchDetails.findUniqueOrThrow({ where: { teamMatchId: saved.targets[0].fixtureId } });
    expect(saved.targets[0].side === 'HOME' ? stillAssigned.homeRegistrationId : stillAssigned.awayRegistrationId).toBe(swapped.assignments[0]);
  });
  it.each([false, true])('공통 수동 배정도 슬롯 없는 대진=%s의 부전승과 8강 직행을 유지한다', async (direct) => {
    const { tournamentId } = await settledTournament(`general-round12-${direct}`, direct);
    const preview = await slots.finalistPreview(user, tournamentId);
    expect(preview.blockedReason).toBeNull(); expect(preview.targets).toHaveLength(12);
    expect(preview.targets.filter((target) => target.byePosition !== null)).toHaveLength(4);
    const teamIds = preview.groups.flatMap((group) => group.teams.map((team) => team.registrationId)).slice(0, 12);
    await slots.finalistApply(user, tournamentId, { version: preview.version, reason: '공통 배정 부전승 보존',
      assignments: preview.targets.map((target, i) => ({ fixtureId: target.fixtureId, side: target.side, registrationId: teamIds[i] })) });
    expect((await slots.finalistPreview(user, tournamentId)).targets.map((target) => target.currentRegistrationId)).toEqual(teamIds);
    expect(await prisma.v1TournamentGroupTeam.count({ where: { group: { tournamentId }, isBye: true } })).toBe(4);
    expect(await prisma.v1TournamentSlot.count({ where: { tournamentId, kind: 'BYE', registrationId: { not: null } } })).toBe(4);
  });
  it('support 쓰기를 막고 미확정 조별 결과가 있으면 배정하지 않는다', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'unsettled', format: 'group_knockout', teamCount: 20 });
    await templates.apply(user, tournamentId, { kind: 'group_knockout', groupCount: 5, teamsPerGroup: 4, advancePerGroup: 2,
      legs: 1, thirdPlace: false, qualificationMode: 'cross_group_round12' });
    const filled = await slots.randomFill(user, tournamentId);
    expect(filled.assignments).toHaveLength(20);
    expect(await prisma.v1TournamentSlot.count({ where: { tournamentId, kind: 'ENTRY', registrationId: { not: null } } })).toBe(20);
    expect(await prisma.v1TournamentSlot.count({ where: { tournamentId, kind: { in: ['BYE', 'GROUP_RANK'] }, registrationId: { not: null } } })).toBe(0);
    expect((await slots.randomFill(user, tournamentId)).assignments).toEqual([]);
    await expect(slots.round12Preview(user, tournamentId)).rejects.toMatchObject({ response: { code: 'ROUND12_NOT_READY' } });
    const support = await seedSupportAdmin(prisma, 'round12-support');
    await expect(slots.round12Apply(support, tournamentId, { version: 'a'.repeat(64), rankPicks: [], rankingOrder: [], assignments: [], reason: '권한 대조군' }))
      .rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
  });
});
