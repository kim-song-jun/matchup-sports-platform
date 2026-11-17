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
import { TournamentPeriodSettingsService } from '../../src/tournaments/competition-config/tournament-period-settings.service';
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
    const seedIndex = (rid: string | null) => (rid ? seed.registrationIds.indexOf(rid) : -1);
    const source = fixtures.find(f => seedIndex(f.homeRegistrationId) >= 0 && seedIndex(f.awayRegistrationId) >= 0 && seedIndex(f.homeRegistrationId) < seedIndex(f.awayRegistrationId));
    expect(source).toBeDefined();
    await official(source!.teamMatchId, 9, 0);
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
  it('미정 초안은 시작을 막고 같은 revision의 동시 변경은 한 요청만 저장한다', async () => {
    const config: StagePlanDto = { version: 1, stages: [{ key: 'main', name: '본선', pools: ['a', 'b'].map(key => ({ key, name: key, format: 'league', capacity: 2, legs: 1, sources: [] })) }] };
    const seed = await seeded('stage-draft-race', config, 4), id = seed.tournamentId;
    let view = await stages.generate(user, id, { expectedRevision: 1 });
    const first = view.pools[0];
    view = await stages.assign(user, id, { expectedRevision: view.revision, poolKey: first.key, sourceVersion: first.sourceVersion, registrationIds: [seed.registrationIds[0], null], draft: true });
    expect(view.pools[0]).toMatchObject({ assigned: false, registrationIds: [seed.registrationIds[0], null] });
    await expect(prisma.$transaction(tx => assertStageFixtureReady(tx, first.fixtureIds[0]))).rejects.toMatchObject({ response: { code: 'STAGE_ASSIGNMENT_REQUIRED' } });
    const revision = view.revision;
    const results = await Promise.allSettled(view.pools.map((pool, i) => stages.assign(user, id, { expectedRevision: revision, poolKey: pool.key, sourceVersion: pool.sourceVersion, registrationIds: seed.registrationIds.slice(i * 2, i * 2 + 2) })));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { response: { code: 'STAGE_PLAN_STALE' } } });
    expect((await stages.get(user, id)).pools.flatMap(pool => pool.fixtureIds)).toEqual(view.pools.flatMap(pool => pool.fixtureIds));
  });
  it('독립된 시작 전 편성만 교체하고 진행 중인 다른 편성의 경기·일정을 보존한다', async () => {
    const config: StagePlanDto = { version: 1, stages: [{ key: 'main', name: '본선', pools: ['a', 'b'].map(key => ({ key, name: key, format: 'league', capacity: 3, legs: 1, sources: [] })) }] };
    const seed = await seeded('stage-scoped-replace', config, 6), id = seed.tournamentId;
    let view = await stages.generate(user, id, { expectedRevision: 1 });
    for (let i = 0; i < 2; i++) { const pool = view.pools[i]; view = await stages.assign(user, id, { expectedRevision: view.revision, poolKey: pool.key, sourceVersion: pool.sourceVersion, registrationIds: seed.registrationIds.slice(i * 3, i * 3 + 3) }); }
    const keep = view.pools[0].fixtureIds, replaced = view.pools[1].fixtureIds;
    await prisma.v1Game.update({ where: { teamMatchId: keep[0] }, data: { state: 'LIVE' } });
    const before = await prisma.v1TeamMatch.findMany({ where: { id: { in: keep } }, orderBy: { id: 'asc' } });
    const changed = structuredClone(config); changed.stages[0].pools[1].format = 'knockout';
    view = await stages.updateStructure(user, id, { expectedRevision: view.revision, plan: changed, reason: '아직 시작하지 않은 B 편성만 토너먼트로 변경' });
    expect(view.pools[1].fixtureIds).toHaveLength(2);
    expect(view.pools[0].fixtureIds).toEqual(keep);
    expect(await prisma.v1TeamMatch.findMany({ where: { id: { in: keep } }, orderBy: { id: 'asc' } })).toEqual(before);
    expect(await prisma.v1TeamMatch.count({ where: { id: { in: replaced }, deletedAt: { not: null } } })).toBe(3);
    changed.stages[0].pools[0].legs = 2;
    await expect(stages.updateStructure(user, id, { expectedRevision: view.revision, plan: changed, reason: '시작한 편성 변경 시도' })).rejects.toMatchObject({ response: { code: 'BRACKET_LOCKED' } });
  });
  it('20팀 예선 공식 결과에서 4개 본선을 자동 확정하고 70경기 후 명시한 1~20위를 계산한다', async () => {
    const prelim = Array.from({ length: 5 }, (_, i) => ({ key: `pre${i}`, name: `${i}조`, format: 'league' as const, capacity: 4, legs: 1 as const, sources: [] }));
    const config: StagePlanDto = { version: 1, stages: [{ key: 'pre', name: '예선', pools: prelim }, { key: 'main', name: '본선', pools: Array.from({ length: 4 }, (_, rank) => ({ key: `main${rank}`, name: `${rank + 1}위 리그`, format: 'league' as const, capacity: 5, legs: 1 as const, overallRankStart: rank * 5 + 1, sources: prelim.map(pool => ({ poolKey: pool.key, rank: rank + 1 })) })) }] };
    const seed = await seeded('stage-auto-twenty', config, 20), id = seed.tournamentId;
    let view = await stages.generate(user, id, { expectedRevision: 1 });
    const fixtureIds = view.pools.flatMap(pool => pool.fixtureIds);
    for (let i = 0; i < 5; i++) { const pool = view.pools[i]; view = await stages.assign(user, id, { expectedRevision: view.revision, poolKey: pool.key, sourceVersion: pool.sourceVersion, registrationIds: seed.registrationIds.slice(i * 4, i * 4 + 4) }); }
    view = await stages.setAutomation(user, id, { expectedRevision: view.revision, enabled: true });
    await prisma.v1Tournament.update({ where: { id }, data: { status: 'in_progress' } });
    const play = async (stageKey: string) => {
      for (const fixture of await prisma.v1TournamentMatchDetails.findMany({ where: { tournamentId: id, group: { stageKey } } })) {
        const homeWins = seed.registrationIds.indexOf(fixture.homeRegistrationId!) < seed.registrationIds.indexOf(fixture.awayRegistrationId!);
        await official(fixture.teamMatchId, homeWins ? 1 : 0, homeWins ? 0 : 1);
      }
      await prisma.$transaction(tx => recalculateStandingsInTx(tx, id));
    };
    await prisma.$transaction(tx => stages.advanceReadyInTx(tx, id));
    expect((await stages.get(user, id)).pools.filter(pool => pool.stageIndex === 1).every(pool => !pool.assigned)).toBe(true);
    await play('pre');
    for (let i = 0; i < 4; i++) await prisma.$transaction(tx => stages.advanceReadyInTx(tx, id));
    view = await stages.get(user, id);
    expect(view.pools.filter(pool => pool.stageIndex === 1).every(pool => pool.assigned && !pool.stale)).toBe(true);
    expect(new Set(view.pools.flatMap(pool => pool.fixtureIds))).toEqual(new Set(fixtureIds));
    const beforeReplay = view.revision;
    await prisma.$transaction(tx => stages.advanceReadyInTx(tx, id));
    expect((await stages.get(user, id)).revision).toBe(beforeReplay);
    await play('main');
    const overall = await prisma.v1TournamentOverallStanding.findMany({ where: { tournamentId: id }, orderBy: { position: 'asc' } });
    expect(overall.map(row => row.position)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(overall[0]).toMatchObject({ registrationId: seed.registrationIds[0], points: 12, wins: 4 });
    expect(overall[5]).toMatchObject({ registrationId: seed.registrationIds[1], points: 12, wins: 4 });
    expect((await stages.get(user, id)).pools.every(pool => pool.complete)).toBe(true);
    const admin = new TournamentsAdminService(prisma, admins, { emitNotificationToMany: jest.fn() } as unknown as NotificationsService);
    expect(await admin.changeStatus(user, id, { status: 'completed' })).toMatchObject({ status: 'completed' });
  });
  it('두 풀리그 단계의 경기 시간을 분리하고 편성 상속 복원·시작한 경기 보호를 검증한다', async () => {
    const config: StagePlanDto = { version: 1, stages: [
      { key: 'pre', name: '예선', pools: ['a', 'b'].map(key => ({ key, name: key, format: 'league', capacity: 2, legs: 1, sources: [] })) },
      { key: 'main', name: '본선', pools: [1, 2].map(rank => ({ key: `m${rank}`, name: `${rank}위 리그`, format: 'league', capacity: 2, legs: 1, sources: ['a', 'b'].map(poolKey => ({ poolKey, rank })) })) },
    ] };
    const seed = await seeded('stage-period-keys', config, 4), id = seed.tournamentId;
    const view = await stages.generate(user, id, { expectedRevision: 1 });
    const periods = new TournamentPeriodSettingsService(prisma, admins);
    const original = await periods.get(user, id);
    let saved = await periods.update(user, id, { expectedVersion: original.expectedVersion, stageKey: 'main', periods: [{ durationMinutes: 20 }] });
    saved = await periods.update(user, id, { expectedVersion: saved.expectedVersion, poolKey: 'm1', periods: [{ durationMinutes: 25 }] });
    const main = view.pools.find(pool => pool.key === 'm1')!.fixtureIds[0];
    expect((await periods.getMatch(user, id, main)).inherited).toMatchObject({ source: 'pool', periods: [{ durationMinutes: 25 }] });
    expect((await periods.getMatch(user, id, view.pools[0].fixtureIds[0])).inherited.source).toBe('default');
    saved = await periods.update(user, id, { expectedVersion: saved.expectedVersion, poolKey: 'm1', inheritDefault: true });
    expect((await periods.getMatch(user, id, main)).inherited).toMatchObject({ source: 'competition_stage', periods: [{ durationMinutes: 20 }] });
    const before = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: main }, select: { competitionConfigVersionId: true } });
    await prisma.v1Game.update({ where: { teamMatchId: main }, data: { state: 'LIVE' } });
    await periods.update(user, id, { expectedVersion: saved.expectedVersion, stageKey: 'main', periods: [{ durationMinutes: 30 }] });
    expect(await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: main }, select: { competitionConfigVersionId: true } })).toEqual(before);
    expect((await periods.getMatch(user, id, view.pools.find(pool => pool.key === 'm2')!.fixtureIds[0])).periods).toMatchObject([{ durationMinutes: 30 }]);
  });
  it('미시작 경기만 삭제·복원하고 취소 재경기는 옛 Game을 보존하며 다른 경기 일정에 손대지 않는다', async () => {
    const config: StagePlanDto = { version: 1, stages: [{ key: 'main', name: '본선', pools: [{ key: 'one', name: '리그', format: 'league', capacity: 4, legs: 1, sources: [] }] }] };
    const seed = await seeded('stage-fixture-repair', config, 4), id = seed.tournamentId;
    let view = await stages.generate(user, id, { expectedRevision: 1 });
    view = await stages.assign(user, id, { expectedRevision: view.revision, poolKey: 'one', sourceVersion: view.pools[0].sourceVersion, registrationIds: seed.registrationIds });
    const target = view.pools[0].fixtureIds[0], keep = view.pools[0].fixtureIds.slice(1);
    const otherBefore = await prisma.v1TeamMatch.findMany({ where: { id: { in: keep } }, orderBy: { id: 'asc' } });
    view = await stages.repairFixture(user, id, { expectedRevision: view.revision, fixtureId: target, action: 'remove', reason: '미시작 경기 일정 재편성' });
    expect(view.pools[0].fixtureIds).toHaveLength(5);
    expect(view.pools[0].complete).toBe(false);
    expect(view.pools[0].removedFixtures.map(fixture => fixture.id)).toEqual([target]);
    const restored = await stages.repairFixture(user, id, { expectedRevision: view.revision, fixtureId: target, action: 'restore', reason: '누락 경기 복원' });
    expect(restored.replacementId).toBeTruthy(); expect(restored.replacementId).not.toBe(target);
    expect(restored.pools[0].fixtureIds).toHaveLength(6);
    expect(await prisma.v1TeamMatch.findMany({ where: { id: { in: keep } }, orderBy: { id: 'asc' } })).toEqual(otherBefore);
    const replayTarget = restored.replacementId!;
    await prisma.v1Game.update({ where: { teamMatchId: replayTarget }, data: { state: 'CANCELLED' } });
    await prisma.v1TeamMatch.update({ where: { id: replayTarget }, data: { status: 'cancelled' } });
    const cancelled = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId: replayTarget } });
    const replayed = await stages.repairFixture(user, id, { expectedRevision: restored.revision, fixtureId: replayTarget, action: 'replay', reason: '우천 취소 경기 재경기' });
    expect(await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId: replayTarget } })).toEqual(cancelled);
    expect(replayed.pools[0].fixtureIds).toHaveLength(6);
    const replay = await prisma.v1TournamentMatchDetails.findUniqueOrThrow({ where: { teamMatchId: replayed.replacementId! } });
    expect(replay.homeRegistrationId).toBeTruthy(); expect(replay.awayRegistrationId).toBeTruthy();
    await official(replayed.replacementId!, 1, 0);
    await expect(stages.repairFixture(user, id, { expectedRevision: replayed.revision, fixtureId: replayed.replacementId!, action: 'remove', reason: '공식 결과 경기 삭제 시도' })).rejects.toMatchObject({ response: { code: 'FIXTURE_ALREADY_STARTED' } });
    await expect(stages.repairFixture(user, id, { expectedRevision: replayed.revision, fixtureId: replayed.replacementId!, action: 'replay', reason: '공식 결과 경기 재경기 시도' })).rejects.toMatchObject({ response: { code: 'STAGE_PLAN_INVALID' } });
    await prisma.v1TeamMatch.update({ where: { id: replayed.replacementId! }, data: { status: 'cancelled' } });
    await expect(stages.repairFixture(user, id, { expectedRevision: replayed.revision, fixtureId: replayed.replacementId!, action: 'replay', reason: '취소 표시로 공식 결과 우회 시도' })).rejects.toMatchObject({ response: { code: 'STAGE_PLAN_INVALID' } });
  });
  it('편성별 6강 성적 비교·동률 수동 결정·결과 정정 재확인을 처리한다', async () => {
    const config: StagePlanDto = { version: 1, stages: [{ key: 'main', name: '본선', pools: [{ key: 'six', name: '6강', format: 'knockout', capacity: 6, legs: 1, sixTeamFinalBye: true, sources: [] }] }] };
    const seed = await seeded('stage-ranked-six', config, 6), id = seed.tournamentId;
    let view = await stages.generate(user, id, { expectedRevision: 1 });
    expect(view.pools[0].fixtureIds).toHaveLength(5);
    view = await stages.assign(user, id, { expectedRevision: view.revision, poolKey: 'six', sourceVersion: view.pools[0].sourceVersion, registrationIds: seed.registrationIds });
    await prisma.v1Tournament.update({ where: { id }, data: { status: 'in_progress' } });
    const groups = await prisma.v1TournamentGroup.findMany({ where: { tournamentId: id } });
    const details = await prisma.v1TournamentMatchDetails.findMany({ where: { tournamentId: id }, orderBy: { fixtureNumber: 'asc' } });
    const opening = details.filter(row => groups.find(group => group.id === row.groupId)?.phase === 'quarter');
    const semi = details.find(row => groups.find(group => group.id === row.groupId)?.phase === 'semi')!;
    for (const match of opening) await official(match.teamMatchId, 1, 0);
    await prisma.$transaction(tx => recalculateStandingsInTx(tx, id));
    await prisma.$transaction(tx => stages.advanceReadyInTx(tx, id));
    view = await stages.get(user, id);
    expect(view.pools[0].sixTeam).toMatchObject({ ready: true, bye: null, semifinalReady: false });
    const state = view.pools[0].sixTeam!;
    await expect(prisma.$transaction(tx => assertStageFixtureReady(tx, semi.teamMatchId))).rejects.toMatchObject({ response: { code: 'STAGE_ASSIGNMENT_REQUIRED' } });
    view = await stages.selectSixTeamBye(user, id, { expectedRevision: view.revision, poolKey: 'six', sourceVersion: state.sourceVersion, byeRegistrationId: opening[1].homeRegistrationId, reason: '동률 결승 직행 추첨 결과' });
    expect(view.pools[0].sixTeam?.semifinalReady).toBe(true);
    const before = await prisma.v1TournamentMatchDetails.findUniqueOrThrow({ where: { teamMatchId: semi.teamMatchId } });
    await official(opening[0].teamMatchId, 2, 0);
    await prisma.$transaction(tx => recalculateStandingsInTx(tx, id));
    await prisma.$transaction(tx => stages.advanceReadyInTx(tx, id));
    view = await stages.get(user, id);
    expect(view.pools[0].sixTeam?.needsReview).toBe(true);
    expect(await prisma.v1TournamentMatchDetails.findUniqueOrThrow({ where: { teamMatchId: semi.teamMatchId } })).toEqual(before);
    await expect(prisma.$transaction(tx => assertStageFixtureReady(tx, semi.teamMatchId))).rejects.toMatchObject({ response: { code: 'STAGE_ASSIGNMENT_REQUIRED' } });
    view = await stages.selectSixTeamBye(user, id, { expectedRevision: view.revision, poolKey: 'six', sourceVersion: view.pools[0].sixTeam!.sourceVersion, byeRegistrationId: null, reason: '정정된 공식 결과의 성적 비교 적용' });
    expect(view.pools[0].sixTeam).toMatchObject({ bye: opening[0].homeRegistrationId, manual: false, needsReview: false, semifinalReady: true });
    await official(semi.teamMatchId, 1, 0);
    await prisma.$transaction(tx => stages.advanceReadyInTx(tx, id));
    view = await stages.get(user, id);
    expect(view.pools[0].sixTeam?.finalReady).toBe(true);
    const final = details.find(row => groups.find(group => group.id === row.groupId)?.phase === 'final')!;
    await prisma.$transaction(tx => assertStageFixtureReady(tx, final.teamMatchId));
    await official(final.teamMatchId, 1, 0);
    expect((await stages.get(user, id)).pools[0].complete).toBe(true);
    await official(opening[2].teamMatchId, 3, 0);
    const corrected = await stages.get(user, id);
    expect(corrected.pools[0].sixTeam?.finalReady).toBe(false);
    expect(corrected.pools[0].complete).toBe(false);
  });
  it('공식 순위의 조간 비교 와일드카드를 경기당 성적으로 분리한다', async () => {
    const keys = ['a', 'b', 'c'];
    const config: StagePlanDto = { version: 1, stages: [
      { key: 'pre', name: '예선', pools: keys.map(key => ({ key, name: key, format: 'league', capacity: 2, legs: 1, sources: [] })) },
      { key: 'main', name: '본선', pools: [{ key: 'wild', name: '와일드카드', format: 'league', capacity: 2, legs: 1, sources: [1, 2].map(comparisonPosition => ({ poolKey: 'a', rank: 2, comparisonPoolKeys: keys, comparisonPosition })) }] },
    ] };
    const seed = await seeded('stage-wildcard', config, 6), id = seed.tournamentId;
    let view = await stages.generate(user, id, { expectedRevision: 1 });
    const losers: string[] = [];
    for (let i = 0; i < 3; i++) {
      const pool = view.pools[i]; view = await stages.assign(user, id, { expectedRevision: view.revision, poolKey: pool.key, sourceVersion: pool.sourceVersion, registrationIds: seed.registrationIds.slice(i * 2, i * 2 + 2) });
      const match = await prisma.v1TournamentMatchDetails.findUniqueOrThrow({ where: { teamMatchId: pool.fixtureIds[0] } });
      losers.push(match.awayRegistrationId!); await official(match.teamMatchId, [1, 3, 2][i], 0);
    }
    await prisma.$transaction(tx => recalculateStandingsInTx(tx, id)); view = await stages.get(user, id);
    const wild = view.pools.find(pool => pool.key === 'wild')!;
    expect(wild.candidates).toEqual([[losers[0]], [losers[2]]]);
    view = await stages.assign(user, id, { expectedRevision: view.revision, poolKey: wild.key, sourceVersion: wild.sourceVersion, registrationIds: wild.candidates.map(ids => ids[0]) });
    expect(view.pools.find(pool => pool.key === 'wild')?.assigned).toBe(true);
  });
  it('담당 디렉터의 일반 편집과 플랫폼 전용 예외 배정을 구분하고 조회 스태프·선수·타 대회를 거부한다', async () => {
    const config: StagePlanDto = { version: 1, stages: [{ key: 'main', name: '본선', pools: [{ key: 'one', name: '리그', format: 'league', capacity: 2, legs: 1, sources: [] }] }] };
    const seed = await seeded('stage-role-boundary', config, 2), id = seed.tournamentId;
    let view = await stages.generate(user, id, { expectedRevision: 1 });
    const actors = await Promise.all(['director', 'readonly', 'operator', 'player'].map(async label => {
      const row = await prisma.v1User.create({ data: { email: `stage-role-${label}@example.test`, accountStatus: 'active', onboardingStatus: 'completed' } });
      return { id: row.id, email: row.email, accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
    }));
    const [director, readonly, operator, player] = actors;
    const directorGrant = await prisma.v1TournamentStaffAssignment.create({ data: { tournamentId: id, userId: director.id, role: 'TOURNAMENT_DIRECTOR', grantedByUserId: user.id } });
    const field = await prisma.v1TournamentField.create({ data: { tournamentId: id, scopeKey: id, name: '권한 검증 구장' } });
    await prisma.v1TournamentStaffAssignment.createMany({ data: [{ tournamentId: id, userId: readonly.id, role: 'SUPPORT_READONLY', grantedByUserId: user.id }, { tournamentId: id, userId: operator.id, role: 'FIELD_OPERATOR', fieldId: field.id, grantedByUserId: user.id }] });
    view = await stages.rename(director, id, { expectedRevision: view.revision, poolKey: 'one', name: '담당 대회 본선' });
    expect(view.pools[0].name).toBe('담당 대회 본선');
    const input = { expectedRevision: view.revision, poolKey: 'one', sourceVersion: view.pools[0].sourceVersion, registrationIds: seed.registrationIds };
    await expect(stages.assign(director, id, { ...input, overrideCandidates: true, reason: '플랫폼 전용 예외 시도' })).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    for (const actor of [readonly, operator, player]) await expect(stages.assign(actor, id, input)).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    await expect(stages.get(director, ids.tournamentId)).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    await prisma.v1TournamentStaffAssignment.update({ where: { id: directorGrant.id }, data: { revokedAt: new Date(), version: { increment: 1 } } });
    await expect(stages.assign(director, id, input)).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
  });
  it('마지막 미시작 경기를 삭제해도 생성 상태와 복원 진입을 유지한다', async () => {
    const config: StagePlanDto = { version: 1, stages: [{ key: 'main', name: '본선', pools: [{ key: 'one', name: '리그', format: 'league', capacity: 2, legs: 1, sources: [] }] }] };
    const seed = await seeded('stage-last-fixture-repair', config, 2), id = seed.tournamentId;
    let view = await stages.generate(user, id, { expectedRevision: 1 });
    const fixtureId = view.pools[0].fixtureIds[0];
    view = await stages.repairFixture(user, id, { expectedRevision: view.revision, fixtureId, action: 'remove', reason: '유일한 예정 경기 재편성' });
    expect(view.pools[0]).toMatchObject({ generated: true, complete: false, fixtureIds: [], removedFixtures: [{ id: fixtureId }] });
    view = await stages.repairFixture(user, id, { expectedRevision: view.revision, fixtureId, action: 'restore', reason: '편성의 예정 경기 복원' });
    expect(view.pools[0].fixtureIds).toHaveLength(1);
  });
  it('첫 단계 전체 팀을 중복 없이 무작위 배정하며 경기 ID와 시작 잠금을 유지한다', async () => {
    const config: StagePlanDto = { version: 1, stages: [{ key: 'main', name: '본선', pools: ['a', 'b'].map(key => ({ key, name: key, format: 'league', capacity: 2, legs: 1, sources: [] })) }] };
    const seed = await seeded('stage-random-fill', config, 4), id = seed.tournamentId;
    let view = await stages.generate(user, id, { expectedRevision: 1 });
    const fixtureIds = view.pools.flatMap(pool => pool.fixtureIds);
    view = await stages.randomize(user, id, { expectedRevision: view.revision });
    expect(new Set(view.pools.flatMap(pool => pool.registrationIds))).toEqual(new Set(seed.registrationIds));
    expect(view.pools.every(pool => pool.assigned && !pool.stale)).toBe(true);
    expect(view.pools.flatMap(pool => pool.fixtureIds)).toEqual(fixtureIds);
    await prisma.v1Game.update({ where: { teamMatchId: fixtureIds[0] }, data: { state: 'LIVE' } });
    await expect(stages.randomize(user, id, { expectedRevision: view.revision })).rejects.toMatchObject({ response: { code: 'BRACKET_LOCKED' } });
  });
});
