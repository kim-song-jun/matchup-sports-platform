import { HttpException } from '@nestjs/common';
import { V1GameEventType, V1GameResultRevisionState, V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService, canonicalGameCommandPayloadHash } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PublicTournamentRecordsService } from '../../src/games/public-records/public-tournament-records.service';
import { V1GameOperationsWorkerService } from '../../src/jobs/v1-game-operations-worker.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TournamentResultReviewService } from '../../src/tournament-operations/results/tournament-result-review.service';
import { TournamentBracketService } from '../../src/tournaments/tournament-bracket.service';
import { TournamentStaffAccessService } from '../../src/tournaments/staff/tournament-staff-access.service';

/**
 * Admin fixture edit that swaps a team on an already started game, against real Postgres: the FK on
 * `reverses_event_id`, the result-revision triggers and the single transaction (`updateFixture` ->
 * `updateTournamentMatchInTx`) that deletes the replaced side's events and discards the unconfirmed result.
 */
const ids = {
  admin: '92000000-0000-4000-8000-000000000001',
  region: '92000000-0000-4000-8000-000000000011',
  hostTeam: '92000000-0000-4000-8000-000000000020',
  opponentTeam: '92000000-0000-4000-8000-000000000021',
  newTeam: '92000000-0000-4000-8000-000000000022',
  tournament: '92000000-0000-4000-8000-000000000030',
  group: '92000000-0000-4000-8000-000000000031',
  liveFixture: '92000000-0000-4000-8000-000000000040',
  endedFixture: '92000000-0000-4000-8000-000000000041',
  officialFixture: '92000000-0000-4000-8000-000000000042',
  hostRegistration: '92000000-0000-4000-8000-000000000050',
  opponentRegistration: '92000000-0000-4000-8000-000000000051',
  newRegistration: '92000000-0000-4000-8000-000000000052',
} as const;

const prisma = new PrismaService();
const audit = new OperationAuditWriterService();
const games = new GamesService(prisma, audit, new GameTakeoverService());
const staffAccess = new TournamentStaffAccessService(prisma);
const resultReview = new TournamentResultReviewService(prisma, staffAccess, audit);
const bracket = new TournamentBracketService(prisma, new AdminContextService(prisma), games);
const publicRecords = new PublicTournamentRecordsService(prisma, staffAccess);
let sportId: string;

const authUser = {
  id: ids.admin,
  email: 'started-team-change-admin@example.test',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

type Setup = {
  gameId: string;
  homeSideId: string;
  awaySideId: string;
  homeParticipantId: string;
  awayParticipantId: string;
  version: number;
};

async function takeover(gameId: string, seed: string): Promise<string> {
  const grant = await games.requestTakeover(authUser, gameId, { clientInstanceId: `swap-${seed}`, lastSequence: 0 });
  return grant.takeoverToken;
}

async function buildGame(fixtureId: string): Promise<Setup> {
  const config = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({
    where: { name: 'football-v1', status: 'ACTIVE' },
    orderBy: { version: 'desc' },
  });
  const input: GameSourceCreationInput = {
    sourceType: V1GameSourceType.TEAM_MATCH,
    sourceId: fixtureId,
    competitionConfigVersionId: config.id,
    sides: [
      { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Swap Host' },
      { sideKey: V1GameSideKey.AWAY, teamId: ids.opponentTeam, displayNameSnapshot: 'Swap Opponent' },
    ],
    participants: [
      { sourceParticipantId: `host-${fixtureId}`, sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Host Player' },
      { sourceParticipantId: `away-${fixtureId}`, sideKey: V1GameSideKey.AWAY, displayNameSnapshot: 'Away Player' },
    ],
  };
  const context: GameCommandContext = {
    actor: { actorType: 'USER', actorUserId: ids.admin, role: 'platform_ops' },
    expectedVersion: 0,
    durableCommandId: `swap-source-${fixtureId}`,
    payloadHash: canonicalGameCommandPayloadHash(input),
  };
  const created = await prisma.$transaction((tx) => games.createFromSourceInTransaction(tx, input, context));
  const gameId = created.gameId;
  const home = await prisma.v1GameSide.findFirstOrThrow({ where: { gameId, sideKey: V1GameSideKey.HOME } });
  const away = await prisma.v1GameSide.findFirstOrThrow({ where: { gameId, sideKey: V1GameSideKey.AWAY } });
  const homePlayer = await prisma.v1GameParticipant.findFirstOrThrow({ where: { gameId, sideId: home.id } });
  const awayPlayer = await prisma.v1GameParticipant.findFirstOrThrow({ where: { gameId, sideId: away.id } });
  await prisma.v1GameLineup.updateMany({ where: { gameId, sideId: { in: [home.id, away.id] }, revision: 1 }, data: { state: 'SUBMITTED' } });
  await prisma.v1GameVisibilityPolicy.updateMany({ where: { gameId }, data: { mode: 'LIVE' } });
  return { gameId, homeSideId: home.id, awaySideId: away.id, homeParticipantId: homePlayer.id, awayParticipantId: awayPlayer.id, version: 0 };
}

async function startGame(setup: Setup, fixtureId: string): Promise<void> {
  await games.executeCommand(authUser, setup.gameId, 'start', `swap-start-${fixtureId}`, {
    expectedVersion: setup.version,
    clientCommandId: `swap-start-${fixtureId}`,
    takeoverToken: await takeover(setup.gameId, `start-${fixtureId}`),
    occurredAt: new Date().toISOString(),
    payload: {},
  });
  setup.version += 1;
}

async function append(setup: Setup, clientEventId: string, event: {
  type: V1GameEventType;
  sideId: string;
  participantId: string;
  payload?: Record<string, unknown>;
}): Promise<string> {
  await games.appendEvent(authUser, setup.gameId, clientEventId, {
    expectedVersion: setup.version,
    clientEventId,
    takeoverToken: await takeover(setup.gameId, clientEventId),
    type: event.type,
    sideId: event.sideId,
    participantId: event.participantId,
    period: 1,
    clockMs: 60_000 + setup.version * 1000,
    occurredAt: new Date().toISOString(),
    payload: event.payload ?? {},
  });
  setup.version += 1;
  return (await prisma.v1GameEvent.findFirstOrThrow({ where: { gameId: setup.gameId, clientEventId } })).id;
}

async function reverse(setup: Setup, clientEventId: string, targetEventId: string): Promise<string> {
  await games.reverseEvent(authUser, setup.gameId, targetEventId, clientEventId, {
    expectedVersion: setup.version,
    clientEventId,
    takeoverToken: await takeover(setup.gameId, clientEventId),
    reason: 'mistaken entry',
  });
  setup.version += 1;
  return (await prisma.v1GameEvent.findFirstOrThrow({ where: { gameId: setup.gameId, clientEventId } })).id;
}

/** Plays `homeGoals`-`awayGoals` and ends the game; `officialize` confirms the resulting SUBMITTED revision. */
async function playAndEnd(setup: Setup, fixtureId: string, score: { home: number; away: number }, officialize: boolean) {
  for (let i = 0; i < score.home; i += 1) {
    await append(setup, `${fixtureId}-h${i}`, { type: V1GameEventType.GOAL, sideId: setup.homeSideId, participantId: setup.homeParticipantId });
  }
  for (let i = 0; i < score.away; i += 1) {
    await append(setup, `${fixtureId}-a${i}`, { type: V1GameEventType.GOAL, sideId: setup.awaySideId, participantId: setup.awayParticipantId });
  }
  await games.executeCommand(authUser, setup.gameId, 'end', `swap-end-${fixtureId}`, {
    expectedVersion: setup.version,
    clientCommandId: `swap-end-${fixtureId}`,
    takeoverToken: await takeover(setup.gameId, `end-${fixtureId}`),
    occurredAt: new Date().toISOString(),
    payload: {},
  });
  const submitted = await prisma.v1GameResultRevision.findFirstOrThrow({ where: { gameId: setup.gameId }, orderBy: { revision: 'desc' } });
  expect(submitted.state).toBe(V1GameResultRevisionState.SUBMITTED);
  if (officialize) {
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: setup.gameId } });
    await resultReview.officializeResultRevision(authUser, setup.gameId, submitted.id, `swap-officialize-${fixtureId}`, {
      expectedVersion: game.version,
      clientCommandId: `swap-officialize-${fixtureId}`,
      projectionPreviewHash: canonicalGameCommandPayloadHash({
        score: submitted.score,
        goalEvents: submitted.goalEvents,
        eventsHash: submitted.eventsHash,
        mvpParticipantId: submitted.mvpParticipantId,
      }),
    });
    const worker = new V1GameOperationsWorkerService(prisma);
    for (let guard = 0; guard < 80 && (await worker.processOne()); guard += 1) { /* drain */ }
  }
  return submitted;
}

const swapHome = (fixtureId: string, teamChangeReason?: string) =>
  bracket.updateFixture(authUser, fixtureId, { homeRegistrationId: ids.newRegistration, teamChangeReason });

async function captureFailure(operation: () => Promise<unknown>): Promise<HttpException> {
  try {
    await operation();
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    return error as HttpException;
  }
  throw new Error('Expected the swap to be rejected');
}

const eventIds = async (gameId: string) =>
  (await prisma.v1GameEvent.findMany({ where: { gameId }, select: { id: true } })).map((event) => event.id).sort();

describe('started tournament fixture team swap (PostgreSQL)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for the started team change integration verification');
    await prisma.$connect();
    await prisma.v1User.create({ data: { id: ids.admin, email: authUser.email, accountStatus: 'active', onboardingStatus: 'completed' } });
    await prisma.v1AdminUser.create({ data: { userId: ids.admin, adminRole: 'ops', status: 'active' } });
    sportId = (await prisma.v1Sport.upsert({
      where: { code: 'football' },
      create: { id: '92000000-0000-4000-8000-000000000010', code: 'football', name: 'Started Swap Football' },
      update: {},
    })).id;
    await prisma.v1Region.create({ data: { id: ids.region, code: 'STARTED_SWAP_REGION', name: 'Started Swap Region', level: 1 } });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, name: 'Swap Host' },
        { id: ids.opponentTeam, name: 'Swap Opponent' },
        { id: ids.newTeam, name: 'Swap Newcomer' },
      ].map((team) => ({ ...team, ownerUserId: ids.admin, sportId, regionId: ids.region })),
    });
    await prisma.v1Tournament.create({
      data: { id: ids.tournament, sportId, title: 'Started swap tournament', status: 'in_progress', bracketPublishedAt: new Date('2026-01-01T00:00:00.000Z') },
    });
    await prisma.v1TournamentGroup.create({ data: { id: ids.group, tournamentId: ids.tournament, name: '준결승', phase: 'semi' } });
    await prisma.v1TournamentRegistration.createMany({
      data: [
        { id: ids.hostRegistration, teamId: ids.hostTeam },
        { id: ids.opponentRegistration, teamId: ids.opponentTeam },
        { id: ids.newRegistration, teamId: ids.newTeam },
      ].map((registration) => ({ ...registration, tournamentId: ids.tournament, appliedByUserId: ids.admin, status: 'confirmed' as const })),
    });
    const config = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    const fixtures = [ids.liveFixture, ids.endedFixture, ids.officialFixture];
    await prisma.v1TeamMatch.createMany({
      data: fixtures.map((id) => ({
        id,
        tournamentId: ids.tournament,
        sportId,
        title: `Started swap ${id}`,
        status: 'matched' as const,
        competitionConfigVersionId: config.id,
        hostTeamId: ids.hostTeam,
        approvedApplicantTeamId: ids.opponentTeam,
      })),
    });
    await prisma.v1TournamentMatchDetails.createMany({
      data: fixtures.map((id, index) => ({
        teamMatchId: id,
        tournamentId: ids.tournament,
        groupId: ids.group,
        round: '준결승',
        fixtureNumber: index + 1,
        homeRegistrationId: ids.hostRegistration,
        awayRegistrationId: ids.opponentRegistration,
      })),
    });
    await prisma.v1GameOperationFlag.upsert({
      where: { key: 'PUBLIC_LIVE' },
      create: { key: 'PUBLIC_LIVE', value: 'on', ownerActor: 'platform_ops' },
      update: { value: 'on' },
    });
    await prisma.v1GameOperationFlag.upsert({
      where: { key: 'DIRECTOR_OFFICIALIZE' },
      create: { key: 'DIRECTOR_OFFICIALIZE', value: 'off', ownerActor: 'platform_ops' },
      update: { value: 'off' },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('live game: deletes only the replaced side events and the reversals that target them, recomputes the score, bumps the version, writes one audit row', async () => {
    const setup = await buildGame(ids.liveFixture);
    await startGame(setup, ids.liveFixture);
    const home = { sideId: setup.homeSideId, participantId: setup.homeParticipantId };
    const away = { sideId: setup.awaySideId, participantId: setup.awayParticipantId };
    const homeGoal = await append(setup, 'live-h1', { type: V1GameEventType.GOAL, ...home });
    const homeMistake = await append(setup, 'live-h2', { type: V1GameEventType.GOAL, ...home });
    const homeCard = await append(setup, 'live-hc', { type: V1GameEventType.CARD, ...home, payload: { card: 'YELLOW' } });
    const awayGoal = await append(setup, 'live-a1', { type: V1GameEventType.GOAL, ...away });
    const awayMistake = await append(setup, 'live-a2', { type: V1GameEventType.GOAL, ...away });
    const awayCard = await append(setup, 'live-ac', { type: V1GameEventType.CARD, ...away, payload: { card: 'YELLOW' } });
    const homeReversal = await reverse(setup, 'live-rev-h2', homeMistake);
    const awayReversal = await reverse(setup, 'live-rev-a2', awayMistake);
    const before = await prisma.v1GameEvent.findMany({ where: { gameId: setup.gameId }, select: { id: true, type: true } });
    const clockEvents = before
      .filter((event) => !([homeGoal, homeMistake, homeCard, awayGoal, awayMistake, awayCard, homeReversal, awayReversal] as string[]).includes(event.id))
      .map((event) => event.id);
    expect(clockEvents.length).toBeGreaterThan(0);
    const versionBefore = (await prisma.v1Game.findUniqueOrThrow({ where: { id: setup.gameId } })).version;

    const result = await swapHome(ids.liveFixture, 'wrong team entered');

    expect(result.startedTeamChange).toEqual({ removedEventCount: 4, score: { home: 0, away: 1 } });
    expect(await eventIds(setup.gameId)).toEqual([awayGoal, awayMistake, awayCard, awayReversal, ...clockEvents].sort());
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: setup.gameId } });
    expect(game.version).toBeGreaterThan(versionBefore);
    const homeSide = await prisma.v1GameSide.findUniqueOrThrow({ where: { id: setup.homeSideId } });
    expect(homeSide.teamId).toBe(ids.newTeam);
    const details = await prisma.v1TournamentMatchDetails.findUniqueOrThrow({ where: { teamMatchId: ids.liveFixture } });
    expect(details.homeRegistrationId).toBe(ids.newRegistration);
    expect(await prisma.v1AdminActionLog.count({
      where: { action: 'tournament.bracket.fixture.started_team_change', targetId: ids.liveFixture },
    })).toBe(1);
  });

  it('ended game with a SUBMITTED result: the revision goes VOID and the public match no longer shows the old score', async () => {
    const setup = await buildGame(ids.endedFixture);
    await startGame(setup, ids.endedFixture);
    const submitted = await playAndEnd(setup, ids.endedFixture, { home: 2, away: 1 }, false);

    const beforeSwap = await publicRecords.getMatch(ids.tournament, ids.endedFixture, undefined);
    expect(beforeSwap.scoreStatus).toBe('pending');
    expect(beforeSwap.score).toMatchObject({ home: 2, away: 1 });

    const result = await swapHome(ids.endedFixture, 'wrong team entered');

    expect(result.startedTeamChange?.score).toEqual({ home: 0, away: 1 });
    const revisions = await prisma.v1GameResultRevision.findMany({ where: { gameId: setup.gameId }, orderBy: { revision: 'asc' } });
    expect(revisions.find((revision) => revision.id === submitted.id)?.state).toBe(V1GameResultRevisionState.VOID);
    expect(revisions.some((revision) => revision.state === V1GameResultRevisionState.SUBMITTED || revision.state === V1GameResultRevisionState.OFFICIAL)).toBe(false);
    const afterSwap = await publicRecords.getMatch(ids.tournament, ids.endedFixture, undefined);
    expect(afterSwap.scoreStatus).not.toBe('official');
    expect(afterSwap.scoreStatus).not.toBe('pending');
    expect(afterSwap.score).toBeNull();
  });

  it('OFFICIAL result: 409 FIXTURE_RESULT_MUST_BE_VOIDED and nothing changes', async () => {
    const setup = await buildGame(ids.officialFixture);
    await startGame(setup, ids.officialFixture);
    await playAndEnd(setup, ids.officialFixture, { home: 1, away: 0 }, true);
    const gameBefore = await prisma.v1Game.findUniqueOrThrow({ where: { id: setup.gameId } });
    expect(gameBefore.currentOfficialRevisionId).not.toBeNull();
    const eventsBefore = await eventIds(setup.gameId);
    const revisionsBefore = await prisma.v1GameResultRevision.count({ where: { gameId: setup.gameId } });

    const error = await captureFailure(() => swapHome(ids.officialFixture, 'wrong team entered'));

    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'FIXTURE_RESULT_MUST_BE_VOIDED' }));
    const gameAfter = await prisma.v1Game.findUniqueOrThrow({ where: { id: setup.gameId } });
    expect(gameAfter.version).toBe(gameBefore.version);
    expect(gameAfter.currentOfficialRevisionId).toBe(gameBefore.currentOfficialRevisionId);
    expect(await eventIds(setup.gameId)).toEqual(eventsBefore);
    expect(await prisma.v1GameResultRevision.count({ where: { gameId: setup.gameId } })).toBe(revisionsBefore);
    expect((await prisma.v1GameSide.findUniqueOrThrow({ where: { id: setup.homeSideId } })).teamId).toBe(ids.hostTeam);
    expect(await prisma.v1AdminActionLog.count({
      where: { action: 'tournament.bracket.fixture.started_team_change', targetId: ids.officialFixture },
    })).toBe(0);
  });
});
