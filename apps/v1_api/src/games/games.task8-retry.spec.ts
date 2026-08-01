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
import { AppendGameEventDto } from './dto/game-event.dto';
import { canonicalGameCommandPayloadHash, GamesService } from './games.service';

const reader: V1AuthUser = {
  id: 'task8-retry-reader',
  email: null,
  accountStatus: V1AccountStatus.active,
  onboardingStatus: V1OnboardingStatus.completed,
};

type ImmutableEvent = Omit<
  AppendGameEventDto,
  'expectedVersion' | 'clientEventId' | 'takeoverToken'
>;

type RetryInput = {
  rebasedExpectedVersion: number;
  clientEventId: string;
  takeoverToken: string;
  payloadHash: string;
  event: ImmutableEvent;
};

function immutableEvent(payload: Record<string, unknown>): ImmutableEvent {
  return {
    type: V1GameEventType.PERIOD_START,
    sideId: 'task8-side',
    period: 1,
    clockMs: 0,
    occurredAt: '2026-08-01T00:00:00.000Z',
    payload,
  };
}

function appendInput(
  clientEventId: string,
  event: ImmutableEvent,
  expectedVersion: number,
  takeoverToken: string,
): AppendGameEventDto {
  return { expectedVersion, clientEventId, takeoverToken, ...event };
}

function retryInput(
  clientEventId: string,
  event: ImmutableEvent,
  rebasedExpectedVersion: number,
  takeoverToken: string,
): RetryInput {
  return {
    rebasedExpectedVersion,
    clientEventId,
    takeoverToken,
    payloadHash: canonicalGameCommandPayloadHash(event),
    event,
  };
}

function requireRetryEvent(service: GamesService) {
  const retry = Reflect.get(service, 'retryEvent');
  if (typeof retry !== 'function') {
    throw new Error('Task 8 missing retryEvent service seam for offline rebase');
  }
  return retry;
}

async function retryEvent(
  service: GamesService,
  gameId: string,
  input: RetryInput,
): Promise<unknown> {
  const retry = requireRetryEvent(service);
  return Reflect.apply(retry, service, [reader, gameId, input]);
}

async function createTask8RetryService() {
  const state = {
    events: [] as Array<{
      id: string;
      gameId: string;
      sequence: number;
      clientEventId: string;
      payloadHash: string;
    }>,
    game: {
      id: 'task8-retry-game',
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      teamMatchId: null,
      tournamentFixtureId: '80000000-0000-4000-8000-000000000002',
      state: V1GameState.LIVE,
      version: 0,
      lastSequence: 0,
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
        const event = { id: `event-${data.sequence}`, ...data };
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
        return (
          state.idempotency.get(
            where.actorUserId_action_resourceType_resourceId_idempotencyKey.idempotencyKey,
          ) ?? null
        );
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

describe('Task 8 offline event retry service contract', () => {
  it('Task 8 PIN replays an identical ordinary append once and conflicts on a changed payload', async () => {
    const fixture = await createTask8RetryService();
    const event = immutableEvent({ source: 'offline' });
    const original = appendInput('task8-pin-client-event', event, 0, 'initial-token');

    try {
      const first = await fixture.service.appendEvent(
        reader,
        'task8-retry-game',
        original.clientEventId,
        original,
      );
      const replay = await fixture.service.appendEvent(
        reader,
        'task8-retry-game',
        original.clientEventId,
        original,
      );

      expect(first).toEqual(
        expect.objectContaining({ clientEventId: original.clientEventId, sequence: 1, replayed: false }),
      );
      expect(replay).toEqual({ ...first, replayed: true });
      expect(fixture.state.events.map((stored) => stored.sequence)).toEqual([1]);
      await expect(
        fixture.service.appendEvent(
          reader,
          'task8-retry-game',
          original.clientEventId,
          appendInput(
            original.clientEventId,
            immutableEvent({ source: 'changed' }),
            1,
            'initial-token',
          ),
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: 'IDEMPOTENCY_PAYLOAD_CONFLICT' },
      });
      expect(fixture.state.events.map((stored) => stored.sequence)).toEqual([1]);
    } finally {
      await fixture.close();
    }
  });

  it('Task 8 RED replays an existing immutable offline event at the rebased version despite a fresh takeover token', async () => {
    const fixture = await createTask8RetryService();
    const event = immutableEvent({ source: 'offline' });
    const original = appendInput('task8-retry-existing', event, 0, 'expired-token');

    try {
      const initial = await fixture.service.appendEvent(
        reader,
        'task8-retry-game',
        original.clientEventId,
        original,
      );
      const replay = await retryEvent(
        fixture.service,
        'task8-retry-game',
        retryInput(original.clientEventId, event, 1, 'fresh-reacquired-token'),
      );

      expect(replay).toEqual(
        expect.objectContaining({
          clientEventId: original.clientEventId,
          sequence: initial.sequence,
          version: initial.version,
          replayed: true,
        }),
      );
      expect(fixture.state.events.map((stored) => stored.sequence)).toEqual([1]);
      expect(fixture.state.game.version).toBe(1);
      await expect(
        retryEvent(
          fixture.service,
          'task8-retry-game',
          retryInput(
            original.clientEventId,
            immutableEvent({ source: 'changed' }),
            1,
            'fresh-reacquired-token',
          ),
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: 'IDEMPOTENCY_PAYLOAD_CONFLICT' },
      });
      expect(fixture.state.events.map((stored) => stored.sequence)).toEqual([1]);
      expect(fixture.state.game.version).toBe(1);
    } finally {
      await fixture.close();
    }
  });

  it('Task 8 RED appends one unseen immutable offline event at the rebased version and replays its fresh-token retry', async () => {
    const fixture = await createTask8RetryService();
    const initialEvent = immutableEvent({ source: 'online' });
    const unseenEvent = immutableEvent({ source: 'offline-unseen' });

    try {
      await fixture.service.appendEvent(
        reader,
        'task8-retry-game',
        'task8-retry-preexisting',
        appendInput('task8-retry-preexisting', initialEvent, 0, 'initial-token'),
      );
      requireRetryEvent(fixture.service);
      await expect(
        retryEvent(
          fixture.service,
          'task8-retry-game',
          retryInput('task8-retry-unseen', unseenEvent, 0, 'fresh-stale-token'),
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: 'OFFLINE_EVENT_REBASE_CONFLICT' },
      });
      expect(fixture.state.events.map((stored) => stored.sequence)).toEqual([1]);
      expect(fixture.state.game.version).toBe(1);
      const firstRetry = await retryEvent(
        fixture.service,
        'task8-retry-game',
        retryInput('task8-retry-unseen', unseenEvent, 1, 'fresh-token-one'),
      );
      const replay = await retryEvent(
        fixture.service,
        'task8-retry-game',
        retryInput('task8-retry-unseen', unseenEvent, 2, 'fresh-token-two'),
      );

      expect(firstRetry).toEqual(
        expect.objectContaining({
          clientEventId: 'task8-retry-unseen',
          sequence: 2,
          version: 2,
          replayed: false,
        }),
      );
      expect(replay).toEqual(
        expect.objectContaining({
          clientEventId: 'task8-retry-unseen',
          sequence: 2,
          version: 2,
          replayed: true,
        }),
      );
      expect(fixture.state.events.map((stored) => stored.sequence)).toEqual([1, 2]);
      expect(fixture.state.game.version).toBe(2);
    } finally {
      await fixture.close();
    }
  });

  it('Task 8 RED rejects a changed event with the original hash as OFFLINE_EVENT_REBASE_CONFLICT without mutation', async () => {
    const fixture = await createTask8RetryService();
    const originalEvent = immutableEvent({ source: 'offline' });
    const changedEvent = immutableEvent({ source: 'tampered' });

    try {
      await fixture.service.appendEvent(
        reader,
        'task8-retry-game',
        'task8-retry-conflict',
        appendInput('task8-retry-conflict', originalEvent, 0, 'expired-token'),
      );
      const malformedRetry = retryInput(
        'task8-retry-conflict',
        changedEvent,
        1,
        'fresh-reacquired-token',
      );
      malformedRetry.payloadHash = canonicalGameCommandPayloadHash(originalEvent);

      requireRetryEvent(fixture.service);
      await expect(
        retryEvent(fixture.service, 'task8-retry-game', malformedRetry),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: 'OFFLINE_EVENT_REBASE_CONFLICT' },
      });
      expect(fixture.state.events.map((stored) => stored.sequence)).toEqual([1]);
      expect(fixture.state.game.version).toBe(1);
    } finally {
      await fixture.close();
    }
  });
});
