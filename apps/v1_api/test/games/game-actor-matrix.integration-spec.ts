import { HttpException } from '@nestjs/common';
import {
  V1GameEventType,
  V1GameSideKey,
  V1GameSourceType,
  type Prisma,
} from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService, canonicalGameCommandPayloadHash } from '../../src/games/games.service';
import type {
  GameActorScope,
  GameCommandContext,
  GameSourceCreationInput,
} from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';

const ids = {
  platformOps: '77000000-0000-4000-8000-000000000001',
  director: '77000000-0000-4000-8000-000000000002',
  fieldOperator: '77000000-0000-4000-8000-000000000003',
  supportReadonly: '77000000-0000-4000-8000-000000000004',
  teamManager: '77000000-0000-4000-8000-000000000005',
  public: '77000000-0000-4000-8000-000000000006',
  teamOwner: '77000000-0000-4000-8000-000000000007',
  opponentOwner: '77000000-0000-4000-8000-000000000008',
  crossTournamentOperator: '77000000-0000-4000-8000-000000000009',
  crossFixtureOperator: '77000000-0000-4000-8000-00000000000a',
  crossCourtOperator: '77000000-0000-4000-8000-00000000000e',
  revokedOperator: '77000000-0000-4000-8000-00000000000b',
  expiredOperator: '77000000-0000-4000-8000-00000000000c',
  staleSession: '77000000-0000-4000-8000-00000000000d',
  sport: '77000000-0000-4000-8000-000000000010',
  region: '77000000-0000-4000-8000-000000000011',
  hostTeam: '77000000-0000-4000-8000-000000000020',
  opponentTeam: '77000000-0000-4000-8000-000000000021',
  teamMatch: '77000000-0000-4000-8000-000000000030',
  tournament: '77000000-0000-4000-8000-000000000040',
  otherTournament: '77000000-0000-4000-8000-000000000041',
  fixture: '77000000-0000-4000-8000-000000000050',
  otherFixture: '77000000-0000-4000-8000-000000000051',
  crossTournamentFixture: '77000000-0000-4000-8000-000000000052',
  field: '77000000-0000-4000-8000-000000000060',
  otherField: '77000000-0000-4000-8000-000000000061',
} as const;

const prisma = new PrismaService();
const service = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());

const authUser = (id: string) => ({
  id,
  email: `${id}@task7.example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

async function grantTournamentTakeover(gameId: string, userId: string): Promise<string> {
  const grant = await service.requestTakeover(authUser(userId), gameId, {
    clientInstanceId: `task7-${userId}-client`,
    lastSequence: 0,
  });
  return grant.takeoverToken;
}

function sourceContext(
  actor: GameActorScope,
  commandId: string,
  payload: unknown,
): GameCommandContext {
  return {
    actor,
    expectedVersion: 0,
    durableCommandId: commandId,
    payloadHash: canonicalGameCommandPayloadHash(payload),
  };
}

async function captureFailure(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error('Expected operation to fail');
}

function expectForbidden(error: unknown) {
  expect(error).toBeInstanceOf(HttpException);
  const exception = error as HttpException;
  expect(exception.getStatus()).toBe(403);
  expect(exception.getResponse()).toEqual(
    expect.objectContaining({ code: 'PERMISSION_DENIED' }),
  );
}

type WriteSnapshot = {
  version: number;
  lastSequence: number;
  events: number;
  revisions: number;
  idempotency: number;
  audits: number;
};

async function writeSnapshot(gameId: string): Promise<WriteSnapshot> {
  const [game, events, revisions, idempotency, audits] = await Promise.all([
    prisma.v1Game.findUniqueOrThrow({
      where: { id: gameId },
      select: { version: true, lastSequence: true },
    }),
    prisma.v1GameEvent.count({ where: { gameId } }),
    prisma.v1GameResultRevision.count({ where: { gameId } }),
    prisma.v1IdempotencyRecord.count({ where: { resourceType: 'GAME', resourceId: gameId } }),
    prisma.v1OperationAudit.count({ where: { resourceType: 'GAME', resourceId: gameId } }),
  ]);
  return { ...game, events, revisions, idempotency, audits };
}

async function expectDeniedWithoutWrite(
  gameId: string,
  operation: () => Promise<unknown>,
): Promise<void> {
  const before = await writeSnapshot(gameId);
  expectForbidden(await captureFailure(operation));
  expect(await writeSnapshot(gameId)).toEqual(before);
}

describe('Task 7 six-persona Game actor matrix characterization PIN', () => {
  let configId: string;
  let sportId: string;
  let tournamentGameId: string;
  let teamGameId: string;
  let tournamentHomeSideId: string;
  let fieldOperatorAssignmentId: string;
  let allowed = 0;
  let denied = 0;
  let deniedWrites = 0;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the Task 7 actor matrix PIN');
    }
    await prisma.$connect();
    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) {
      throw new Error('The migrated football-v1 competition preset is required');
    }
    configId = config.id;

    const userIds = [
      ids.platformOps,
      ids.director,
      ids.fieldOperator,
      ids.supportReadonly,
      ids.teamManager,
      ids.public,
      ids.teamOwner,
      ids.opponentOwner,
      ids.crossTournamentOperator,
      ids.crossFixtureOperator,
      ids.crossCourtOperator,
      ids.revokedOperator,
      ids.expiredOperator,
      ids.staleSession,
    ];
    await prisma.v1User.createMany({
      data: userIds.map((id, index) => ({
        id,
        email: `task7-actor-${index}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      })),
    });
    await prisma.v1AdminUser.create({
      data: { userId: ids.platformOps, adminRole: 'ops', status: 'active' },
    });
    sportId = (
      await prisma.v1Sport.upsert({
        where: { code: 'football' },
        create: { id: ids.sport, code: 'football', name: 'Task 7 Football' },
        update: {},
      })
    ).id;
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'TASK7_ACTOR_REGION', name: 'Task 7 Region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        {
          id: ids.hostTeam,
          ownerUserId: ids.teamOwner,
          sportId,
          regionId: ids.region,
          name: 'Task 7 Host',
        },
        {
          id: ids.opponentTeam,
          ownerUserId: ids.opponentOwner,
          sportId,
          regionId: ids.region,
          name: 'Task 7 Opponent',
        },
      ],
    });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: ids.hostTeam, userId: ids.teamOwner, role: 'owner', status: 'active' },
        { teamId: ids.hostTeam, userId: ids.teamManager, role: 'manager', status: 'active' },
        {
          teamId: ids.opponentTeam,
          userId: ids.opponentOwner,
          role: 'owner',
          status: 'active',
        },
      ],
    });
    await prisma.v1TeamMatch.create({
      data: {
        id: ids.teamMatch,
        hostTeamId: ids.hostTeam,
        // Task 16: result draft/submit now requires a real matched opponent (see
        // GamesService.assertTeamMatchMatched) — status must agree with
        // approvedApplicantTeamId exactly as the real approve-application flow leaves it.
        status: 'matched',
        approvedApplicantTeamId: ids.opponentTeam,
        createdByUserId: ids.teamOwner,
        sportId,
        regionId: ids.region,
        title: 'Task 7 team match',
        placeName: 'Task 7 ground',
        startAt: new Date('2026-08-01T12:00:00.000Z'),
        competitionConfigVersionId: configId,
      },
    });
    await prisma.v1Tournament.createMany({
      data: [
        {
          id: ids.tournament,
          sportId,
          title: 'Task 7 tournament',
          competitionConfigVersionId: configId,
        },
        {
          id: ids.otherTournament,
          sportId,
          title: 'Task 7 other tournament',
          competitionConfigVersionId: configId,
        },
      ],
    });
    await prisma.v1TournamentField.createMany({
      data: [
        {
          id: ids.field,
          tournamentId: ids.tournament,
          scopeKey: 'main-court',
          name: 'Main court',
        },
        {
          id: ids.otherField,
          tournamentId: ids.tournament,
          scopeKey: 'side-court',
          name: 'Side court',
        },
      ],
    });
    await prisma.v1TournamentFixture.createMany({
      data: [
        {
          id: ids.fixture,
          tournamentId: ids.tournament,
          round: 'group',
          fixtureNumber: 1,
          fieldId: ids.field,
          competitionConfigVersionId: configId,
        },
        {
          id: ids.otherFixture,
          tournamentId: ids.tournament,
          round: 'group',
          fixtureNumber: 2,
          competitionConfigVersionId: configId,
        },
        {
          id: ids.crossTournamentFixture,
          tournamentId: ids.otherTournament,
          round: 'group',
          fixtureNumber: 1,
          competitionConfigVersionId: configId,
        },
      ],
    });

    const assignmentRows: Prisma.V1TournamentStaffAssignmentCreateManyInput[] = [
      {
        tournamentId: ids.tournament,
        userId: ids.director,
        role: 'TOURNAMENT_DIRECTOR',
        grantedByUserId: ids.platformOps,
      },
      {
        tournamentId: ids.tournament,
        userId: ids.fieldOperator,
        role: 'FIELD_OPERATOR',
        fieldId: ids.field,
        grantedByUserId: ids.director,
      },
      {
        tournamentId: ids.tournament,
        userId: ids.supportReadonly,
        role: 'SUPPORT_READONLY',
        grantedByUserId: ids.director,
      },
      {
        tournamentId: ids.otherTournament,
        userId: ids.crossTournamentOperator,
        role: 'FIELD_OPERATOR',
        grantedByUserId: ids.platformOps,
      },
      {
        tournamentId: ids.tournament,
        userId: ids.crossFixtureOperator,
        role: 'FIELD_OPERATOR',
        grantedByUserId: ids.platformOps,
      },
      {
        tournamentId: ids.tournament,
        userId: ids.crossCourtOperator,
        role: 'FIELD_OPERATOR',
        fieldId: ids.otherField,
        grantedByUserId: ids.platformOps,
      },
      {
        tournamentId: ids.tournament,
        userId: ids.revokedOperator,
        role: 'FIELD_OPERATOR',
        grantedByUserId: ids.platformOps,
        revokedAt: new Date('2026-07-31T00:00:00.000Z'),
      },
      {
        tournamentId: ids.tournament,
        userId: ids.expiredOperator,
        role: 'FIELD_OPERATOR',
        grantedByUserId: ids.platformOps,
        expiresAt: new Date('2026-07-31T00:00:00.000Z'),
      },
    ];
    for (const assignment of assignmentRows) {
      await prisma.$transaction(async (tx) => {
        const created = await tx.v1TournamentStaffAssignment.create({ data: assignment });
        if (assignment.userId === ids.fieldOperator) {
          fieldOperatorAssignmentId = created.id;
        }
        if (assignment.role === 'FIELD_OPERATOR') {
          const fixtureId =
            assignment.userId === ids.crossTournamentOperator
              ? ids.crossTournamentFixture
              : assignment.userId === ids.crossFixtureOperator
                ? ids.otherFixture
                : ids.fixture;
          await tx.v1TournamentStaffFixtureScope.create({
            data: { assignmentId: created.id, fixtureId },
          });
        }
      });
    }

    await prisma.v1GameOperationFlag.upsert({
      where: { key: 'PUBLIC_LIVE' },
      create: { key: 'PUBLIC_LIVE', value: 'on', ownerActor: 'platform_ops' },
      update: { value: 'on' },
    });

    const tournamentInput: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      sourceId: ids.fixture,
      competitionConfigVersionId: configId,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Task 7 Host' },
        {
          sideKey: V1GameSideKey.AWAY,
          teamId: ids.opponentTeam,
          displayNameSnapshot: 'Task 7 Opponent',
        },
      ],
      participants: [],
    };
    const tournamentCreated = await prisma.$transaction((tx) =>
      service.createFromSourceInTransaction(
        tx,
        tournamentInput,
        sourceContext(
          {
            actorType: 'USER',
            actorUserId: ids.platformOps,
            role: 'platform_ops',
            tournamentId: ids.tournament,
            fixtureId: ids.fixture,
          },
          'task7-create-tournament-game',
          tournamentInput,
        ),
      ),
    );
    tournamentGameId = tournamentCreated.gameId;
    tournamentHomeSideId = (
      await prisma.v1GameSide.findFirstOrThrow({
        where: { gameId: tournamentGameId, sideKey: V1GameSideKey.HOME },
      })
    ).id;
    const tournamentAwaySideId = (
      await prisma.v1GameSide.findFirstOrThrow({
        where: { gameId: tournamentGameId, sideKey: V1GameSideKey.AWAY },
      })
    ).id;
    // GamesService.assertLineupsSubmittedForStart requires a SUBMITTED/LOCKED
    // lineup on every side before `start` is allowed. createFromSourceInTransaction
    // already creates a DRAFT revision-1 lineup per side at game creation, so
    // flip those straight to SUBMITTED (bypassing
    // GamesService.saveLineup/submitLineup) -- see the version-bump comment
    // above `start` below: this is fixture setup only, not part of what the
    // PIN below asserts.
    await prisma.v1GameLineup.updateMany({
      where: {
        gameId: tournamentGameId,
        sideId: { in: [tournamentHomeSideId, tournamentAwaySideId] },
        revision: 1,
      },
      data: { state: 'SUBMITTED' },
    });

    // T1-0 fix round 3: this PIN's subject is the six-persona authorization
    // matrix (read/mutation allow-deny, cross-scope/revoked/expired/stale
    // denial, audit atomicity) -- it is NOT about period lifecycle. But
    // T1-0 made "a LIVE period exists" a precondition every appendEvent call
    // must satisfy before authorization-adjacent behavior is even
    // observable, and this fixture never started the game, so every
    // "allow" mutation below used to reach `assertEventReferences` with
    // period 1 still SCHEDULED and got rejected by the new
    // PERIOD_NOT_STARTED gate before ever reaching the matrix behavior the
    // PIN exists to freeze. Starting the game here satisfies that
    // precondition without touching what the PIN actually asserts: `start`
    // only requires tournament_command authority (platform_ops qualifies,
    // same actor that created the game above), and every assertion below
    // already re-fetches `current.version`/`current.lastSequence` fresh
    // before each mutation rather than hardcoding them, so this extra
    // version bump changes no expected values. It is audited under
    // `GAME_START`, not `EVENT_APPEND`, so it cannot inflate the
    // `successfulAudits` count the next test asserts on.
    const setupTakeoverToken = await grantTournamentTakeover(tournamentGameId, ids.platformOps);
    await service.executeCommand(authUser(ids.platformOps), tournamentGameId, 'start', 'task7-tournament-game-start', {
      expectedVersion: 0,
      clientCommandId: 'task7-tournament-game-start',
      takeoverToken: setupTakeoverToken,
      occurredAt: new Date().toISOString(),
      payload: {},
    });

    const teamInput: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TEAM_MATCH,
      sourceId: ids.teamMatch,
      competitionConfigVersionId: configId,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Task 7 Host' },
        {
          sideKey: V1GameSideKey.AWAY,
          teamId: ids.opponentTeam,
          displayNameSnapshot: 'Task 7 Opponent',
        },
      ],
      participants: [],
    };
    teamGameId = (
      await prisma.$transaction((tx) =>
        service.createFromSourceInTransaction(
          tx,
          teamInput,
          sourceContext(
            {
              actorType: 'USER',
              actorUserId: ids.teamOwner,
              role: 'team_owner',
              teamId: ids.hostTeam,
            },
            'task7-create-team-game',
            teamInput,
          ),
        ),
      )
    ).gameId;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('PINs the frozen six-persona read and representative mutation matrix', async () => {
    const tournamentRows = [
      { actor: 'platform_ops', userId: ids.platformOps, mutation: 'allow' },
      { actor: 'tournament_director', userId: ids.director, mutation: 'allow' },
      { actor: 'field_operator', userId: ids.fieldOperator, mutation: 'allow' },
      { actor: 'support_readonly', userId: ids.supportReadonly, mutation: 'deny' },
    ] as const;

    for (const row of tournamentRows) {
      const read = await service.getGame(authUser(row.userId), tournamentGameId);
      expect(read.actorRole).toBe(row.actor);
      allowed += 1;

      const current = await prisma.v1Game.findUniqueOrThrow({ where: { id: tournamentGameId } });
      const eventId = `task7-${row.actor}-event`;
      const takeoverToken =
        row.mutation === 'allow' ? await grantTournamentTakeover(tournamentGameId, row.userId) : `task7-${row.actor}-takeover`;
      const mutation = () =>
        service.appendEvent(authUser(row.userId), tournamentGameId, eventId, {
          expectedVersion: current.version,
          clientEventId: eventId,
          takeoverToken,
          type: V1GameEventType.PERIOD_START,
          sideId: tournamentHomeSideId,
          period: 1,
          clockMs: current.lastSequence * 1000,
          occurredAt: new Date().toISOString(),
          payload: { actor: row.actor },
        });
      if (row.mutation === 'allow') {
        const result = await mutation();
        expect(result).toEqual(
          expect.objectContaining({
            gameId: tournamentGameId,
            version: current.version + 1,
            sequence: current.lastSequence + 1,
          }),
        );
        const persisted = await prisma.v1GameEvent.findUniqueOrThrow({
          where: {
            gameId_clientEventId: { gameId: tournamentGameId, clientEventId: eventId },
          },
        });
        expect(persisted.actorUserId).toBe(row.userId);
        allowed += 1;
      } else {
        await expectDeniedWithoutWrite(tournamentGameId, mutation);
        denied += 1;
      }
    }

    const teamRead = await service.getGame(authUser(ids.teamManager), teamGameId);
    expect(teamRead.actorRole).toBe('team_manager');
    allowed += 1;
    const teamMutation = await service.createResultRevision(
      authUser(ids.teamManager),
      teamGameId,
      'task7-team-manager-result',
      {
        expectedVersion: 0,
        clientCommandId: 'task7-team-manager-result',
        score: { home: 0, away: 0 },
        actualParticipants: [],
        eventsHash: 'task7-empty-events',
      },
    );
    expect(
      await prisma.v1GameResultRevision.findUniqueOrThrow({
        where: { id: teamMutation.revisionId },
      }),
    ).toEqual(expect.objectContaining({ createdByUserId: ids.teamManager, state: 'DRAFT' }));
    allowed += 1;

    const publicRead = await service.getVisibility(tournamentGameId);
    expect(publicRead).toEqual(expect.objectContaining({ gameId: tournamentGameId }));
    allowed += 1;
    const current = await prisma.v1Game.findUniqueOrThrow({ where: { id: tournamentGameId } });
    await expectDeniedWithoutWrite(tournamentGameId, () =>
      service.appendEvent(authUser(ids.public), tournamentGameId, 'task7-public-event', {
        expectedVersion: current.version,
        clientEventId: 'task7-public-event',
        takeoverToken: 'task7-public-takeover',
        type: V1GameEventType.PERIOD_START,
        sideId: tournamentHomeSideId,
        period: 1,
        clockMs: 9000,
        occurredAt: '2026-08-01T12:00:09.000Z',
        payload: { actor: 'public' },
      }),
    );
    denied += 1;

    expect({ allowed, denied, deniedWrites }).toEqual({ allowed: 10, denied: 2, deniedWrites: 0 });
  });

  it('probes malformed, cross-scope, revoked, expired, and stale authorization without writes', async () => {
    const malformedRole = 'MALFORMED_ROLE';
    const malformedBefore = await prisma.v1TournamentStaffAssignment.count();
    await expect(
      prisma.$executeRaw`
        INSERT INTO v1_tournament_staff_assignments
          (id, tournament_id, user_id, role, granted_by_user_id, created_at, updated_at)
        VALUES
          (${`77000000-0000-4000-8000-000000000099`}::uuid, ${ids.tournament}::uuid,
           ${ids.staleSession}::uuid, CAST(${malformedRole} AS "V1TournamentStaffRole"),
           ${ids.platformOps}::uuid, NOW(), NOW())
      `,
    ).rejects.toThrow();
    expect(await prisma.v1TournamentStaffAssignment.count()).toBe(malformedBefore);

    const deniedUsers = [
      ['cross-tournament', ids.crossTournamentOperator],
      ['cross-fixture', ids.crossFixtureOperator],
      ['cross-court', ids.crossCourtOperator],
      ['revoked', ids.revokedOperator],
      ['expired', ids.expiredOperator],
      ['stale-session', ids.staleSession],
    ] as const;
    for (const [probe, userId] of deniedUsers) {
      const current = await prisma.v1Game.findUniqueOrThrow({ where: { id: tournamentGameId } });
      const eventId = `task7-probe-${probe}`;
      await expectDeniedWithoutWrite(tournamentGameId, () =>
        service.appendEvent(authUser(userId), tournamentGameId, eventId, {
          expectedVersion: current.version,
          clientEventId: eventId,
          takeoverToken: `task7-probe-${probe}-takeover`,
          type: V1GameEventType.PERIOD_START,
          sideId: tournamentHomeSideId,
          period: 1,
          clockMs: 10000,
          occurredAt: '2026-08-01T12:00:10.000Z',
          payload: { probe },
        }),
      );
      expect(await prisma.v1GameEvent.count({ where: { gameId: tournamentGameId, clientEventId: eventId } })).toBe(0);
    }

    const successfulAudits = await prisma.v1OperationAudit.findMany({
      where: {
        resourceType: 'GAME',
        resourceId: tournamentGameId,
        action: 'EVENT_APPEND',
      },
      orderBy: { createdAt: 'asc' },
      select: {
        actorType: true,
        actorUserId: true,
        requestId: true,
        maskedSourceIp: true,
        before: true,
        after: true,
        tournamentId: true,
        fixtureId: true,
        fieldId: true,
      },
    });
    expect(successfulAudits).toHaveLength(3);
    expect(successfulAudits.map((audit) => audit.actorUserId)).toEqual([
      ids.platformOps,
      ids.director,
      ids.fieldOperator,
    ]);
    expect(
      successfulAudits.every(
        (audit) =>
          audit.actorType === 'USER' &&
          audit.requestId.length > 0 &&
          audit.maskedSourceIp === null &&
          audit.before !== null &&
          audit.after !== null &&
          audit.tournamentId === ids.tournament &&
          audit.fixtureId === ids.fixture &&
          audit.fieldId === ids.field,
      ),
    ).toBe(true);
  });

  it('revalidates the current assignment before replaying a privileged command', async () => {
    const current = await prisma.v1Game.findUniqueOrThrow({ where: { id: tournamentGameId } });
    const eventId = 'task7-revoke-between-commands';
    const revokeToken = await grantTournamentTakeover(tournamentGameId, ids.fieldOperator);
    const operation = () =>
      service.appendEvent(authUser(ids.fieldOperator), tournamentGameId, eventId, {
        expectedVersion: current.version,
        clientEventId: eventId,
        takeoverToken: revokeToken,
        type: V1GameEventType.PERIOD_START,
        sideId: tournamentHomeSideId,
        period: 1,
        clockMs: 11000,
        occurredAt: new Date().toISOString(),
        payload: { probe: 'revoke-between-commands' },
      });

    await expect(operation()).resolves.toEqual(
      expect.objectContaining({ gameId: tournamentGameId, replayed: false }),
    );
    await prisma.v1TournamentStaffAssignment.update({
      where: { id: fieldOperatorAssignmentId },
      data: { revokedAt: new Date(), version: { increment: 1 } },
    });
    await expectDeniedWithoutWrite(tournamentGameId, operation);

    const audit = await prisma.v1OperationAudit.findFirstOrThrow({
      where: { resourceType: 'GAME', resourceId: tournamentGameId, requestId: eventId },
    });
    expect(audit).toEqual(
      expect.objectContaining({
        actorType: 'USER',
        actorUserId: ids.fieldOperator,
        maskedSourceIp: null,
        tournamentId: ids.tournament,
        fixtureId: ids.fixture,
        fieldId: ids.field,
      }),
    );
    expect(
      await prisma.v1OperationAudit.count({
        where: { resourceType: 'GAME', resourceId: tournamentGameId, requestId: eventId },
      }),
    ).toBe(1);

  });

  it('rolls back the privileged mutation when the audit insert fails', async () => {
    await prisma.$executeRaw`
      CREATE FUNCTION task7_reject_game_audit() RETURNS trigger AS $$
      BEGIN
        IF NEW.request_id = 'task7-audit-rollback' THEN
          RAISE EXCEPTION 'TASK7_FORCED_AUDIT_FAILURE';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `;
    await prisma.$executeRaw`
      CREATE TRIGGER task7_reject_game_audit_trigger
      BEFORE INSERT ON v1_operation_audits
      FOR EACH ROW EXECUTE FUNCTION task7_reject_game_audit()
    `;
    const current = await prisma.v1Game.findUniqueOrThrow({ where: { id: tournamentGameId } });
    const before = await writeSnapshot(tournamentGameId);
    const auditRollbackToken = await grantTournamentTakeover(tournamentGameId, ids.director);
    try {
      await expect(
        service.appendEvent(
          authUser(ids.director),
          tournamentGameId,
          'task7-audit-rollback',
          {
            expectedVersion: current.version,
            clientEventId: 'task7-audit-rollback',
            takeoverToken: auditRollbackToken,
            type: V1GameEventType.PERIOD_START,
            sideId: tournamentHomeSideId,
            period: 1,
            clockMs: 12000,
            occurredAt: new Date().toISOString(),
            payload: { probe: 'audit-rollback' },
          },
        ),
      ).rejects.toThrow('TASK7_FORCED_AUDIT_FAILURE');
    } finally {
      await prisma.$executeRaw`
        DROP TRIGGER task7_reject_game_audit_trigger ON v1_operation_audits
      `;
      await prisma.$executeRaw`DROP FUNCTION task7_reject_game_audit()`;
    }
    expect(await writeSnapshot(tournamentGameId)).toEqual(before);

    process.stdout.write(
      `TASK7_GAMES_AUTH_AUDIT=PASS personas=6 allowed=${allowed} denied=${denied} revoked=deny crossTournament=deny crossCourt=deny audits=atomic deniedWrites=${deniedWrites}\n`,
    );
  });
});
