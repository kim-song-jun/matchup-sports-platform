import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GamesService } from '../../src/games/games.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { TournamentStaffAccessService } from '../../src/tournaments/staff/tournament-staff-access.service';
import { BracketTemplateService } from '../../src/tournaments/templates/bracket-template.service';
import { TournamentSlotService } from '../../src/tournaments/slots/tournament-slot.service';
import { TournamentBracketService } from '../../src/tournaments/tournament-bracket.service';
import { TOURNAMENT_DETAIL_INCLUDE } from '../../src/tournaments/tournaments-read.query';
import { presentTournamentDetail } from '../../src/tournaments/tournament-detail.presenter';
import { runTournamentStandingsRecalculation } from '../../src/tournaments/tournament-standings-recalculation';
import { loadGroupStandingSummaries } from '../../src/tournaments/slots/load-group-rank-preview';
import { competitionConfigFixture as ids, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';
import { seedBracketTournament } from '../helpers/bracket-canvas-fixture';
import type { ApplyBracketTemplateDto } from '../../src/tournaments/templates/dto/bracket-template.dto';

jest.setTimeout(120_000);
const prisma = new PrismaService();
const user = { id: ids.adminUserId, email: 'flexible@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const admin = new AdminContextService(prisma);
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService(), new TournamentStaffAccessService(prisma));
const templates = new BracketTemplateService(prisma, admin, games);
const slots = new TournamentSlotService(prisma, admin, games);
const oldFlag = process.env.V1_FLEXIBLE_BRACKETS_ENABLED;
async function publicDetail(tournamentId: string) {
  const row = await prisma.v1Tournament.findUniqueOrThrow({ where: { id: tournamentId }, include: TOURNAMENT_DETAIL_INCLUDE });
  return presentTournamentDetail(row, true, new Date(), false, [], new Map(), await loadGroupStandingSummaries(prisma, tournamentId));
}

describe('짝수 대진 실제 저장과 조별 진출', () => {
  beforeAll(async () => { process.env.V1_FLEXIBLE_BRACKETS_ENABLED = 'true'; await prisma.$connect(); await seedCompetitionConfigFixture(prisma, user); });
  afterAll(async () => { await prisma.$disconnect(); if (oldFlag === undefined) delete process.env.V1_FLEXIBLE_BRACKETS_ENABLED; else process.env.V1_FLEXIBLE_BRACKETS_ENABLED = oldFlag; });

  it('조별 1·2회전을 초안과 실제 경기의 회전 번호·홈원정에 반영한다', async () => {
    const { tournamentId, registrationIds } = await seedBracketTournament(prisma, { label: 'mixed-group-legs', format: 'group_knockout', teamCount: 6 });
    const input: ApplyBracketTemplateDto = { schemaVersion: 2, kind: 'group_knockout', participantCount: 6, drawSeed: 7, registrationIds,
      groups: [{ name: 'A조', capacity: 3, advanceCount: 1, legs: 1 }, { name: 'B조', capacity: 3, advanceCount: 1, legs: 2 }] };
    await templates.saveDraft(user, tournamentId, { ...input, expectedRevision: 0 });
    expect(await templates.draft(user, tournamentId)).toMatchObject({ input: { groups: input.groups }, revision: 1 });
    const preview = await templates.preview(user, tournamentId, input);
    expect(preview.counts.fixtures).toBe(10);
    await templates.apply(user, tournamentId, { ...input, previewHash: preview.previewHash, requestId: 'mixed-group-legs-request' });
    const fixtures = await prisma.v1TournamentMatchDetails.findMany({ where: { tournamentId }, include: { group: true } });
    expect(fixtures).toHaveLength(10);
    const first = fixtures.filter(row => row.group?.name === 'A조');
    const second = fixtures.filter(row => row.group?.name === 'B조');
    expect(first).toHaveLength(3);
    expect(first.every(row => row.legNumber === 1)).toBe(true);
    expect(second.filter(row => row.legNumber === 1)).toHaveLength(3);
    expect(second.filter(row => row.legNumber === 2)).toHaveLength(3);
    for (const fixture of second) expect(second).toEqual(expect.arrayContaining([
      expect.objectContaining({ homeRegistrationId: fixture.awayRegistrationId, awayRegistrationId: fixture.homeRegistrationId }),
    ]));
  });

  it('10팀: 두 부전승이 만나는 경기까지 배정하고 중복 동시 요청은 한 번만 생성한다', async () => {
    const seeded = await seedBracketTournament(prisma, { label: 'flex10', format: 'knockout', teamCount: 10 });
    const input: ApplyBracketTemplateDto = { schemaVersion: 2, kind: 'knockout', size: 10, participantCount: 10,
      drawSeed: 7, seedPolicy: 'seeded', registrationIds: seeded.registrationIds };
    const preview = await templates.preview(user, seeded.tournamentId, input);
    const request = { ...input, previewHash: preview.previewHash, requestId: 'ten-request' };
    const result = await Promise.all([templates.apply(user, seeded.tournamentId, request), templates.apply(user, seeded.tournamentId, request)]);
    expect(result[0]).toEqual(preview.counts); expect(result[1]).toEqual(preview.counts);
    const fixtures = await prisma.v1TournamentMatchDetails.findMany({ where: { tournamentId: seeded.tournamentId }, include: { group: true, teamMatch: { include: { homeSlot: true, awaySlot: true, game: { include: { sides: true } } } } } });
    expect(fixtures).toHaveLength(9);
    const doubleByes = fixtures.filter(row => row.teamMatch.homeSlot?.kind === 'BYE' && row.teamMatch.awaySlot?.kind === 'BYE');
    expect(doubleByes).toHaveLength(2);
    for (const row of doubleByes) {
      expect(row.homeRegistrationId).not.toBeNull(); expect(row.awayRegistrationId).not.toBeNull();
      expect(row.teamMatch.game!.sides.every(side => side.teamId !== null)).toBe(true);
    }
    expect(await prisma.v1Game.count({ where: { teamMatch: { tournamentId: seeded.tournamentId } } })).toBe(9);
    expect(await prisma.v1TournamentGroupTeam.count({ where: { group: { tournamentId: seeded.tournamentId }, isBye: true } })).toBe(6);
    expect(await templates.requestStatus(user, seeded.tournamentId, request.requestId)).toMatchObject({ completed: true });
  });

  it('14팀 5·5·4조에서 2·2·1팀이 진출하고 순위 부전승도 공개 연결과 파란 표시 데이터를 유지한다', async () => {
    const seeded = await seedBracketTournament(prisma, { label: 'flex14', format: 'group_knockout', teamCount: 14 });
    const input: ApplyBracketTemplateDto = { schemaVersion: 2, kind: 'group_knockout', participantCount: 14, legs: 1, drawSeed: 12,
      groups: [5, 5, 4].map((capacity, i) => ({ name: `${i}조`, capacity, advanceCount: i === 2 ? 1 : 2 })), registrationIds: seeded.registrationIds };
    const preview = await templates.preview(user, seeded.tournamentId, input);
    await templates.apply(user, seeded.tournamentId, { ...input, previewHash: preview.previewHash, requestId: 'fourteen-request', acknowledgeRematches: true });
    expect(preview.counts.fixtures).toBe(30);
    await prisma.v1Tournament.update({ where: { id: seeded.tournamentId }, data: { bracketPublishedAt: new Date() } });
    const byeSlot = await prisma.v1TournamentSlot.findFirstOrThrow({ where: { tournamentId: seeded.tournamentId, kind: 'GROUP_RANK', byeSortOrder: { not: null } } });
    const byeTarget = await prisma.v1TeamMatch.findFirstOrThrow({ where: { OR: [{ homeSlotId: byeSlot.id }, { awaySlotId: byeSlot.id }] } });
    const bracket = new TournamentBracketService(prisma, admin, games);
    const labelKey = byeTarget.homeSlotId === byeSlot.id ? 'homeDisplayLabel' : 'awayDisplayLabel';
    await bracket.updateFixture(user, byeTarget.id, { [labelKey]: '조 1위 직행' });
    expect((await bracket.getBracket(user, seeded.tournamentId)).fixtures.find(row => row.id === byeTarget.id)?.[labelKey]).toBe('조 1위 직행');
    const empty = await publicDetail(seeded.tournamentId);
    const byes = empty.groups.flatMap(group => group.groupTeams.filter(team => team.isBye));
    expect(byes).toHaveLength(3); expect(byes.every(bye => bye.byeTarget !== null)).toBe(true);
    expect(byes.find(bye => bye.byeTarget?.fixtureId === byeTarget.id)?.displayLabel).toBe('조 1위 직행');
    const groupFixtures = await prisma.v1TournamentMatchDetails.findMany({ where: { tournamentId: seeded.tournamentId, group: { phase: 'group' } }, include: { teamMatch: { include: { game: true } } } });
    for (const fixture of groupFixtures) {
      const game = fixture.teamMatch.game!;
      const homeWins = seeded.registrationIds.indexOf(fixture.homeRegistrationId!) < seeded.registrationIds.indexOf(fixture.awayRegistrationId!);
      const revision = await prisma.v1GameResultRevision.create({ data: { gameId: game.id, revision: 1, state: 'DRAFT',
        score: { home: homeWins ? 1 : 0, away: homeWins ? 0 : 1 }, eventsHash: `flexible-${game.id}`, createdByActorType: 'SYSTEM', createdBySystemActor: 'TEST_FIXTURE' } });
      await prisma.v1GameResultRevision.update({ where: { id: revision.id }, data: { state: 'OFFICIAL', officialAt: new Date('2026-01-01T00:00:00Z') } });
      await prisma.v1Game.update({ where: { id: game.id }, data: { state: 'ENDED', currentOfficialRevisionId: revision.id } });
      await prisma.v1TeamMatch.update({ where: { id: fixture.teamMatchId }, data: { status: 'completed' } });
    }
    expect((await runTournamentStandingsRecalculation(prisma)).quarantine).toEqual([]);
    const finalists = await slots.finalistPreview(user, seeded.tournamentId);
    expect(finalists.blockedReason).toBeNull(); expect(finalists.targets).toHaveLength(5);
    const assignments = finalists.targets.map(target => {
      const rank = finalists.groups.find(group => group.id === target.sourceGroupId)!.ranks.find(row => row.rank === target.sourceRank)!;
      if (rank.state !== 'ready') throw new Error('Expected settled source rank');
      return { fixtureId: target.fixtureId, side: target.side, registrationId: rank.registrationId };
    });
    await slots.finalistApply(user, seeded.tournamentId, { version: finalists.version, reason: '조별 공식 순위로 배정', assignments });
    const saved = await publicDetail(seeded.tournamentId);
    expect(saved.groups.flatMap(group => group.qualification?.advancingRegistrationIds ?? []).sort()).toEqual(assignments.map(row => row.registrationId).sort());
    const rankSlots = await prisma.v1TournamentSlot.findMany({ where: { tournamentId: seeded.tournamentId, kind: 'GROUP_RANK' } });
    expect(rankSlots).toHaveLength(5); expect(rankSlots.every(slot => slot.sourceGroupId && slot.registrationId)).toBe(true);
    expect(rankSlots.filter(slot => slot.byeSortOrder !== null)).toHaveLength(3);
    // Existing manual brackets without advanceCount still report the actually placed qualifiers.
    await prisma.v1TournamentGroup.updateMany({ where: { tournamentId: seeded.tournamentId, phase: 'group' }, data: { advanceCount: null } });
    const manual = await publicDetail(seeded.tournamentId);
    expect(manual.groups.flatMap(group => group.qualification?.advancingRegistrationIds ?? []).sort()).toEqual(assignments.map(row => row.registrationId).sort());
  });

  it('오래된 미리보기와 초안은 저장하지 않는다', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'flex-stale', format: 'knockout', teamCount: 0 });
    const input: ApplyBracketTemplateDto = { schemaVersion: 2, kind: 'knockout', size: 18, participantCount: 18 };
    const p = await templates.preview(user, tournamentId, input);
    await templates.saveDraft(user, tournamentId, { ...input, expectedRevision: 0 });
    await expect(templates.saveDraft(user, tournamentId, { ...input, expectedRevision: 0 })).rejects.toMatchObject({ response: { code: 'BRACKET_DRAFT_STALE' } });
    await prisma.v1TournamentGroup.create({ data: { tournamentId, name: '수동 조', phase: 'round32' } });
    await expect(templates.apply(user, tournamentId, { ...input, previewHash: p.previewHash, requestId: 'stale' })).rejects.toMatchObject({ response: { code: 'BRACKET_PREVIEW_STALE' } });
    expect(await prisma.v1TournamentMatchDetails.count({ where: { tournamentId } })).toBe(0);
  });
  it('상한 64팀·8조·3위전의 240경기를 원자적으로 생성한다', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'flex-limit', format: 'group_knockout', teamCount: 0 });
    const input: ApplyBracketTemplateDto = { schemaVersion: 2, kind: 'group_knockout', participantCount: 64, legs: 1, thirdPlace: true,
      groups: Array.from({ length: 8 }, (_, i) => ({ name: `${i}조`, capacity: 8, advanceCount: 2 })), drawSeed: 42 };
    const preview = await templates.preview(user, tournamentId, input);
    expect(preview.counts.fixtures).toBe(240);
    await expect(templates.apply(user, tournamentId, { ...input, previewHash: preview.previewHash, requestId: 'limit', acknowledgeRematches: true })).resolves.toEqual(preview.counts);
    expect(await prisma.v1Game.count({ where: { teamMatch: { tournamentId } } })).toBe(240);
    const started = await prisma.v1TournamentMatchDetails.findMany({ where: { tournamentId }, select: { fixtureNumber: true }, orderBy: { fixtureNumber: 'asc' } });
    expect(started.map(row => row.fixtureNumber)).toEqual(Array.from({ length: 240 }, (_, i) => i + 1));
  });
});
