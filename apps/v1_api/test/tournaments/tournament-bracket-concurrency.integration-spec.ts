import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GamesService, canonicalGameCommandPayloadHash } from '../../src/games/games.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { TournamentBracketService } from '../../src/tournaments/tournament-bracket.service';
import { TournamentResultReviewService } from '../../src/tournament-operations/results/tournament-result-review.service';
import { TournamentStaffAccessService } from '../../src/tournaments/staff/tournament-staff-access.service';
import { handleCompetitionRosterResync } from '../../src/games/roster/game-roster-sync';
import { competitionConfigFixture as ids, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';

const prisma = new PrismaService();
const user = { id: ids.adminUserId, email: 'bracket-concurrency@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const bracket = (db = prisma) => new TournamentBracketService(db, new AdminContextService(db), games);
const review = (db = prisma) => new TournamentResultReviewService(db, new TournamentStaffAccessService(db), new OperationAuditWriterService());
const gate = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};
let round12: string;
let quarter: string;

async function officialRequest(gameId: string, commandId: string) {
  const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
  const last = await prisma.v1GameResultRevision.findFirst({ where: { gameId }, orderBy: { revision: 'desc' } });
  const revision = await prisma.v1GameResultRevision.create({ data: {
    gameId, revision: (last?.revision ?? 0) + 1, state: 'SUBMITTED', score: { home: 1, away: 0 },
    goalEvents: [], missingScorer: true, eventsHash: commandId, submittedAt: new Date(),
    createdByActorType: 'USER', createdByUserId: user.id,
  } });
  return { revisionId: revision.id, dto: { expectedVersion: game.version, clientCommandId: commandId,
    projectionPreviewHash: canonicalGameCommandPayloadHash({ score: revision.score, goalEvents: revision.goalEvents,
      eventsHash: revision.eventsHash, mvpParticipantId: revision.mvpParticipantId }) } };
}

async function waitForSourceLock(): Promise<void> {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
      SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
        AND wait_event_type = 'Lock' AND query LIKE '%FROM v1_games WHERE team_match_id IN%') AS waiting`;
    if (rows[0].waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('PATCH did not reach a real PostgreSQL lock wait');
}

describe('대진 PATCH와 실제 결과 확정의 PostgreSQL 동시성', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await seedCompetitionConfigFixture(prisma, user);
    round12 = (await bracket().createGroup(user, ids.tournamentId, { name: '12강', phase: 'round12' })).id;
    quarter = (await bracket().createGroup(user, ids.tournamentId, { name: '8강', phase: 'quarter' })).id;
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it('출처와 대상 잠금 사이에 결과 명단 워커가 겹치면 교착 대신 워커를 재시도한다', async () => {
    const fixtures = await Promise.all([301, 302].map((fixtureNumber) => bracket().createFixture(user, ids.tournamentId, {
      groupId: round12, round: '12강', fixtureNumber,
      homeRegistrationId: ids.registrationIds[0], awayRegistrationId: ids.registrationIds[2],
    })));
    const gameRows = await prisma.v1Game.findMany({ where: { teamMatchId: { in: fixtures.map((row) => row.id) } }, orderBy: { id: 'asc' } });
    const target = gameRows[0]; const source = gameRows[1];
    if (target?.teamMatchId == null || source?.teamMatchId == null) throw new Error('Expected two canonical fixtures');
    await prisma.v1TournamentMatchDetails.update({ where: { teamMatchId: target.teamMatchId }, data: {
      groupId: quarter, round: '8강', homeRegistrationId: null, awayRegistrationId: ids.registrationIds[1],
    } });
    await prisma.v1TeamMatch.update({ where: { id: target.teamMatchId }, data: { hostTeamId: null, approvedApplicantTeamId: ids.teamIds[1] } });
    await prisma.v1GameSide.updateMany({ where: { gameId: target.id, sideKey: 'HOME' }, data: { teamId: null } });
    await prisma.v1GameSide.updateMany({ where: { gameId: target.id, sideKey: 'AWAY' }, data: { teamId: ids.teamIds[1] } });
    const previous = await bracket().createFixture(user, ids.tournamentId, { groupId: ids.groupId, round: 'group', fixtureNumber: 303,
      homeRegistrationId: ids.registrationIds[0], awayRegistrationId: ids.registrationIds[1] });
    const previousGame = await prisma.v1Game.update({ where: { teamMatchId: previous.id }, data: { state: 'ENDED' } });
    await prisma.v1Tournament.update({ where: { id: ids.tournamentId }, data: { yellowAccumulationLimit: 2 } });
    const workerLocked = gate(); const workerRelease = gate(); const patchLocked = gate(); const patchRelease = gate();
    const event = { id: '11000000-0000-4000-8000-000000000099', payload: { scope: 'result', gameId: previousGame.id } };
    const worker = prisma.$transaction((tx) => handleCompetitionRosterResync(new Proxy(tx, { get(client, key) {
      if (key !== '$queryRaw') return Reflect.get(client, key);
      return async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const result = await client.$queryRaw(strings, ...values);
        if (strings.join('?').includes('FROM v1_games WHERE id =') && values[0] === target.id) {
          workerLocked.resolve(); await workerRelease.promise;
        }
        return result;
      };
    } }), event), { timeout: 15000 });
    const workerOutcome = worker.then((value) => ({ value }), (error: unknown) => ({ error }));
    await workerLocked.promise;
    const db = new Proxy(prisma, { get(client, key) {
      if (key !== '$transaction') return Reflect.get(client, key);
      return (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options: object) => client.$transaction((tx) => callback(new Proxy(tx, { get(transaction, property) {
        if (property !== '$queryRaw') return Reflect.get(transaction, property);
        return async (strings: TemplateStringsArray, ...values: unknown[]) => {
          const result = await transaction.$queryRaw(strings, ...values);
          if (strings.join('?').includes('FROM v1_games WHERE team_match_id IN')) {
            patchLocked.resolve(); await patchRelease.promise;
          }
          return result;
        };
      } })), options);
    } });
    const patch = bracket(db).updateBracketSources(user, target.teamMatchId, { homeSourceFixtureId: source.teamMatchId });
    const patchOutcome = patch.then((value) => ({ value }), (error: unknown) => ({ error }));
    try { await patchLocked.promise; } finally { workerRelease.resolve(); patchRelease.resolve(); }
    expect(await workerOutcome).toMatchObject({ error: { response: { code: 'COMMAND_CONCURRENCY_CONFLICT' } } });
    expect(await patchOutcome).toMatchObject({ value: { fixtureId: target.teamMatchId } });
    await expect(prisma.$transaction((tx) => handleCompetitionRosterResync(tx, event), { timeout: 15000 })).resolves.toBeGreaterThanOrEqual(0);
    expect(await prisma.v1TournamentMatchAdvancementEdge.findFirst({ where: { sourceTeamMatchId: source.teamMatchId, targetTeamMatchId: target.teamMatchId } })).not.toBeNull();
  }, 30000);

  it('대상 UUID가 더 작아도 출처를 먼저 잠가 결과 확정과 연결 PATCH가 교착하지 않는다', async () => {
    const sourceId = ids.teamMatchIds[2];
    const targetId = ids.teamMatchIds[0];
    const sourceGameId = ids.canonicalGameIds[2];
    expect(ids.canonicalGameIds[0] < sourceGameId).toBe(true);
    await prisma.v1TournamentMatchDetails.update({ where: { teamMatchId: sourceId }, data: { groupId: round12, round: '12강' } });
    await prisma.v1TournamentMatchDetails.update({ where: { teamMatchId: targetId }, data: { groupId: quarter, round: '8강', homeRegistrationId: null, awayRegistrationId: null } });
    await prisma.v1TeamMatch.update({ where: { id: sourceId }, data: { status: 'matched' } });
    await prisma.v1TeamMatch.update({ where: { id: targetId }, data: { status: 'matched', hostTeamId: null, approvedApplicantTeamId: null } });
    await prisma.v1Game.update({ where: { id: sourceGameId }, data: { currentOfficialRevisionId: null } });
    await prisma.v1Game.update({ where: { id: ids.canonicalGameIds[0] }, data: { state: 'SCHEDULED', currentOfficialRevisionId: null } });
    await prisma.v1GameSide.updateMany({ where: { gameId: ids.canonicalGameIds[0] }, data: { teamId: null, displayNameSnapshot: 'TBD' } });
    await prisma.v1TournamentMatchAdvancementEdge.create({ data: { tournamentId: ids.tournamentId, sourceTeamMatchId: sourceId, targetTeamMatchId: targetId, sourceOutcome: 'WINNER', targetSide: 'HOME' } });
    const request = await officialRequest(sourceGameId, 'bracket-concurrent-official');
    const locked = gate(); const release = gate();
    // Pause the real result command immediately AFTER its real source row lock.
    const db = new Proxy(prisma, { get(target, key) {
      if (key !== '$transaction') return Reflect.get(target, key);
      return (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options: object) => target.$transaction((tx) => callback(new Proxy(tx, { get(client, property) {
        if (property !== '$queryRaw') return Reflect.get(client, property);
        return async (strings: TemplateStringsArray, ...values: unknown[]) => {
          const result = await client.$queryRaw(strings, ...values);
          if (strings.join('?').includes('SELECT id FROM v1_games WHERE id =')) { locked.resolve(); await release.promise; }
          return result;
        };
      } })), options);
    } }) as PrismaService;
    const official = review(db).officializeResultRevision(user, sourceGameId, request.revisionId, request.dto.clientCommandId, request.dto);
    const officialOutcome = official.then((value) => ({ value }), (error: unknown) => ({ error }));
    await locked.promise;
    const patch = bracket().updateBracketSources(user, targetId, { homeSourceFixtureId: sourceId });
    const patchOutcome = patch.then((value) => ({ value }), (error: unknown) => ({ error }));
    try { await waitForSourceLock(); } finally { release.resolve(); }
    const result = await officialOutcome;
    expect(result).toHaveProperty('value.revisionState', 'OFFICIAL');
    const changed = await patchOutcome;
    expect(changed).toMatchObject({ error: { response: { code: 'BRACKET_SOURCE_LOCKED' } } });
    const source = await prisma.v1TournamentMatchDetails.findUniqueOrThrow({ where: { teamMatchId: sourceId } });
    const target = await prisma.v1TournamentMatchDetails.findUniqueOrThrow({ where: { teamMatchId: targetId } });
    expect(target.homeRegistrationId).toBe(source.homeRegistrationId);
  }, 20000);

  it('최초 조회의 null 이후 승자가 배정되면 explicit-null PATCH는 409이고 배정은 보존된다', async () => {
    const source = await bracket().createFixture(user, ids.tournamentId, { groupId: round12, round: '12강', fixtureNumber: 200, homeRegistrationId: ids.registrationIds[1], awayRegistrationId: ids.registrationIds[2] });
    const target = await bracket().createFixture(user, ids.tournamentId, { groupId: quarter, round: '8강', fixtureNumber: 200, homeRegistrationId: ids.registrationIds[0] });
    await bracket().updateBracketSources(user, target.id, { awaySourceFixtureId: source.id });
    const game = await prisma.v1Game.update({ where: { teamMatchId: source.id }, data: { state: 'ENDED' } });
    const request = await officialRequest(game.id, 'bracket-stale-null-official');
    const read = gate(); const release = gate();
    const details = new Proxy(prisma.v1TournamentMatchDetails, { get(delegate, key) {
      if (key !== 'findUnique') return Reflect.get(delegate, key);
      return async (args: Prisma.V1TournamentMatchDetailsFindUniqueArgs) => {
        const row = await delegate.findUnique(args);
        if (args.where.teamMatchId === target.id) { read.resolve(); await release.promise; }
        return row;
      };
    } });
    const db = new Proxy(prisma, { get(client, key) { return key === 'v1TournamentMatchDetails' ? details : Reflect.get(client, key); } }) as PrismaService;
    const patch = bracket(db).updateFixture(user, target.id, { awayRegistrationId: null });
    const outcome = patch.then((value) => ({ value }), (error: unknown) => ({ error }));
    await read.promise;
    try { await review().officializeResultRevision(user, game.id, request.revisionId, request.dto.clientCommandId, request.dto); }
    finally { release.resolve(); }
    expect(await outcome).toMatchObject({ error: { response: { code: 'BRACKET_SOURCE_SLOT_LINKED' } } });
    expect((await prisma.v1TournamentMatchDetails.findUniqueOrThrow({ where: { teamMatchId: target.id } })).awayRegistrationId).toBe(ids.registrationIds[1]);
    expect((await prisma.v1Game.findUniqueOrThrow({ where: { id: game.id } })).currentOfficialRevisionId).toBe(request.revisionId);
  }, 20000);
});
