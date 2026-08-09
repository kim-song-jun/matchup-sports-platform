import { HttpException } from '@nestjs/common';
import { V1GameEventType, V1GamePeriodState, V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService, canonicalGameCommandPayloadHash } from '../../src/games/games.service';
import type {
  GameActorScope,
  GameCommandContext,
  GameSourceCreationInput,
} from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';

// Task T1-1: resolveActor's TEAM_MATCH branch used to forbid event_append/
// event_reverse unconditionally for every team actor (games.service.ts).
// This spec pins the corrected authorization boundary end to end through the
// real service: the host team's owner/manager may append and reverse live
// game events; the opponent team's manager — despite being an equally
// active member of the match's other team — may not. If the host/opponent
// role split in resolveActor's event_append/event_reverse branch is ever
// collapsed back into the generic
// `managerRole(hostMembership) ?? managerRole(opponentMembership)` merge,
// the opponent-denied assertions below fail.
const ids = {
  hostOwner: '87000000-0000-4000-8000-000000000001',
  hostManager: '87000000-0000-4000-8000-000000000002',
  opponentOwner: '87000000-0000-4000-8000-000000000003',
  opponentManager: '87000000-0000-4000-8000-000000000004',
  sport: '87000000-0000-4000-8000-000000000010',
  region: '87000000-0000-4000-8000-000000000011',
  hostTeam: '87000000-0000-4000-8000-000000000020',
  opponentTeam: '87000000-0000-4000-8000-000000000021',
  teamMatch: '87000000-0000-4000-8000-000000000030',
} as const;

const prisma = new PrismaService();
const service = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());

const authUser = (id: string) => ({
  id,
  email: `${id}@task-t1-1.example.test`,
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

function expectForbidden(error: unknown) {
  expect(error).toBeInstanceOf(HttpException);
  const exception = error as HttpException;
  expect(exception.getStatus()).toBe(403);
  expect(exception.getResponse()).toEqual(expect.objectContaining({ code: 'PERMISSION_DENIED' }));
}

async function captureFailure(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error('Expected operation to fail');
}

describe('Task T1-1 team-match event_append/event_reverse authority', () => {
  let configId: string;
  let gameId: string;
  let hostSideId: string;
  let hostParticipantId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for T1-1 integration verification');
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
      data: [ids.hostOwner, ids.hostManager, ids.opponentOwner, ids.opponentManager].map(
        (id, index) => ({
          id,
          email: `task-t1-1-${index}@example.test`,
          accountStatus: 'active',
          onboardingStatus: 'completed',
        }),
      ),
    });
    await prisma.v1Sport.create({ data: { id: ids.sport, code: 'football', name: 'T1-1 Football' } });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'T1_1_REGION', name: 'T1-1 Region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.hostOwner, sportId: ids.sport, regionId: ids.region, name: 'T1-1 Host' },
        { id: ids.opponentTeam, ownerUserId: ids.opponentOwner, sportId: ids.sport, regionId: ids.region, name: 'T1-1 Opponent' },
      ],
    });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: ids.hostTeam, userId: ids.hostOwner, role: 'owner', status: 'active' },
        { teamId: ids.hostTeam, userId: ids.hostManager, role: 'manager', status: 'active' },
        { teamId: ids.opponentTeam, userId: ids.opponentOwner, role: 'owner', status: 'active' },
        { teamId: ids.opponentTeam, userId: ids.opponentManager, role: 'manager', status: 'active' },
      ],
    });
    await prisma.v1TeamMatch.create({
      data: {
        id: ids.teamMatch,
        hostTeamId: ids.hostTeam,
        createdByUserId: ids.hostOwner,
        sportId: ids.sport,
        regionId: ids.region,
        title: 'T1-1 team match',
        placeName: 'T1-1 ground',
        startAt: new Date('2026-08-20T00:00:00.000Z'),
        status: 'matched' as const,
        approvedApplicantTeamId: ids.opponentTeam,
        competitionConfigVersionId: configId,
      },
    });

    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TEAM_MATCH,
      sourceId: ids.teamMatch,
      competitionConfigVersionId: configId,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'T1-1 Host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.opponentTeam, displayNameSnapshot: 'T1-1 Opponent' },
      ],
      participants: [
        { sourceParticipantId: 'host-1', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'T1-1 Host One' },
        { sourceParticipantId: 'away-1', sideKey: V1GameSideKey.AWAY, displayNameSnapshot: 'T1-1 Away One' },
      ],
    };
    const actor: GameActorScope = {
      actorType: 'USER',
      actorUserId: ids.hostOwner,
      role: 'team_owner',
      teamId: ids.hostTeam,
    };
    const created = await prisma.$transaction((tx) =>
      service.createFromSourceInTransaction(tx, input, context(actor, 't1-1-source-create', input)),
    );
    gameId = created.gameId;
    hostSideId = (
      await prisma.v1GameSide.findFirstOrThrow({ where: { gameId, sideKey: V1GameSideKey.HOME } })
    ).id;
    hostParticipantId = (
      await prisma.v1GameParticipant.findFirstOrThrow({
        where: { gameId, displayNameSnapshot: 'T1-1 Host One' },
      })
    ).id;
    // T1-0 made "a LIVE period exists" a precondition of appendEvent
    // (assertEventReferences, games.service.ts). A team match cannot yet
    // reach LIVE through the command layer -- executeCommand's
    // TEAM_MATCH_GENERIC_COMMAND_FORBIDDEN gate still rejects `start`
    // unconditionally for TEAM_MATCH games; narrowing that gate to an
    // `end`-only check is T3's declared scope, not this track's. This spec
    // is about the event_append/event_reverse authorization boundary, not
    // period lifecycle, so it satisfies the precondition directly (same
    // pattern as game-period-live-backfill.integration-spec.ts) instead of
    // waiting on T3.
    await prisma.v1GamePeriod.updateMany({
      where: { gameId, number: 1 },
      data: { state: V1GamePeriodState.LIVE, startedAt: new Date() },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('lets the host manager append a live event and reverse it, but denies the opponent manager both actions', async () => {
    const beforeHost = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    const appendEventId = 't1-1-host-goal';
    const appendPayload = {
      expectedVersion: beforeHost.version,
      clientEventId: appendEventId,
      takeoverToken: 'n/a',
      type: V1GameEventType.GOAL,
      sideId: hostSideId,
      participantId: hostParticipantId,
      period: 1,
      clockMs: 61_000,
      occurredAt: new Date().toISOString(),
      payload: {},
    };

    const appended = await service.appendEvent(authUser(ids.hostManager), gameId, appendEventId, appendPayload);
    expect(appended).toEqual(expect.objectContaining({ gameId, sequence: 1, replayed: false }));
    const persisted = await prisma.v1GameEvent.findUniqueOrThrow({
      where: { gameId_clientEventId: { gameId, clientEventId: appendEventId } },
    });
    expect(persisted.actorUserId).toBe(ids.hostManager);
    expect(persisted.type).toBe(V1GameEventType.GOAL);

    const opponentAppendId = 't1-1-opponent-goal';
    const opponentAttempt = await captureFailure(() =>
      service.appendEvent(authUser(ids.opponentManager), gameId, opponentAppendId, {
        ...appendPayload,
        expectedVersion: appended.version,
        clientEventId: opponentAppendId,
      }),
    );
    expectForbidden(opponentAttempt);
    expect(await prisma.v1GameEvent.count({ where: { gameId, clientEventId: opponentAppendId } })).toBe(0);

    const reverseEventId = 't1-1-host-reverse';
    const reversed = await service.reverseEvent(authUser(ids.hostOwner), gameId, persisted.id, reverseEventId, {
      expectedVersion: appended.version,
      clientEventId: reverseEventId,
      takeoverToken: 'n/a',
      reason: 't1-1 correction',
    });
    expect(reversed).toEqual(expect.objectContaining({ gameId, sequence: 2, replayed: false }));
    const reversalRow = await prisma.v1GameEvent.findFirstOrThrow({
      where: { gameId, reversesEventId: persisted.id },
    });
    expect(reversalRow.actorUserId).toBe(ids.hostOwner);

    const opponentReverseId = 't1-1-opponent-reverse';
    const opponentReverseAttempt = await captureFailure(() =>
      service.reverseEvent(authUser(ids.opponentManager), gameId, persisted.id, opponentReverseId, {
        expectedVersion: reversed.version,
        clientEventId: opponentReverseId,
        takeoverToken: 'n/a',
        reason: 'opponent should not be able to do this',
      }),
    );
    expectForbidden(opponentReverseAttempt);
  });

  it('replays the same clientEventId for the host actor without creating a duplicate event row', async () => {
    const before = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    const clientEventId = 't1-1-host-replay-goal';
    const append = {
      expectedVersion: before.version,
      clientEventId,
      takeoverToken: 'n/a',
      type: V1GameEventType.GOAL,
      sideId: hostSideId,
      participantId: hostParticipantId,
      period: 1,
      clockMs: 120_000,
      occurredAt: new Date().toISOString(),
      payload: {},
    };
    const first = await service.appendEvent(authUser(ids.hostManager), gameId, clientEventId, append);
    const second = await service.appendEvent(authUser(ids.hostManager), gameId, clientEventId, append);
    expect(second).toEqual({ ...first, replayed: true });
    expect(await prisma.v1GameEvent.count({ where: { gameId, clientEventId } })).toBe(1);
  });
});
