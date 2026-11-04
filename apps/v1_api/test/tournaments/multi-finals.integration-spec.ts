import { TOURNAMENT_DETAIL_INCLUDE } from '../../src/tournaments/tournaments-read.query';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GamesService } from '../../src/games/games.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { TournamentStaffAccessService } from '../../src/tournaments/staff/tournament-staff-access.service';
import { BracketTemplateService } from '../../src/tournaments/templates/bracket-template.service';
import { MultiFinalsService } from '../../src/tournaments/multi-finals/multi-finals.service';
import { TournamentAwardSetsService } from '../../src/tournaments/tournament-award-sets.service';
import { recalculateStandingsInTx } from '../../src/tournaments/tournament-bracket-tx';
import { competitionConfigFixture as ids, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';
import type { MultiFinalSelectionDto } from '../../src/tournaments/multi-finals/multi-finals.dto';

const prisma = new PrismaService();
const user = { id: ids.adminUserId, email: 'multi-finals@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const admins = new AdminContextService(prisma);
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService(), new TournamentStaffAccessService(prisma));
const templates = new BracketTemplateService(prisma, admins, games);
const service = new MultiFinalsService(prisma, admins, games, templates);
const awards = new TournamentAwardSetsService(prisma, admins);
let tournamentId: string; let registrationIds: string[];

async function setup() {
  return service.setup(user, tournamentId, { expectedRevision: 0, groups: [0, 1].map(i => ({ name: `${i + 1}조`, capacity: 5, legs: 1 as const, registrationIds: registrationIds.slice(i * 5, i * 5 + 5) })),
    finals: [{ name: '챔피언', thirdPlace: false, rules: [{ groupId: '0', rank: 1 }, { groupId: '1', rank: 1 }], registrationIds: null }] });
}
async function finishPreliminary(tied = false) {
  const rows = await prisma.v1TournamentMatchDetails.findMany({ where: { tournamentId, group: { phase: 'group' } }, include: { teamMatch: { include: { game: true } } } });
  for (const row of rows) {
    const game = row.teamMatch.game!;
    const revision = await prisma.v1GameResultRevision.create({ data: { gameId: game.id, revision: 1, state: 'OFFICIAL',
      score: tied ? { home: 0, away: 0 } : { home: 10 - registrationIds.indexOf(row.homeRegistrationId!), away: 10 - registrationIds.indexOf(row.awayRegistrationId!) },
      goalEvents: [], missingScorer: true, eventsHash: `multi-${game.id}`, createdByActorType: 'SYSTEM', createdBySystemActor: 'GAME_BACKFILL', officialAt: new Date(), submittedAt: new Date() } });
    await prisma.v1Game.update({ where: { id: game.id }, data: { state: 'ENDED', currentOfficialRevisionId: revision.id } });
    await prisma.v1TeamMatch.update({ where: { id: row.teamMatchId }, data: { status: 'completed' } });
  }
  await prisma.$transaction(tx => recalculateStandingsInTx(tx, tournamentId));
}
async function preliminarySnapshot() {
  return prisma.v1TournamentMatchDetails.findMany({ where: { tournamentId, group: { phase: 'group' } }, orderBy: { fixtureNumber: 'asc' },
    select: { teamMatchId: true, homeRegistrationId: true, awayRegistrationId: true, teamMatch: { select: { deletedAt: true, game: { select: { currentOfficialRevisionId: true, state: true } } } } } });
}

describe('N개 결선 실제 DB 저장·공식 순위·수동 편집·재생성', () => {
  beforeAll(async () => { await prisma.$connect(); await seedCompetitionConfigFixture(prisma, user); });
  afterAll(async () => { await prisma.$disconnect(); });
  beforeEach(async () => {
    tournamentId = randomUUID();
    await prisma.v1Tournament.create({ data: { id: tournamentId, kind: 'regular_tournament', format: 'league_knockouts', sportId: ids.soccerSportId, title: 'N개 결선 검증', teamCount: 10, competitionConfigVersionId: '11111111-1111-4111-8111-111111111111' } });
    registrationIds = [];
    for (let i = 0; i < 10; i++) {
      const team = await prisma.v1Team.create({ data: { ownerUserId: user.id, sportId: ids.soccerSportId, regionId: ids.regionId, name: `검증 팀 ${i + 1}` } });
      const reg = await prisma.v1TournamentRegistration.create({ data: { tournamentId, teamId: team.id, appliedByUserId: user.id, status: 'confirmed' } }); registrationIds.push(reg.id);
    }
  });
  it('5개 조·11팀 예선 275경기를 기존 템플릿 상한 없이 실제 저장한다', async () => {
    await prisma.v1Tournament.update({ where: { id: tournamentId }, data: { teamCount: 55 } });
    const view = await service.setup(user, tournamentId, { expectedRevision: 0,
      groups: Array.from({ length: 5 }, (_, i) => ({ name: `${i + 1}조`, capacity: 11, legs: 1 as const })),
      finals: [{ name: '챔피언', thirdPlace: false, rules: [], registrationIds: null }] });
    expect(view.groups).toHaveLength(5);
    expect(await prisma.v1TournamentMatchDetails.count({ where: { tournamentId, teamMatch: { deletedAt: null } } })).toBe(275);
    expect(await prisma.v1TournamentSlot.count({ where: { tournamentId, kind: 'ENTRY' } })).toBe(55);
  }, 60000);
  it('예선 미완료는 자동 진출을 확정하지 않고 공식 결과 후 조별 1위를 제안한다', async () => {
    const first = await setup(); expect(first.finals[0].unresolved).toHaveLength(2);
    const pending = await service.preview(user, tournamentId);
    expect(pending.finals[0].registrationIds).toBeNull();
    expect(pending.plan.slots).toHaveLength(2);
    await service.generate(user, tournamentId, { expectedRevision: pending.revision, previewHash: pending.previewHash, requestId: randomUUID() });
    const before = await prisma.v1TournamentMatchDetails.findFirstOrThrow({ where: { tournamentId, group: { phase: 'final' }, teamMatch: { deletedAt: null } } });
    const scheduledAt = new Date('2026-12-01T09:00:00Z');
    await prisma.v1TeamMatch.update({ where: { id: before.teamMatchId }, data: { startAt: scheduledAt } });
    await finishPreliminary();
    const view = await service.get(user, tournamentId);
    expect(view.finals[0].suggestedRegistrationIds).toEqual([registrationIds[0], registrationIds[5]]);
    expect(view.finals[0].manual).toBe(false);
    expect(view.groupStandings.every(group => group.complete)).toBe(true);
    expect(view.groupStandings.map(group => group.rows.length)).toEqual([5, 5]);
    const fill = await service.preview(user, tournamentId);
    await service.generate(user, tournamentId, { expectedRevision: fill.revision, previewHash: fill.previewHash, requestId: randomUUID() });
    const after = await prisma.v1TournamentMatchDetails.findFirstOrThrow({ where: { tournamentId, group: { phase: 'final' }, teamMatch: { deletedAt: null } }, include: { teamMatch: true } });
    expect(after.teamMatchId).toBe(before.teamMatchId);
    expect(after.teamMatch.startAt).toEqual(scheduledAt);
    expect([after.homeRegistrationId, after.awayRegistrationId]).toEqual([registrationIds[0], registrationIds[5]]);
  });
  it('순위 밖 팀을 포함해 3개 결선 명단을 저장하고 재계산 뒤에도 유지하며 예선을 보존한다', async () => {
    const first = await setup(); await finishPreliminary(); const before = await preliminarySnapshot();
    const finals = [
      { name: '챔피언', rules: first.finals[0].rules, thirdPlace: false, registrationIds: registrationIds.slice(2, 5) },
      { name: '챌린지', rules: [], thirdPlace: false, registrationIds: [registrationIds[0], registrationIds[1], registrationIds[5]] },
      { name: '프렌즈', rules: [], thirdPlace: true, registrationIds: registrationIds.slice(6, 10) },
    ];
    const saved = await service.select(user, tournamentId, { expectedRevision: first.revision, finals });
    await prisma.$transaction(tx => recalculateStandingsInTx(tx, tournamentId));
    expect((await service.get(user, tournamentId)).finals.map(f => f.registrationIds)).toEqual(finals.map(f => f.registrationIds));
    const preview = await service.preview(user, tournamentId); expect(preview.counts).toEqual({ tournaments: 3, fixtures: 8, byes: 2 });
    expect(preview.plan.fixtures.map(f => f.fixtureNumber)).toEqual([21, 22, 23, 24, 25, 26, 27, 28]);
    const dto = { expectedRevision: saved.revision, previewHash: preview.previewHash, requestId: randomUUID() };
    const generated = await service.generate(user, tournamentId, dto); expect(generated.replayed).toBe(false);
    expect((await service.generate(user, tournamentId, dto)).replayed).toBe(true);
    expect(await preliminarySnapshot()).toEqual(before);
    const generatedFixtures = await prisma.v1TournamentMatchDetails.findMany({ where: { tournamentId, group: { phase: { not: 'group' } }, teamMatch: { deletedAt: null } }, orderBy: { fixtureNumber: 'asc' }, select: { fixtureNumber: true } });
    expect(generatedFixtures.map(f => f.fixtureNumber)).toEqual(preview.plan.fixtures.map(f => f.fixtureNumber));
    expect((await service.preview(user, tournamentId)).plan.fixtures.map(f => f.fixtureNumber)).toEqual(preview.plan.fixtures.map(f => f.fixtureNumber));
    expect(await prisma.v1TournamentGroup.count({ where: { tournamentId, phase: 'final' } })).toBe(3);
    const slots = await prisma.v1TournamentSlot.findMany({ where: { tournamentId, group: { phase: { not: 'group' } } } });
    expect(slots).toHaveLength(10); expect(new Set(slots.map(s => s.registrationId)).size).toBe(10);
    const next = await service.get(user, tournamentId);
    const changed = await service.select(user, tournamentId, { expectedRevision: next.revision, finals: [{ ...finals[0], registrationIds: [registrationIds[0], registrationIds[9]] }] });
    expect(changed.generated).toBe(false); expect(await preliminarySnapshot()).toEqual(before);
  }, 30000);
  it('완전 동률은 전체 순위와 후보를 제공하고 수동 선택을 기존 미정 대진에 배정한다', async () => {
    await setup();
    const pending = await service.preview(user, tournamentId);
    await service.generate(user, tournamentId, { expectedRevision: pending.revision, previewHash: pending.previewHash, requestId: randomUUID() });
    const before = await prisma.v1TournamentMatchDetails.findFirstOrThrow({ where: { tournamentId, group: { phase: 'final' } } });
    await finishPreliminary(true);
    const view = await service.get(user, tournamentId);
    expect(view.groupStandings.every(group => group.complete && group.rows.length === 5)).toBe(true);
    expect(view.finals[0].suggestedRegistrationIds).toEqual([]);
    expect(view.finals[0].unresolved.map(rule => rule.state)).toEqual(['tied', 'tied']);
    expect(view.finals[0].unresolved[0].tiedRegistrationIds).toHaveLength(5);
    expect((await service.preview(user, tournamentId)).finals[0].registrationIds).toBeNull();
    const selected = await service.select(user, tournamentId, { expectedRevision: view.revision,
      finals: [{ name: '챔피언', thirdPlace: false, rules: view.finals[0].rules, registrationIds: [registrationIds[2], registrationIds[7]] }] });
    expect(selected.generated).toBe(true);
    const preview = await service.preview(user, tournamentId);
    await service.generate(user, tournamentId, { expectedRevision: selected.revision, previewHash: preview.previewHash, requestId: randomUUID() });
    const after = await prisma.v1TournamentMatchDetails.findUniqueOrThrow({ where: { teamMatchId: before.teamMatchId } });
    expect([after.homeRegistrationId, after.awayRegistrationId]).toEqual([registrationIds[2], registrationIds[7]]);
    expect(await prisma.v1TournamentMatchDetails.count({ where: { tournamentId, group: { phase: 'final' }, teamMatch: { deletedAt: null } } })).toBe(1);
  });
  it('다른 대회 팀·중복 팀·중복 순위 목적지를 거절하고 기존 명단을 보존한다', async () => {
    const view = await setup();
    for (const bad of [
      [{ name: '결선', rules: [], thirdPlace: false, registrationIds: [ids.registrationIds[0], registrationIds[0]] }],
      [{ name: '결선', rules: [], thirdPlace: false, registrationIds: [registrationIds[0], registrationIds[0]] }],
      [{ name: '결선1', rules: view.finals[0].rules, thirdPlace: false }, { name: '결선2', rules: view.finals[0].rules, thirdPlace: false }],
    ]) await expect(service.select(user, tournamentId, { expectedRevision: view.revision, finals: bad })).rejects.toMatchObject({ response: { code: 'MULTI_FINAL_INVALID' } });
    expect((await service.get(user, tournamentId)).revision).toBe(view.revision);
  });
  it('동시 편집은 하나만 저장되고 낡은 미리보기는 대진을 변경하지 않는다', async () => {
    const view = await setup();
    const dto: MultiFinalSelectionDto = { expectedRevision: view.revision, finals: [{ name: '결선', rules: [], thirdPlace: false, registrationIds: registrationIds.slice(0, 5) }] };
    const results = await Promise.allSettled([service.select(user, tournamentId, dto), service.select(user, tournamentId, dto)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const preview = await service.preview(user, tournamentId);
    const latest = await service.get(user, tournamentId);
    await service.select(user, tournamentId, { ...dto, expectedRevision: latest.revision });
    await expect(service.generate(user, tournamentId, { expectedRevision: preview.revision, previewHash: preview.previewHash, requestId: randomUUID() })).rejects.toMatchObject({ response: { code: 'MULTI_FINAL_STALE' } });
    expect(await prisma.v1TournamentGroup.count({ where: { tournamentId, phase: { not: 'group' } } })).toBe(0);
  });
  it('시작된 결선 변경과 없는 토너먼트의 시상 저장을 거절한다', async () => {
    const first = await setup(); const selected = await service.select(user, tournamentId, { expectedRevision: first.revision, finals: [{ name: '결선', rules: [], thirdPlace: false, registrationIds: registrationIds.slice(0, 5) }] });
    await expect(awards.setAwardSets(user, tournamentId, { awardSets: [{ bracketTrack: '없는 결선', prizePool: 0 }] })).rejects.toMatchObject({ response: { code: 'AWARD_TRACK_UNSUPPORTED' } });
    expect(await awards.setAwardSets(user, tournamentId, { awardSets: [{ bracketTrack: '결선', prizePool: 0 }] })).toEqual([expect.objectContaining({ bracketTrack: '결선', prizePool: 0 })]);
    const publicRow = await prisma.v1Tournament.findUniqueOrThrow({ where: { id: tournamentId }, include: TOURNAMENT_DETAIL_INCLUDE });
    expect(publicRow.awardSets).toEqual([expect.objectContaining({ bracketTrack: '결선', prizePool: 0 })]);
    const preview = await service.preview(user, tournamentId); await service.generate(user, tournamentId, { expectedRevision: selected.revision, previewHash: preview.previewHash, requestId: randomUUID() });
    const fixture = await prisma.v1TournamentMatchDetails.findFirstOrThrow({ where: { tournamentId, group: { phase: { not: 'group' } } }, include: { teamMatch: { include: { game: true } } } });
    await prisma.v1Game.update({ where: { id: fixture.teamMatch.game!.id }, data: { state: 'LIVE' } });
    const current = await service.get(user, tournamentId);
    await expect(service.select(user, tournamentId, { expectedRevision: current.revision, finals: current.finals })).rejects.toMatchObject({ response: { code: 'BRACKET_LOCKED' } });
    expect(await prisma.v1TournamentMatchDetails.count({ where: { tournamentId, group: { phase: { not: 'group' } }, teamMatch: { deletedAt: null } } })).toBe(4);
  });
  it('생성 중 DB 실패는 새 결선·명단·revision·감사 로그를 전부 롤백한다', async () => {
    const first = await setup(); const saved = await service.select(user, tournamentId, { expectedRevision: first.revision, finals: [{ name: 'ROLLBACK', rules: [], thirdPlace: false, registrationIds: registrationIds.slice(0, 5) }] });
    const preview = await service.preview(user, tournamentId);
    await prisma.$executeRawUnsafe(`CREATE FUNCTION fail_multi_final() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.name LIKE 'ROLLBACK%결승' THEN RAISE EXCEPTION 'forced multi-final rollback'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_multi_final BEFORE INSERT ON v1_tournament_groups FOR EACH ROW EXECUTE FUNCTION fail_multi_final()`);
    try {
      await expect(service.generate(user, tournamentId, { expectedRevision: saved.revision, previewHash: preview.previewHash, requestId: randomUUID() })).rejects.toThrow();
      expect((await service.get(user, tournamentId)).revision).toBe(saved.revision);
      expect(await prisma.v1TournamentGroup.count({ where: { tournamentId, phase: { not: 'group' } } })).toBe(0);
      expect(await prisma.v1AdminActionLog.count({ where: { targetId: tournamentId, action: 'tournament.multi_finals.generate' } })).toBe(0);
    } finally { await prisma.$executeRawUnsafe('DROP TRIGGER fail_multi_final ON v1_tournament_groups'); await prisma.$executeRawUnsafe('DROP FUNCTION fail_multi_final()'); }
  });
  it('미리보기 뒤 다른 운영자가 경기 일정을 바꾸면 재생성으로 덮어쓰지 않는다', async () => {
    const first = await setup();
    const selected = await service.select(user, tournamentId, { expectedRevision: first.revision, finals: [{ name: '결선', rules: [], thirdPlace: false, registrationIds: registrationIds.slice(0, 5) }] });
    const before = await service.preview(user, tournamentId);
    await service.generate(user, tournamentId, { expectedRevision: selected.revision, previewHash: before.previewHash, requestId: randomUUID() });
    const preview = await service.preview(user, tournamentId);
    const fixture = await prisma.v1TournamentMatchDetails.findFirstOrThrow({ where: { tournamentId, group: { phase: { not: 'group' } } } });
    const startAt = new Date('2035-01-01T00:00:00Z');
    await prisma.v1TeamMatch.update({ where: { id: fixture.teamMatchId }, data: { startAt } });
    await expect(service.generate(user, tournamentId, { expectedRevision: preview.revision, previewHash: preview.previewHash, requestId: randomUUID() })).rejects.toMatchObject({ response: { code: 'MULTI_FINAL_STALE' } });
    expect((await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: fixture.teamMatchId } })).startAt).toEqual(startAt);
    expect(await prisma.v1TournamentMatchDetails.count({ where: { tournamentId, group: { phase: { not: 'group' } }, teamMatch: { deletedAt: null } } })).toBe(4);
  });
  it('support는 명단 조회만 가능하고 변경·미리보기는 거절된다', async () => {
    await setup();
    const account = await prisma.v1User.create({ data: { email: `${randomUUID()}@example.test`, accountStatus: 'active', onboardingStatus: 'completed' } });
    await prisma.v1AdminUser.create({ data: { userId: account.id, adminRole: 'support', status: 'active' } });
    const reader = { ...user, id: account.id, email: account.email! };
    expect((await service.get(reader, tournamentId)).groups).toHaveLength(2);
    await expect(service.select(reader, tournamentId, { expectedRevision: 1, finals: [] })).rejects.toThrow();
    await expect(service.preview(reader, tournamentId)).rejects.toThrow();
    expect((await service.get(user, tournamentId)).revision).toBe(1);
    await prisma.v1Tournament.update({ where: { id: tournamentId }, data: { status: 'completed' } });
    await expect(service.select(user, tournamentId, { expectedRevision: 1, finals: [] })).rejects.toMatchObject({ response: { code: 'BRACKET_LOCKED' } });
    expect((await service.get(reader, tournamentId)).finals).toHaveLength(1);
  });

});
