import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GamesService } from '../../src/games/games.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { TournamentStaffAccessService } from '../../src/tournaments/staff/tournament-staff-access.service';
import { BracketTemplateService } from '../../src/tournaments/templates/bracket-template.service';
import { StagePlanService } from '../../src/tournaments/stages/stage-plan.service';
import { GameResultStandingsProjectionService } from '../../src/game-operations/game-result-standings-projection.service';
import { V1GameOperationsWorkerService } from '../../src/jobs/v1-game-operations-worker.service';
import type { OfficialRevisionRow } from '../../src/game-operations/game-result-official-projection.types';
import { competitionConfigFixture as ids, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';
import { seedBracketTournament } from '../helpers/bracket-canvas-fixture';
jest.setTimeout(120_000);
describe('stage advancement durable worker', () => {
  const prisma = new PrismaService(), admins = new AdminContextService(prisma);
  const user = { id: ids.adminUserId, email: 'stage-worker@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
  const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService(), new TournamentStaffAccessService(prisma));
  const stages = new StagePlanService(prisma, admins, new BracketTemplateService(prisma, admins, games), games);
  const worker = new V1GameOperationsWorkerService(prisma, undefined, undefined, undefined, stages);
  beforeAll(async () => { await prisma.$connect(); await seedCompetitionConfigFixture(prisma, user); });
  afterAll(async () => { await worker.shutdown(); await prisma.$disconnect(); });
  it('official standings enqueue once, the real worker assigns the next pool, and replay preserves its revision', async () => {
    const seed = await seedBracketTournament(prisma, { label: 'stage-worker', format: 'group_knockout', teamCount: 2, status: 'in_progress' });
    const id = seed.tournamentId;
    const stagePlan = { version: 1, autoAdvance: true, stages: [
      { key: 'pre', name: '예선', pools: [{ key: 'pre', name: '예선 리그', format: 'league', capacity: 2, legs: 1, sources: [] }] },
      { key: 'main', name: '본선', pools: [{ key: 'main', name: '본선 리그', format: 'league', capacity: 2, legs: 1, sources: [{ poolKey: 'pre', rank: 1 }, { poolKey: 'pre', rank: 2 }] }] },
    ] };
    await prisma.v1Tournament.update({ where: { id }, data: { stagePlan, stagePlanRevision: 1, teamCount: 2, format: 'league_knockouts' } });
    let view = await stages.generate(user, id, { expectedRevision: 1 });
    view = await stages.assign(user, id, { expectedRevision: view.revision, poolKey: 'pre', sourceVersion: view.pools[0].sourceVersion, registrationIds: seed.registrationIds });
    const fixtureId = view.pools[0].fixtureIds[0], game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId: fixtureId } });
    const revision = await prisma.v1GameResultRevision.create({ data: { gameId: game.id, revision: 1, state: 'DRAFT', score: { home: 1, away: 0 }, eventsHash: 'stage-worker-official', createdByActorType: 'SYSTEM', createdBySystemActor: 'TEST_FIXTURE' } });
    const now = new Date();
    await prisma.v1GameResultRevision.update({ where: { id: revision.id }, data: { state: 'OFFICIAL', officialAt: now } });
    await prisma.v1Game.update({ where: { id: game.id }, data: { state: 'ENDED', currentOfficialRevisionId: revision.id } });
    await prisma.v1TeamMatch.update({ where: { id: fixtureId }, data: { status: 'completed' } });
    const source: OfficialRevisionRow = { revisionId: revision.id, gameId: game.id, revision: 1, score: revision.score, sourceHash: revision.eventsHash, playedAt: now, officialAt: now, reason: null, outcomeReason: 'NORMAL', sourceType: 'TEAM_MATCH', currentOfficialRevisionId: revision.id, teamMatchId: fixtureId, tournamentTeamMatchId: fixtureId, leagueId: null, teamMatchTournamentId: id, tournamentId: id, homeTeamId: null, awayTeamId: null, visibility: 'OFFICIAL_ONLY' };
    const projector = new GameResultStandingsProjectionService();
    await prisma.$transaction(tx => projector.project(tx, source));
    await prisma.$transaction(tx => projector.project(tx, source));
    expect(await prisma.v1OutboxEvent.count({ where: { type: 'STAGE_AUTO_ADVANCE', aggregateId: id, revisionId: revision.id } })).toBe(1);
    const drainUntil = async (done: () => Promise<boolean>) => {
      for (let attempt = 0; attempt < 80 && !await done(); attempt++) if (!await worker.processOne()) break;
      expect(await done()).toBe(true);
    };
    await drainUntil(async () => (await stages.get(user, id)).pools[1].assigned);
    const assigned = await stages.get(user, id);
    expect(assigned.pools[1].registrationIds).toHaveLength(2);
    expect(assigned.pools[1].stale).toBe(false);
    const replay = await prisma.v1OutboxEvent.create({ data: { businessKey: `stage-worker-replay:${id}`, aggregateType: 'TOURNAMENT', aggregateId: id, type: 'STAGE_AUTO_ADVANCE', payload: { tournamentId: id } } });
    await drainUntil(async () => (await prisma.v1OutboxEvent.findUniqueOrThrow({ where: { id: replay.id } })).status === 'COMPLETED');
    expect((await stages.get(user, id)).revision).toBe(assigned.revision);
  });
});
