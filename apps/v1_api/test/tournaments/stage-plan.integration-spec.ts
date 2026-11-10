import type { NotificationsService } from '../../src/notifications/notifications.service';
import { TournamentsAdminService } from '../../src/tournaments/tournaments-admin.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GamesService } from '../../src/games/games.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { TournamentStaffAccessService } from '../../src/tournaments/staff/tournament-staff-access.service';
import { BracketTemplateService } from '../../src/tournaments/templates/bracket-template.service';
import { StagePlanService } from '../../src/tournaments/stages/stage-plan.service';
import { assertStageFixtureReady } from '../../src/tournaments/stages/stage-eligibility';
import type { StagePlanDto } from '../../src/tournaments/stages/stage-plan.dto';
import { recalculateStandingsInTx } from '../../src/tournaments/tournament-bracket-tx';
import { competitionConfigFixture as ids, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';
import { seedBracketTournament, seedSupportAdmin } from '../helpers/bracket-canvas-fixture';
jest.setTimeout(120_000);
const prisma = new PrismaService(), admins = new AdminContextService(prisma);
const user = { id: ids.adminUserId, email: 'stages@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService(), new TournamentStaffAccessService(prisma));
const templates = new BracketTemplateService(prisma, admins, games), stages = new StagePlanService(prisma, admins, templates, games);
async function official(fixtureId: string, home: number, away: number) {
  const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId: fixtureId } });
  const count = await prisma.v1GameResultRevision.count({ where: { gameId: game.id } });
  const revision = await prisma.v1GameResultRevision.create({ data: { gameId: game.id, revision: count + 1, state: 'DRAFT', score: { home, away }, eventsHash: `stage-${game.id}-${count}`, createdByActorType: 'SYSTEM', createdBySystemActor: 'TEST_FIXTURE' } });
  await prisma.v1GameResultRevision.update({ where: { id: revision.id }, data: { state: 'OFFICIAL', officialAt: new Date() } });
  await prisma.v1Game.update({ where: { id: game.id }, data: { state: 'ENDED', currentOfficialRevisionId: revision.id } });
  await prisma.v1TeamMatch.update({ where: { id: fixtureId }, data: { status: 'completed' } });
}
async function seeded(label: string, config: StagePlanDto, count: number) {
  const seed = await seedBracketTournament(prisma, { label, format: 'group_knockout', teamCount: count });
  await prisma.v1Tournament.update({ where: { id: seed.tournamentId }, data: { stagePlan: JSON.parse(JSON.stringify(config)), stagePlanRevision: 1, teamCount: count, format: 'league_knockouts' } });
  return seed;
}
describe('단계별 리그·토너먼트 actual DB contract', () => {
  beforeAll(async () => { await prisma.$connect(); await seedCompetitionConfigFixture(prisma, user); });
  afterAll(async () => { await prisma.$disconnect(); });
  it('새 생성으로 구조를 저장·복원하고 기존 대회의 자동 전환과 미완료 종료를 거부한다', async () => {
    const admin = new TournamentsAdminService(prisma, admins, {} as NotificationsService);
    const config: StagePlanDto = { version: 1, stages: [{ key: 'main', name: '본선', pools: [{ key: 'one', name: '본선 리그', format: 'league', capacity: 4, legs: 1, sources: [] }] }] };
    const created = await admin.create(user, { title: '단계형 생성 roundtrip', sportId: ids.soccerSportId, teamCount: 4, format: 'league_knockouts', stagePlan: config });
    expect(created).toMatchObject({ stagePlan: config, stagePlanRevision: 1, status: 'draft' });
    expect((await admin.get(user, created.id)).stagePlan).toEqual(config);
    const changed = { ...config, stages: config.stages.map(s => ({ ...s, name: '단일 본선' })) };
    const updated = await admin.update(user, created.id, { expectedVersion: created.updatedAt, stagePlan: changed });
    expect(updated.stagePlan).toEqual(changed);
    const old = await admin.get(user, ids.tournamentId);
    await expect(admin.update(user, old.id, { expectedVersion: old.updatedAt, stagePlan: config })).rejects.toMatchObject({ response: { code: 'STAGE_PLAN_INVALID' } });
    await stages.generate(user, created.id, { expectedRevision: 2 });
    const generated = await admin.get(user, created.id);
    await expect(admin.update(user, created.id, { expectedVersion: generated.updatedAt, stagePlan: config })).rejects.toMatchObject({ response: { code: 'BRACKET_LOCKED' } });
    await prisma.v1Tournament.update({ where: { id: created.id }, data: { status: 'in_progress' } });
    await expect(admin.changeStatus(user, created.id, { status: 'completed' })).rejects.toMatchObject({ response: { code: 'STAGE_RESULTS_INCOMPLETE' } });
    expect((await prisma.v1Tournament.findUniqueOrThrow({ where: { id: created.id } })).status).toBe('in_progress');
  });
  it('20팀70경기 생성·순위별 재참가·성적 분리·경기 ID 보존·정정 stale·독립 편성 잠금을 검증한다', async () => {
    const prelim = Array.from({ length: 5 }, (_, i) => ({ key: `pre${i}`, name: `${i}조`, format: 'league' as const, capacity: 4, legs: 1 as const, sources: [] }));
    const config: StagePlanDto = { version: 1, stages: [{ key: 'pre', name: '예선', pools: prelim }, { key: 'main', name: '본선', pools: Array.from({ length: 4 }, (_, rank) => ({ key: `main${rank}`, name: `${rank + 1}위 리그`, format: 'league' as const, capacity: 5, legs: 1 as const, sources: prelim.map(p => ({ poolKey: p.key, rank: rank + 1 })) })) }] };
    const seed = await seeded('stage-twenty', config, 20), id = seed.tournamentId;
    const beforeOther = await prisma.v1Tournament.findUniqueOrThrow({ where: { id: ids.tournamentId } });
    let view = await stages.generate(user, id, { expectedRevision: 1 });
    const fixtureIds = view.pools.flatMap(p => p.fixtureIds); expect(fixtureIds).toHaveLength(70);
    await expect(stages.generate(user, id, { expectedRevision: 1 })).rejects.toMatchObject({ response: { code: 'STAGE_PLAN_STALE' } });
    const assign = async (key: string, selected: string[]) => { const pool = view.pools.find(p => p.key === key)!; view = await stages.assign(user, id, { poolKey: key, expectedRevision: view.revision, sourceVersion: pool.sourceVersion, registrationIds: selected }); };
    for (let i = 0; i < 5; i++) await assign(`pre${i}`, seed.registrationIds.slice(i * 4, i * 4 + 4));
    const main = view.pools.find(p => p.key === 'main0')!;
    await expect(stages.assign(user, id, { poolKey: main.key, expectedRevision: view.revision, sourceVersion: main.sourceVersion, registrationIds: seed.registrationIds.slice(0, 5) })).rejects.toMatchObject({ response: { code: 'STAGE_PLAN_INVALID' } });
    const fixtures = await prisma.v1TournamentMatchDetails.findMany({ where: { tournamentId: id, group: { stageKey: 'pre' } } });
    for (const f of fixtures) { const hi = seed.registrationIds.indexOf(f.homeRegistrationId!), ai = seed.registrationIds.indexOf(f.awayRegistrationId!); await official(f.teamMatchId, hi < ai ? 1 : 0, hi < ai ? 0 : 1); }
    await prisma.$transaction(tx => recalculateStandingsInTx(tx, id)); view = await stages.get(user, id);
    for (let rank = 0; rank < 4; rank++) { const pool = view.pools.find(p => p.key === `main${rank}`)!; expect(pool.candidates.every(c => c.length === 1)).toBe(true); await assign(pool.key, pool.candidates.map(c => c[0])); }
    expect(view.pools.filter(p => p.stageIndex === 1).every(p => p.assigned && !p.stale)).toBe(true);
    expect(await prisma.v1TournamentSlot.count({ where: { tournamentId: id, registrationId: seed.registrationIds[0] } })).toBe(2);
    expect(await prisma.v1TournamentOverallStanding.count({ where: { tournamentId: id } })).toBe(0);
    expect(view.pools.find(p => p.key === 'main0')!.standings.every(s => s.points === 0 && s.wins === 0)).toBe(true);
    expect(new Set(view.pools.flatMap(p => p.fixtureIds))).toEqual(new Set(fixtureIds));
    const targetId = view.pools.find(p => p.key === 'main0')!.fixtureIds[0];
    await prisma.$transaction(tx => assertStageFixtureReady(tx, targetId));
    // findMany has no stable order, so pin a fixture whose home side is the better-seeded team: 9-0 then keeps every pool ranking
    // (only goal difference changes) and no rank-2 team becomes a former rank-1 team already frozen in main0.
    const source = fixtures.find(f => seed.registrationIds.indexOf(f.homeRegistrationId!) < seed.registrationIds.indexOf(f.awayRegistrationId!))!;
    await official(source.teamMatchId, 9, 0);
    await prisma.$transaction(tx => recalculateStandingsInTx(tx, id)); view = await stages.get(user, id);
    expect(view.pools.find(p => p.key === 'main0')!.stale).toBe(true);
    await expect(prisma.$transaction(tx => assertStageFixtureReady(tx, targetId))).rejects.toMatchObject({ response: { code: 'STAGE_ASSIGNMENT_REQUIRED' } });
    expect(view.pools.find(p => p.key === 'main0')!.registrationIds.every(Boolean)).toBe(true);
    await prisma.v1Game.update({ where: { teamMatchId: targetId }, data: { state: 'LIVE' } });
    await expect(assign('main0', view.pools.find(p => p.key === 'main0')!.candidates.map(c => c[0]))).rejects.toMatchObject({ response: { code: 'BRACKET_LOCKED' } });
    const frozenPool = view.pools.find(p => p.key === 'main0')!;
    const ack = { expectedRevision: view.revision, poolKey: frozenPool.key, sourceVersion: frozenPool.sourceVersion, registrationIds: frozenPool.registrationIds as string[], acknowledgeStartedCorrection: true };
    await expect(stages.assign(user, id, ack)).rejects.toMatchObject({ response: { code: 'STAGE_PLAN_INVALID' } });
    await expect(stages.assign(user, id, { ...ack, registrationIds: [...ack.registrationIds].reverse(), reason: '팀 변경 시도' })).rejects.toMatchObject({ response: { code: 'STAGE_PLAN_INVALID' } });
    view = await stages.assign(user, id, { ...ack, reason: '이미 시작한 본선 참가팀을 유지하고 예선 정정 영향을 확인' });
    expect(view.pools.find(p => p.key === 'main0')!.stale).toBe(false);
    expect(view.pools.find(p => p.key === 'main0')!.registrationIds).toEqual(frozenPool.registrationIds);
    await prisma.$transaction(tx => assertStageFixtureReady(tx, targetId));
    await assign('main1', view.pools.find(p => p.key === 'main1')!.candidates.map(c => c[0]));
    expect(await prisma.v1Tournament.findUniqueOrThrow({ where: { id: ids.tournamentId } })).toEqual(beforeOther);
    const support = await seedSupportAdmin(prisma, 'stage-readonly');
    await expect(stages.generate(support, id, { expectedRevision: view.revision })).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
  });
  it('3단계 혼합 편성에서 리그와 토너먼트 우승팀을 다음 단계에 연결한다', async () => {
    const config: StagePlanDto = { version: 1, stages: [
      { key: 'pre', name: '예선', pools: ['a', 'b'].map(key => ({ key, name: key, format: 'league', capacity: 2, legs: 1, sources: [] })) },
      { key: 'main', name: '본선', pools: [
        { key: 'upper', name: '상위 리그', format: 'league', capacity: 2, legs: 1, sources: [{ poolKey: 'a', rank: 1 }, { poolKey: 'b', rank: 1 }] },
        { key: 'lower', name: '하위 토너먼트', format: 'knockout', capacity: 2, legs: 1, sources: [{ poolKey: 'a', rank: 2 }, { poolKey: 'b', rank: 2 }] },
      ] },
      { key: 'last', name: '최종전', pools: [{ key: 'last1', name: '최종 토너먼트', format: 'knockout', capacity: 2, legs: 1, sources: [{ poolKey: 'upper', rank: 1 }, { poolKey: 'lower', rank: 1 }] }] },
    ] };
    const seed = await seeded('stage-mixed', config, 4), id = seed.tournamentId;
    let view = await stages.generate(user, id, { expectedRevision: 1 });
    for (const [index, key] of ['a', 'b', 'upper', 'lower', 'last1'].entries()) {
      const p = view.pools.find(p => p.key === key)!;
      const regs = index < 2 ? seed.registrationIds.slice(index * 2, index * 2 + 2) : p.candidates.map(c => c[0]);
      view = await stages.assign(user, id, { expectedRevision: view.revision, poolKey: key, sourceVersion: p.sourceVersion, registrationIds: regs });
      await official(p.fixtureIds[0], 1, 0);
      await prisma.$transaction(tx => recalculateStandingsInTx(tx, id));
      view = await stages.get(user, id);
    }
    expect(view.pools.every(p => p.complete && !p.stale)).toBe(true);
    expect(await prisma.v1TournamentSlot.count({ where: { tournamentId: id, registrationId: seed.registrationIds[0] } })).toBe(3);
    expect(view.pools.flatMap(p => p.fixtureIds)).toHaveLength(5);
  });
  it.each(['league', 'knockout'] as const)('예선 없는 5팀 %s 대회를 생성하고 확정한다', async format => {
    const config: StagePlanDto = { version: 1, stages: [{ key: 'main', name: '본선', pools: [{ key: 'main1', name: '본선', format, capacity: 5, legs: 1, sources: [] }] }] };
    const seed = await seeded(`stage-single-${format}`, config, 5);
    const generated = await stages.generate(user, seed.tournamentId, { expectedRevision: 1 });
    const pool = generated.pools[0]; expect(pool.fixtureIds).toHaveLength(format === 'league' ? 10 : 4);
    const saved = await stages.assign(user, seed.tournamentId, { expectedRevision: generated.revision, poolKey: pool.key, sourceVersion: pool.sourceVersion, registrationIds: seed.registrationIds });
    expect(saved.pools[0].assigned).toBe(true);
    expect(await prisma.v1Game.count({ where: { teamMatchId: { in: pool.fixtureIds } } })).toBe(pool.fixtureIds.length);
  });
});
