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
import type { StagePlanDto } from '../../src/tournaments/stages/stage-plan.dto';
import { recalculateStandingsInTx } from '../../src/tournaments/tournament-bracket-tx';
import { competitionConfigFixture as ids, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';
import { seedBracketTournament, seedSupportAdmin } from '../helpers/bracket-canvas-fixture';

jest.setTimeout(120_000);
const prisma = new PrismaService(), admins = new AdminContextService(prisma);
const user = { id: ids.adminUserId, email: 'stage-tie-break@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService(), new TournamentStaffAccessService(prisma));
const templates = new BracketTemplateService(prisma, admins, games), stages = new StagePlanService(prisma, admins, templates, games);
const admin = new TournamentsAdminService(prisma, admins, {} as NotificationsService);

const DEFAULT_ORDER = ['points', 'head_to_head', 'goal_difference', 'goals_for', 'fair_play', 'fewest_goals_against', 'seeded_draw'];
const GOALS_FIRST = ['points', 'goal_difference', 'goals_for', 'head_to_head', 'fair_play', 'fewest_goals_against', 'seeded_draw'];
const FAIR_PLAY_FIRST = ['points', 'fair_play', 'head_to_head', 'goal_difference', 'goals_for', 'fewest_goals_against', 'seeded_draw'];
const LEGACY_FAIR_PLAY_FIRST = ['points', 'fair_play', 'head_to_head', 'goal_difference', 'goals_for', 'seeded_draw'];

// 예선(풀리그 4팀) → 본선(풀리그 2팀) → 결선(토너먼트 2팀). 결선은 순위표가 없어 동점 순서도 없다.
const CONFIG: StagePlanDto = { version: 1, stages: [
  { key: 'pre', name: '예선', pools: [{ key: 'p', name: '예선 리그', format: 'league', capacity: 4, legs: 1, sources: [] }] },
  { key: 'main', name: '본선', pools: [{ key: 'm', name: '본선 리그', format: 'league', capacity: 2, legs: 1, sources: [{ poolKey: 'p', rank: 1 }, { poolKey: 'p', rank: 2 }] }] },
  { key: 'final', name: '결선', pools: [{ key: 'k', name: '결승', format: 'knockout', capacity: 2, legs: 1, sources: [{ poolKey: 'm', rank: 1 }, { poolKey: 'm', rank: 2 }] }] },
] };

async function official(fixtureId: string, home: number, away: number) {
  const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId: fixtureId } });
  const revision = await prisma.v1GameResultRevision.create({ data: { gameId: game.id, revision: 1, state: 'DRAFT', score: { home, away }, eventsHash: `stage-tb-${game.id}`, createdByActorType: 'SYSTEM', createdBySystemActor: 'TEST_FIXTURE' } });
  await prisma.v1GameResultRevision.update({ where: { id: revision.id }, data: { state: 'OFFICIAL', officialAt: new Date() } });
  await prisma.v1Game.update({ where: { id: game.id }, data: { state: 'ENDED', currentOfficialRevisionId: revision.id } });
  await prisma.v1TeamMatch.update({ where: { id: fixtureId }, data: { status: 'completed' } });
}

async function seededStageTournament(label: string) {
  const seed = await seedBracketTournament(prisma, { label, format: 'group_knockout', teamCount: 4 });
  await prisma.v1Tournament.update({ where: { id: seed.tournamentId }, data: { stagePlan: JSON.parse(JSON.stringify(CONFIG)), stagePlanRevision: 1, teamCount: 4, format: 'league_knockouts' } });
  let view = await stages.generate(user, seed.tournamentId, { expectedRevision: 1 });
  const pool = view.pools.find((candidate) => candidate.key === 'p')!;
  view = await stages.assign(user, seed.tournamentId, { poolKey: 'p', expectedRevision: view.revision, sourceVersion: pool.sourceVersion, registrationIds: seed.registrationIds.slice(0, 4) });
  return { id: seed.tournamentId, registrationIds: seed.registrationIds.slice(0, 4), revision: view.revision };
}

describe('단계별 동점 순서 (PostgreSQL, MD-QA #186)', () => {
  beforeAll(async () => { await prisma.$connect(); await seedCompetitionConfigFixture(prisma, user); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('단계 설정을 저장·해제하고, 저장 순위·잠금·감사 기록이 단계별로 갈린다', async () => {
    const { id, registrationIds: [a, b, c], revision } = await seededStageTournament('stage-tb-main');

    const initial = (await admin.get(user, id)).stageTieBreak!;
    expect(initial.tournamentOrder).toEqual(DEFAULT_ORDER);
    expect(initial.stages.map((stage) => [stage.stageKey, stage.ranked, stage.order, stage.lockedReason])).toEqual([
      ['pre', true, null, null], ['main', true, null, null], ['final', false, null, null],
    ]);

    // 예선은 득실차 우선, 본선은 옛 6칸 페어플레이 우선(7칸으로 저장).
    const pre = await stages.updateTieBreakOrder(user, id, 'pre', { expectedRevision: revision, order: GOALS_FIRST });
    expect(pre.revision).toBe(revision + 1);
    const main = await stages.updateTieBreakOrder(user, id, 'main', { expectedRevision: pre.revision, order: LEGACY_FAIR_PLAY_FIRST });
    expect(main.stageTieBreak.stages.find((stage) => stage.stageKey === 'main')).toMatchObject({ order: FAIR_PLAY_FIRST, resolvedOrder: FAIR_PLAY_FIRST });
    expect(await prisma.v1TournamentStageTieBreakSetting.findMany({ where: { tournamentId: id }, orderBy: { stageKey: 'asc' }, select: { stageKey: true, order: true } }))
      .toEqual([{ stageKey: 'main', order: FAIR_PLAY_FIRST }, { stageKey: 'pre', order: GOALS_FIRST }]);
    const audit = await prisma.v1AdminActionLog.findFirstOrThrow({ where: { targetId: id, action: 'tournament.stage_tie_break.update' }, orderBy: { createdAt: 'desc' } });
    expect(audit.beforeJson).toMatchObject({ stageKey: 'main', inherit: true, order: null, resolvedOrder: DEFAULT_ORDER });
    expect(audit.afterJson).toMatchObject({ stageKey: 'main', inherit: false, order: FAIR_PLAY_FIRST });

    // 같은 값 재전송은 아무것도 바꾸지 않는다(revision 그대로, 감사 없음).
    const same = await stages.updateTieBreakOrder(user, id, 'main', { expectedRevision: main.revision, order: FAIR_PLAY_FIRST });
    expect(same.revision).toBe(main.revision);
    await expect(stages.updateTieBreakOrder(user, id, 'main', { expectedRevision: revision, order: null })).rejects.toMatchObject({ response: { code: 'STAGE_PLAN_STALE' } });
    await expect(stages.updateTieBreakOrder(user, id, 'final', { expectedRevision: main.revision, order: GOALS_FIRST })).rejects.toMatchObject({ response: { code: 'STAGE_PLAN_INVALID' } });
    await expect(stages.updateTieBreakOrder(user, id, 'nope', { expectedRevision: main.revision, order: GOALS_FIRST })).rejects.toMatchObject({ response: { code: 'STAGE_PLAN_INVALID' } });
    await expect(stages.updateTieBreakOrder(user, id, 'pre', { expectedRevision: main.revision, order: ['points', 'seeded_draw'] })).rejects.toMatchObject({ response: { code: 'TIE_BREAK_ORDER_INVALID' } });
    const support = await seedSupportAdmin(prisma, 'stage-tb-support');
    await expect(stages.updateTieBreakOrder(support, id, 'pre', { expectedRevision: main.revision, order: null })).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });

    // a 가 b 를 1-0 으로 이겼지만(맞대결) b 가 c 를 5-0 으로 이겨 득실차가 크다 — 예선은 득실차 우선이라 b 가 앞선다.
    const fixtures = await prisma.v1TournamentMatchDetails.findMany({ where: { tournamentId: id, group: { stageKey: 'pre' } } });
    const between = (x: string, y: string) => fixtures.find((f) => [f.homeRegistrationId, f.awayRegistrationId].sort().join() === [x, y].sort().join())!;
    const ab = between(a, b), bc = between(b, c);
    await official(ab.teamMatchId, ab.homeRegistrationId === a ? 1 : 0, ab.homeRegistrationId === a ? 0 : 1);
    await official(bc.teamMatchId, bc.homeRegistrationId === b ? 5 : 0, bc.homeRegistrationId === b ? 0 : 5);
    await prisma.$transaction((tx) => recalculateStandingsInTx(tx, id));
    const standings = await prisma.v1TournamentStanding.findMany({ where: { group: { tournamentId: id, stageKey: 'pre' } }, orderBy: { position: 'asc' }, select: { registrationId: true } });
    expect(standings.slice(0, 2).map((row) => row.registrationId)).toEqual([b, a]);

    // 예선 결과가 생겼다 — 예선 단계 설정은 잠기고, 대회 설정은 모든 순위 단계가 따로 정해져 있어 계속 바꿀 수 있다.
    const locked = (await admin.get(user, id)).stageTieBreak!;
    expect(locked.stages.find((stage) => stage.stageKey === 'pre')!.lockedReason).toContain('확정');
    expect(locked.stages.find((stage) => stage.stageKey === 'main')!.lockedReason).toBeNull();
    await expect(stages.updateTieBreakOrder(user, id, 'pre', { expectedRevision: main.revision, order: null })).rejects.toMatchObject({ response: { code: 'TIE_BREAK_ORDER_LOCKED' } });
    expect((await admin.get(user, id)).tieBreakOrderBlockedReason).toBeNull();
    const updatedAt = (await prisma.v1Tournament.findUniqueOrThrow({ where: { id } })).updatedAt.toISOString();
    await admin.update(user, id, { expectedVersion: updatedAt, tieBreakOrder: FAIR_PLAY_FIRST });

    // 본선을 대회 설정 따름으로 되돌리면 본선은 대회 순서를 쓴다(본선엔 결과가 없어 대회 설정은 여전히 열려 있다).
    const inherited = await stages.updateTieBreakOrder(user, id, 'main', { expectedRevision: main.revision, order: null });
    expect(inherited.stageTieBreak.stages.find((stage) => stage.stageKey === 'main')).toMatchObject({ order: null, resolvedOrder: FAIR_PLAY_FIRST });
    expect((await admin.get(user, id)).tieBreakOrderBlockedReason).toBeNull();

    // 예선 단계 설정을 지울 수 없으니(잠김) 대회 설정이 예선에 영향을 주지 않는다 — 저장 순위는 그대로 득실차 우선이다.
    await prisma.$transaction((tx) => recalculateStandingsInTx(tx, id));
    const after = await prisma.v1TournamentStanding.findMany({ where: { group: { tournamentId: id, stageKey: 'pre' } }, orderBy: { position: 'asc' }, select: { registrationId: true } });
    expect(after.slice(0, 2).map((row) => row.registrationId)).toEqual([b, a]);
  });

  it('대회 설정을 따르는 단계에 결과가 생기면 대회 설정이 잠긴다', async () => {
    const { id, registrationIds: [a, b] } = await seededStageTournament('stage-tb-inherit');
    const fixture = (await prisma.v1TournamentMatchDetails.findMany({ where: { tournamentId: id, group: { stageKey: 'pre' } } }))
      .find((f) => [f.homeRegistrationId, f.awayRegistrationId].sort().join() === [a, b].sort().join())!;
    await official(fixture.teamMatchId, 1, 0);
    expect((await admin.get(user, id)).tieBreakOrderBlockedReason).toContain('결과');
    const updatedAt = (await prisma.v1Tournament.findUniqueOrThrow({ where: { id } })).updatedAt.toISOString();
    await expect(admin.update(user, id, { expectedVersion: updatedAt, tieBreakOrder: GOALS_FIRST })).rejects.toMatchObject({ response: { code: 'TIE_BREAK_ORDER_LOCKED' } });
  });
});
