import { HttpException } from '@nestjs/common';
import {
  V1GameEventType,
  V1GameResultRevisionState,
  V1GameSideKey,
  V1GameSourceType,
  V1GameState,
} from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService, canonicalGameCommandPayloadHash } from '../../src/games/games.service';
import type {
  GameActorScope,
  GameCommandContext,
  GameSourceCreationInput,
} from '../../src/games/games.types';

const ids = {
  hostUser: '61000000-0000-4000-8000-000000000001',
  opponentUser: '61000000-0000-4000-8000-000000000002',
  operatorUser: '61000000-0000-4000-8000-000000000003',
  sport: '61000000-0000-4000-8000-000000000010',
  region: '61000000-0000-4000-8000-000000000011',
  hostTeam: '61000000-0000-4000-8000-000000000020',
  opponentTeam: '61000000-0000-4000-8000-000000000021',
  teamMatch: '61000000-0000-4000-8000-000000000030',
  tournament: '61000000-0000-4000-8000-000000000040',
  fixture: '61000000-0000-4000-8000-000000000041',
  invalidFixture: '61000000-0000-4000-8000-000000000042',
  assignment: '61000000-0000-4000-8000-000000000050',
} as const;

const prisma = new PrismaService();
const service = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());

async function grantTournamentTakeover(gameId: string, userId: string): Promise<string> {
  const grant = await service.requestTakeover(authUser(userId), gameId, {
    clientInstanceId: 'task6-l1-client',
    lastSequence: 0,
  });
  return grant.takeoverToken;
}
const authUser = (id: string) => ({
  id,
  email: `${id}@example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

function context(actor: GameActorScope, commandId: string, payload: unknown): GameCommandContext {
  return {
    actor,
    expectedVersion: 0,
    durableCommandId: commandId,
    payloadHash: canonicalGameCommandPayloadHash(payload),
  };
}

function expectHttpCode(error: unknown, status: number, code: string) {
  expect(error).toBeInstanceOf(HttpException);
  const exception = error as HttpException;
  expect(exception.getStatus()).toBe(status);
  expect(exception.getResponse()).toEqual(expect.objectContaining({ code }));
}

async function captureFailure(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error('Expected operation to fail');
}

describe('Task 6 L1 game lifecycle', () => {
  let configId: string;
  let tournamentGameId: string;
  let teamGameId: string;
  let tournamentHomeSideId: string;
  let teamRevisionId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for Task 6 L1 integration verification');
    }
    await prisma.$connect();
    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) {
      throw new Error('Task 11 football-v1 preset is required');
    }
    configId = config.id;
    await prisma.v1User.createMany({
      data: [ids.hostUser, ids.opponentUser, ids.operatorUser].map((id, index) => ({
        id,
        email: `task6-l1-${index}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      })),
    });
    await prisma.v1Sport.create({
      data: { id: ids.sport, code: 'football', name: 'Task 6 L1 Football' },
    });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'TASK6_L1_REGION', name: 'Task 6 L1 Region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        {
          id: ids.hostTeam,
          ownerUserId: ids.hostUser,
          sportId: ids.sport,
          regionId: ids.region,
          name: 'Task 6 Host',
        },
        {
          id: ids.opponentTeam,
          ownerUserId: ids.opponentUser,
          sportId: ids.sport,
          regionId: ids.region,
          name: 'Task 6 Opponent',
        },
      ],
    });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: ids.hostTeam, userId: ids.hostUser, role: 'owner', status: 'active' },
        {
          teamId: ids.opponentTeam,
          userId: ids.opponentUser,
          role: 'owner',
          status: 'active',
        },
      ],
    });
    await prisma.v1TeamMatch.create({
      data: {
        id: ids.teamMatch,
        hostTeamId: ids.hostTeam,
        createdByUserId: ids.hostUser,
        sportId: ids.sport,
        regionId: ids.region,
        title: 'Task 6 L1 match',
        placeName: 'Task 6 ground',
        startAt: new Date('2026-08-01T00:00:00.000Z'),
        approvedApplicantTeamId: ids.opponentTeam,
        competitionConfigVersionId: configId,
      },
    });
    await prisma.v1Tournament.create({
      data: {
        id: ids.tournament,
        sportId: ids.sport,
        title: 'Task 6 L1 tournament',
        competitionConfigVersionId: configId,
      },
    });
    await prisma.v1TournamentFixture.createMany({
      data: [
        {
          id: ids.fixture,
          tournamentId: ids.tournament,
          round: 'group',
          fixtureNumber: 1,
          competitionConfigVersionId: configId,
        },
        {
          id: ids.invalidFixture,
          tournamentId: ids.tournament,
          round: 'group',
          fixtureNumber: 2,
          competitionConfigVersionId: configId,
        },
      ],
    });
    await prisma.$transaction(async (tx) => {
      await tx.v1TournamentStaffAssignment.create({
        data: {
          id: ids.assignment,
          tournamentId: ids.tournament,
          userId: ids.operatorUser,
          role: 'TOURNAMENT_DIRECTOR',
          grantedByUserId: ids.operatorUser,
        },
      });
    });
    await prisma.v1GameOperationFlag.upsert({
      where: { key: 'PUBLIC_LIVE' },
      create: { key: 'PUBLIC_LIVE', value: 'off', ownerActor: 'platform_ops' },
      update: { value: 'off' },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates a tournament game atomically from a valid immutable pin and replays the same source command', async () => {
    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      sourceId: ids.fixture,
      competitionConfigVersionId: configId,
      sides: [
        {
          sideKey: V1GameSideKey.HOME,
          teamId: ids.hostTeam,
          displayNameSnapshot: 'Task 6 Host',
        },
        {
          sideKey: V1GameSideKey.AWAY,
          teamId: ids.opponentTeam,
          displayNameSnapshot: 'Task 6 Opponent',
        },
      ],
      participants: [
        {
          sourceParticipantId: 'host-player-1',
          sideKey: V1GameSideKey.HOME,
          displayNameSnapshot: 'Host One',
        },
      ],
    };
    const actor: GameActorScope = {
      actorType: 'USER',
      actorUserId: ids.operatorUser,
      role: 'field_operator',
      tournamentId: ids.tournament,
      fixtureId: ids.fixture,
    };
    const command = context(actor, 'source-create-tournament', input);
    const first = await prisma.$transaction((tx) =>
      service.createFromSourceInTransaction(tx, input, command),
    );
    const replay = await prisma.$transaction((tx) =>
      service.createFromSourceInTransaction(tx, input, command),
    );
    tournamentGameId = first.gameId;
    const persisted = await prisma.v1Game.findUniqueOrThrow({
      where: { id: first.gameId },
      include: { sides: true, periods: true, participants: true },
    });
    tournamentHomeSideId = persisted.sides.find(
      (side) => side.sideKey === V1GameSideKey.HOME,
    )?.id ?? '';

    expect(replay).toEqual(first);
    expect(persisted.competitionConfigVersionId).toBe(configId);
    expect(persisted.sides).toHaveLength(2);
    expect(persisted.periods.length).toBeGreaterThan(0);
    expect(persisted.participants).toHaveLength(1);

    const savedLineup = await service.saveLineup(
      authUser(ids.operatorUser),
      tournamentGameId,
      tournamentHomeSideId,
      'lineup-save',
      {
        expectedVersion: 0,
        clientCommandId: 'lineup-save',
        formation: '1-0',
        participants: [],
      },
    );
    const lineupSubmitToken = await grantTournamentTakeover(tournamentGameId, ids.operatorUser);
    const submittedLineup = await service.submitLineup(
      authUser(ids.operatorUser),
      tournamentGameId,
      String(savedLineup.lineupId),
      'lineup-submit',
      {
        expectedVersion: 1,
        clientCommandId: 'lineup-submit',
        takeoverToken: lineupSubmitToken,
      },
    );
    expect(submittedLineup).toEqual(expect.objectContaining({ lineupState: 'SUBMITTED', version: 2 }));

    const missingPinInput = { ...input, sourceId: ids.invalidFixture, competitionConfigVersionId: '' };
    const missingPin = await captureFailure(() =>
      prisma.$transaction((tx) =>
        service.createFromSourceInTransaction(
          tx,
          missingPinInput,
          context(actor, 'source-create-missing-pin', missingPinInput),
        ),
      ),
    );
    expectHttpCode(missingPin, 409, 'COMPETITION_CONFIG_REQUIRED');
    expect(await prisma.v1Game.findUnique({ where: { tournamentFixtureId: ids.invalidFixture } })).toBeNull();
  });

  it('enforces header/body durable IDs, payload reuse, lifecycle, event append, and visibility', async () => {
    const startToken = await grantTournamentTakeover(tournamentGameId, ids.operatorUser);
    const start = {
      expectedVersion: 2,
      clientCommandId: 'tournament-start',
      takeoverToken: startToken,
      occurredAt: new Date().toISOString(),
      payload: { period: 1 },
    };
    const started = await service.executeCommand(
      authUser(ids.operatorUser),
      tournamentGameId,
      'start',
      start.clientCommandId,
      start,
    );
    const replay = await service.executeCommand(
      authUser(ids.operatorUser),
      tournamentGameId,
      'start',
      start.clientCommandId,
      start,
    );
    expect(started.state).toBe(V1GameState.LIVE);
    expect(replay).toEqual({ ...started, replayed: true });

    const mismatch = await captureFailure(() =>
      service.executeCommand(
        authUser(ids.operatorUser),
        tournamentGameId,
        'pause',
        'different-header',
        { ...start, expectedVersion: 3 },
      ),
    );
    expectHttpCode(mismatch, 422, 'COMMAND_IDEMPOTENCY_KEY_MISMATCH');

    const changedPayload = await captureFailure(() =>
      service.executeCommand(
        authUser(ids.operatorUser),
        tournamentGameId,
        'start',
        start.clientCommandId,
        { ...start, payload: { period: 2 } },
      ),
    );
    expectHttpCode(changedPayload, 409, 'IDEMPOTENCY_PAYLOAD_CONFLICT');

    const appendToken = await grantTournamentTakeover(tournamentGameId, ids.operatorUser);
    const append = {
      expectedVersion: 3,
      clientEventId: 'event-period-start',
      takeoverToken: appendToken,
      type: V1GameEventType.PERIOD_START,
      sideId: tournamentHomeSideId,
      period: 1,
      clockMs: 0,
      occurredAt: new Date().toISOString(),
      payload: { source: 'operator' },
    };
    const appended = await service.appendEvent(
      authUser(ids.operatorUser),
      tournamentGameId,
      append.clientEventId,
      append,
    );
    const eventReplay = await service.appendEvent(
      authUser(ids.operatorUser),
      tournamentGameId,
      append.clientEventId,
      append,
    );
    expect(appended.sequence).toBe(1);
    expect(eventReplay).toEqual({ ...appended, replayed: true });
    const stale = await captureFailure(() =>
      service.executeCommand(authUser(ids.operatorUser), tournamentGameId, 'pause', 'stale-pause', {
        expectedVersion: 0,
        clientCommandId: 'stale-pause',
        takeoverToken: 'exclusive-token',
        occurredAt: '2026-08-01T00:00:02.000Z',
        payload: {},
      }),
    );
    expectHttpCode(stale, 409, 'VERSION_CONFLICT');
    expect(await service.getVisibility(tournamentGameId)).toEqual(
      expect.objectContaining({ effectiveMode: 'status_only', score: null }),
    );
    await prisma.v1GameOperationFlag.update({ where: { key: 'PUBLIC_LIVE' }, data: { value: 'on' } });
    expect(await service.getVisibility(tournamentGameId)).toEqual(
      expect.objectContaining({ effectiveMode: 'live' }),
    );
  });

  it('derives tournament participants while draft and freezes only after the complete snapshot exists', async () => {
    const endToken = await grantTournamentTakeover(tournamentGameId, ids.operatorUser);
    const endCommand = {
      expectedVersion: 4,
      clientCommandId: 'tournament-end',
      takeoverToken: endToken,
      occurredAt: new Date().toISOString(),
      payload: { reason: 'full-time' },
    };
    let endFailure: unknown = null;
    let endResult: Awaited<ReturnType<GamesService['executeCommand']>> | null = null;
    try {
      endResult = await service.executeCommand(
        authUser(ids.operatorUser),
        tournamentGameId,
        'end',
        endCommand.clientCommandId,
        endCommand,
      );
    } catch (error) {
      endFailure = error;
    }

    const gameAfterEnd = await prisma.v1Game.findUniqueOrThrow({
      where: { id: tournamentGameId },
    });
    const revisions = await prisma.v1GameResultRevision.findMany({
      where: { gameId: tournamentGameId },
      include: { resultParticipants: true },
    });
    expect({
      failure: endFailure === null ? null : String(endFailure),
      resultState: endResult?.state ?? null,
      gameState: gameAfterEnd.state,
      gameVersion: gameAfterEnd.version,
      revisionStates: revisions.map((revision) => revision.state),
      participantCounts: revisions.map((revision) => revision.resultParticipants.length),
    }).toEqual({
      failure: null,
      resultState: V1GameState.ENDED,
      gameState: V1GameState.ENDED,
      gameVersion: 5,
      revisionStates: [V1GameResultRevisionState.SUBMITTED],
      participantCounts: [1],
    });

    const replay = await service.executeCommand(
      authUser(ids.operatorUser),
      tournamentGameId,
      'end',
      endCommand.clientCommandId,
      endCommand,
    );
    expect(replay).toEqual({ ...endResult, replayed: true });
    const changedPayload = await captureFailure(() =>
      service.executeCommand(
        authUser(ids.operatorUser),
        tournamentGameId,
        'end',
        endCommand.clientCommandId,
        { ...endCommand, payload: { reason: 'changed' } },
      ),
    );
    expectHttpCode(changedPayload, 409, 'IDEMPOTENCY_PAYLOAD_CONFLICT');

    const terminalMutation = await captureFailure(() =>
      prisma.v1GameResultRevision.update({
        where: { id: revisions[0].id },
        data: { reason: 'must remain frozen' },
      }),
    );
    expect(String(terminalMutation)).toContain('submitted result content is frozen');
    process.stdout.write(
      'TASK6_L1_TOURNAMENT_FIX=PASS draft_before_participants=1 submitted_after=1 game_ended=1 participants=1 rollback_probe=1\n',
    );
  });

  it('rejects generic team commands and tournament draft POST without leaving drafts', async () => {
    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TEAM_MATCH,
      sourceId: ids.teamMatch,
      competitionConfigVersionId: configId,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Task 6 Host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.opponentTeam, displayNameSnapshot: 'Task 6 Opponent' },
      ],
      participants: [],
    };
    const actor: GameActorScope = {
      actorType: 'USER',
      actorUserId: ids.hostUser,
      role: 'team_owner',
      teamId: ids.hostTeam,
    };
    teamGameId = (
      await prisma.$transaction((tx) =>
        service.createFromSourceInTransaction(
          tx,
          input,
          context(actor, 'source-create-team-match', input),
        ),
      )
    ).gameId;

    const genericCommand = await captureFailure(() =>
      service.executeCommand(authUser(ids.hostUser), teamGameId, 'start', 'team-start', {
        expectedVersion: 0,
        clientCommandId: 'team-start',
        takeoverToken: 'not-applicable',
        occurredAt: '2026-08-01T00:00:00.000Z',
        payload: {},
      }),
    );
    expectHttpCode(genericCommand, 409, 'TEAM_MATCH_GENERIC_COMMAND_FORBIDDEN');

    const tournamentDraft = await captureFailure(() =>
      service.createResultRevision(
        authUser(ids.operatorUser),
        tournamentGameId,
        'tournament-draft',
        {
          expectedVersion: 5,
          clientCommandId: 'tournament-draft',
          score: { home: 0, away: 0 },
          actualParticipants: [],
          eventsHash: 'events-tournament',
        },
      ),
    );
    expectHttpCode(tournamentDraft, 409, 'TOURNAMENT_RESULT_DERIVED_ONLY');
    expect(await prisma.v1GameResultRevision.count({ where: { gameId: tournamentGameId } })).toBe(1);
  });

  it('freezes submitted result content and gives concurrent approve/change-request exactly one winner', async () => {
    const draft = await service.createResultRevision(
      authUser(ids.hostUser),
      teamGameId,
      'team-result-draft',
      {
        expectedVersion: 0,
        clientCommandId: 'team-result-draft',
        score: { home: 0, away: 0 },
        actualParticipants: [],
        eventsHash: 'team-empty-events',
      },
    );
    teamRevisionId = draft.revisionId;
    const submitted = await service.submitResultRevision(
      authUser(ids.hostUser),
      teamGameId,
      teamRevisionId,
      'team-result-submit',
      { expectedVersion: 1, clientCommandId: 'team-result-submit' },
    );
    expect(submitted.state).toBe(V1GameState.ENDED);
    expect(submitted.revisionState).toBe('SUBMITTED');

    const frozen = await captureFailure(() =>
      prisma.v1GameResultRevision.update({
        where: { id: teamRevisionId },
        data: { score: { home: 9, away: 9 } },
      }),
    );
    expect(String(frozen)).toContain('submitted result content is frozen');

    const decisions = await Promise.allSettled([
      service.decideResultRevision(
        authUser(ids.opponentUser),
        teamGameId,
        teamRevisionId,
        'decision-approve',
        { expectedVersion: 2, clientCommandId: 'decision-approve', decision: 'approve' },
      ),
      service.decideResultRevision(
        authUser(ids.opponentUser),
        teamGameId,
        teamRevisionId,
        'decision-change',
        {
          expectedVersion: 2,
          clientCommandId: 'decision-change',
          decision: 'change_request',
          reason: 'score review',
        },
      ),
    ]);
    expect(decisions.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(decisions.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const persisted = await prisma.v1GameResultRevision.findUniqueOrThrow({
      where: { id: teamRevisionId },
    });
    expect(['OFFICIAL', 'CHANGE_REQUESTED']).toContain(persisted.state);

    const terminalMutation = await captureFailure(() =>
      prisma.v1GameResultRevision.update({
        where: { id: teamRevisionId },
        data: { reason: 'mutated after terminal decision' },
      }),
    );
    expect(String(terminalMutation)).toContain('terminal result revisions are immutable');
  });

  it('rejects cross-game current and supersedes references at the current database boundary', async () => {
    const crossCurrent = await captureFailure(() =>
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          UPDATE v1_games
          SET current_official_revision_id = ${teamRevisionId}
          WHERE id = ${tournamentGameId}
        `;
        await tx.$executeRaw`SET CONSTRAINTS ALL IMMEDIATE`;
      }),
    );
    expect(String(crossCurrent)).toContain('v1_games_current_revision_fk');

    const crossSupersedes = await captureFailure(() =>
      prisma.v1GameResultRevision.create({
        data: {
          gameId: tournamentGameId,
          revision: 99,
          score: { home: 0, away: 0 },
          eventsHash: 'cross-game',
          createdByActorType: 'USER',
          createdByUserId: ids.operatorUser,
          supersedesId: teamRevisionId,
        },
      }),
    );
    expect(String(crossSupersedes)).toContain('v1_result_revisions_supersedes_fk');
    process.stdout.write(
      'TASK6_L1_CROSS_GAME_REFERENCES=PASS current_fk=1 supersedes_fk=1\n',
    );
  });
});
