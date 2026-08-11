import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  V1AccountStatus,
  V1GameEventType,
  V1GameSourceType,
  V1GameState,
  V1OnboardingStatus,
} from '@prisma/client';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { OperationAuditWriterService } from '../common/audit/operation-audit-writer.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppendGameEventDto, ListGameEventsQueryDto } from './dto/game-event.dto';
import { GameTakeoverService } from './game-takeover.service';
import { GamesService } from './games.service';

const reader: V1AuthUser = {
  id: 'task8-reader',
  email: null,
  accountStatus: V1AccountStatus.active,
  onboardingStatus: V1OnboardingStatus.completed,
};

const queryMetadata: ArgumentMetadata = {
  type: 'query',
  metatype: ListGameEventsQueryDto,
  data: undefined,
};

function listEventsValidationPipe() {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
}

function eventInput(clientEventId: string, payload: Record<string, unknown>): AppendGameEventDto {
  return {
    expectedVersion: 0,
    clientEventId,
    takeoverToken: 'task8-takeover-token',
    type: V1GameEventType.PERIOD_START,
    sideId: 'task8-side',
    period: 1,
    clockMs: 0,
    // Computed at call time so Task 20's 30s server-clock-drift check
    // always sees a fresh occurredAt rather than a stale fixed literal.
    occurredAt: new Date().toISOString(),
    payload,
  };
}

async function createTask8Service(initialSequences: readonly number[], lastSequence: number) {
  const state = {
    events: initialSequences.map((sequence) => ({
      id: `event-${sequence}`,
      gameId: 'task8-game',
      sequence,
      clientEventId: `seed-${sequence}`,
      payloadHash: `seed-hash-${sequence}`,
    })),
    game: {
      id: 'task8-game',
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      teamMatchId: null,
      tournamentFixtureId: '80000000-0000-4000-8000-000000000002',
      state: V1GameState.LIVE,
      version: 0,
      lastSequence,
      competitionConfigVersionId: 'task8-config',
    },
    idempotency: new Map<
      string,
      { payloadHash: string; responseStatus: number; responseBody: Record<string, unknown> }
    >(),
  };

  const database = {
    async $transaction(callback: (transaction: unknown) => Promise<unknown>) {
      return callback(database);
    },
    async $queryRaw(_query: TemplateStringsArray, ..._values: unknown[]) {
      return [];
    },
    v1Game: {
      async findUnique({ select }: { select: Record<string, unknown> }) {
        if (select.lastSequence === true && Object.keys(select).length === 1) {
          return { lastSequence: state.game.lastSequence };
        }
        if (select.teamMatch !== undefined) {
          return {
            sourceType: state.game.sourceType,
            teamMatch: null,
            tournamentFixture: {
              id: '80000000-0000-4000-8000-000000000002',
              tournamentId: '80000000-0000-4000-8000-000000000001',
              fieldId: null,
            },
          };
        }
        if (select.tournamentFixture !== undefined) {
          return {
            tournamentFixture: {
              id: '80000000-0000-4000-8000-000000000002',
              tournamentId: '80000000-0000-4000-8000-000000000001',
              fieldId: null,
            },
          };
        }
        return { ...state.game };
      },
      async update({ data }: { data: { lastSequence: number; version: { increment: number } } }) {
        state.game.lastSequence = data.lastSequence;
        state.game.version += data.version.increment;
        return { ...state.game };
      },
    },
    v1GameEvent: {
      async findMany({
        where,
        orderBy,
      }: {
        where: { gameId: string; sequence?: { gt: number } };
        orderBy?: { sequence: 'asc' };
      }) {
        const events = state.events.filter(
          (event) =>
            event.gameId === where.gameId &&
            (where.sequence === undefined || event.sequence > where.sequence.gt),
        );
        return orderBy?.sequence === 'asc'
          ? [...events].sort((left, right) => left.sequence - right.sequence)
          : events;
      },
      async create({
        data,
      }: {
        data: {
          gameId: string;
          sequence: number;
          clientEventId: string;
          payloadHash: string;
        };
      }) {
        // See the matching comment in games.task8-retry.spec.ts:
        // `receivedAt`/`reversesEventId` mirror real Prisma `.create()`
        // defaults — `GamesService.appendEvent` now reads the created row
        // back to build the realtime broadcast payload.
        const event = { id: `event-${data.sequence}`, receivedAt: new Date(), reversesEventId: null, ...data };
        state.events.push(event);
        return event;
      },
    },
    v1AdminUser: {
      async findUnique() {
        return {
          adminRole: 'owner',
          status: 'active',
          revokedAt: null,
          updatedAt: new Date('2026-08-01T00:00:00.000Z'),
          user: { accountStatus: 'active' },
        };
      },
    },
    v1TeamMembership: {
      async findMany() {
        return [{ teamId: 'task8-team', role: 'manager' }];
      },
    },
    v1GamePeriod: {
      async findFirst() {
        return { id: 'task8-period' };
      },
    },
    v1GameSide: {
      async findFirst() {
        return { id: 'task8-side' };
      },
    },
    v1IdempotencyRecord: {
      async findUnique({
        where,
      }: {
        where: {
          actorUserId_action_resourceType_resourceId_idempotencyKey: { idempotencyKey: string };
        };
      }) {
        return state.idempotency.get(
          where.actorUserId_action_resourceType_resourceId_idempotencyKey.idempotencyKey,
        ) ?? null;
      },
      async create({
        data,
      }: {
        data: {
          idempotencyKey: string;
          payloadHash: string;
          responseStatus: number;
          responseBody: Record<string, unknown>;
        };
      }) {
        state.idempotency.set(data.idempotencyKey, {
          payloadHash: data.payloadHash,
          responseStatus: data.responseStatus,
          responseBody: data.responseBody,
        });
        return { id: data.idempotencyKey };
      },
    },
    v1OutboxEvent: {
      async create() {
        return { id: 'task8-outbox' };
      },
    },
    v1OperationAudit: {
      async create() {
        return { id: 'task8-audit' };
      },
    },
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      GamesService,
      GameTakeoverService,
      { provide: PrismaService, useValue: database },
      { provide: OperationAuditWriterService, useValue: new OperationAuditWriterService() },
    ],
  }).compile();

  return {
    service: moduleRef.get(GamesService),
    state,
    close: () => moduleRef.close(),
  };
}

describe('Task 8 HTTP event backfill PIN and RED', () => {
  it('Task 8 PIN returns only ascending events after the requested sequence and the durable lastSequence', async () => {
    const fixture = await createTask8Service([3, 1, 2], 3);

    try {
      const result = await fixture.service.listEvents(reader, 'task8-game', 1);

      expect(result.events.map((event) => event.sequence)).toEqual([2, 3]);
      expect(result.lastSequence).toBe(3);
    } finally {
      await fixture.close();
    }
  });

  it('Task 8 PIN replays an identical clientEventId with one durable sequence and conflicts on changed payload', async () => {
    const fixture = await createTask8Service([], 0);
    const takeover = await fixture.service.requestTakeover(reader, 'task8-game', {
      clientInstanceId: 'task8-client',
      lastSequence: 0,
    });
    const original = { ...eventInput('task8-client-event', { source: 'offline' }), takeoverToken: takeover.takeoverToken };

    try {
      const first = await fixture.service.appendEvent(reader, 'task8-game', original.clientEventId, original);
      expect([...fixture.state.idempotency.keys()]).toEqual(['task8-client-event']);
      const replay = await fixture.service.appendEvent(reader, 'task8-game', original.clientEventId, original);

      expect(first).toEqual(
        expect.objectContaining({ clientEventId: 'task8-client-event', sequence: 1, replayed: false }),
      );
      expect(replay).toEqual({ ...first, replayed: true });
      expect(fixture.state.events.map((event) => event.sequence)).toEqual([1]);
      await expect(
        fixture.service.appendEvent(
          reader,
          'task8-game',
          original.clientEventId,
          { ...eventInput('task8-client-event', { source: 'changed' }), expectedVersion: 1 },
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: 'IDEMPOTENCY_PAYLOAD_CONFLICT' },
      });
    } finally {
      await fixture.close();
    }
  });

  it.each([
    ['negative integer', { afterSequence: '-1' }],
    ['decimal', { afterSequence: '1.5' }],
    ['unsafe integer', { afterSequence: '9007199254740992' }],
    ['unknown query field', { afterSequence: '1', ignored: 'value' }],
  ])('Task 8 RED rejects malformed afterSequence query input: %s', async (_caseName, query) => {
    await expect(listEventsValidationPipe().transform(query, queryMetadata)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('Task 8 RED signals the first missing sequence in a non-contiguous backfill', async () => {
    const fixture = await createTask8Service([1, 3], 3);

    try {
      const result = await fixture.service.listEvents(reader, 'task8-game', 0);

      expect(result).toEqual(
        expect.objectContaining({
          lastSequence: 3,
          gap: { expectedSequence: 2, availableFrom: 3 },
        }),
      );
    } finally {
      await fixture.close();
    }
  });
});
