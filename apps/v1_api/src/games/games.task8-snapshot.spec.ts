import { Test } from '@nestjs/testing';
import {
  V1AccountStatus,
  V1GameSourceType,
  V1OnboardingStatus,
} from '@prisma/client';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { OperationAuditWriterService } from '../common/audit/operation-audit-writer.service';
import { PrismaService } from '../prisma/prisma.service';
import { GamesService } from './games.service';

const reader: V1AuthUser = {
  id: 'task8-snapshot-reader',
  email: null,
  accountStatus: V1AccountStatus.active,
  onboardingStatus: V1OnboardingStatus.completed,
};

type FakeEvent = {
  id: string;
  gameId: string;
  sequence: number;
};

type FakeGameSelect = {
  lastSequence?: boolean;
  sourceType?: unknown;
  teamMatch?: unknown;
  tournamentFixture?: unknown;
};

type FakeEventWhere = {
  gameId: string;
  sequence?: { gt?: number; lte?: number };
};

type FakeDatabase = {
  v1Game: {
    findUnique(input: { select: FakeGameSelect }): Promise<
      | { lastSequence: number }
      | {
          sourceType: V1GameSourceType;
          teamMatch: null;
          tournamentFixture: { id: string; tournamentId: string; fieldId: null };
        }
    >;
  };
  v1GameEvent: {
    findMany(input: {
      where: FakeEventWhere;
      orderBy?: { sequence: 'asc' };
    }): Promise<FakeEvent[]>;
  };
  v1AdminUser: {
    findUnique(): Promise<{
      adminRole: string;
      status: string;
      revokedAt: null;
      updatedAt: Date;
      user: { accountStatus: string };
    }>;
  };
  $transaction<T>(callback: (transaction: FakeDatabase) => Promise<T>): Promise<T>;
};

type SnapshotFixture = {
  service: GamesService;
  readOrder: string[];
  close: () => Promise<void>;
};

async function createSnapshotFixture(race: boolean): Promise<SnapshotFixture> {
  const state = {
    events: [2, 3].map((sequence): FakeEvent => ({
      id: `event-${sequence}`,
      gameId: 'task8-snapshot-game',
      sequence,
    })),
    lastSequence: 3,
    appendCommitted: false,
  };
  const readOrder: string[] = [];

  const appendCommit = () => {
    if (!race || state.appendCommitted) {
      return;
    }
    state.appendCommitted = true;
    state.events.push({
      id: 'event-4',
      gameId: 'task8-snapshot-game',
      sequence: 4,
    });
    state.lastSequence = 4;
    readOrder.push('append-commit');
  };

  const createView = (
    events: () => readonly FakeEvent[],
    watermark: () => number,
  ): FakeDatabase => ({
    v1Game: {
      async findUnique({ select }: { select: FakeGameSelect }) {
        if (select.lastSequence === true && Object.keys(select).length === 1) {
          readOrder.push('watermark-read');
          return { lastSequence: watermark() };
        }

        readOrder.push('authorization-read');
        return {
          sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
          teamMatch: null,
          tournamentFixture: {
            id: '80000000-0000-4000-8000-000000000002',
            tournamentId: '80000000-0000-4000-8000-000000000001',
            fieldId: null,
          },
        };
      },
    },
    v1GameEvent: {
      async findMany({ where, orderBy }: { where: FakeEventWhere; orderBy?: { sequence: 'asc' } }) {
        const snapshot = events().filter(
          (event) =>
            event.gameId === where.gameId &&
            (where.sequence?.gt === undefined || event.sequence > where.sequence.gt) &&
            (where.sequence?.lte === undefined || event.sequence <= where.sequence.lte),
        );
        readOrder.push('events-snapshot');
        appendCommit();
        return orderBy?.sequence === 'asc'
          ? [...snapshot].sort((left, right) => left.sequence - right.sequence)
          : [...snapshot];
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
    async $transaction<T>(callback: (transaction: FakeDatabase) => Promise<T>) {
      const transactionEvents = state.events.map((event) => ({ ...event }));
      const transactionWatermark = state.lastSequence;
      return callback(createView(() => transactionEvents, () => transactionWatermark));
    },
  });

  const database = createView(() => state.events, () => state.lastSequence);

  const moduleRef = await Test.createTestingModule({
    providers: [
      GamesService,
      { provide: PrismaService, useValue: database },
      { provide: OperationAuditWriterService, useValue: new OperationAuditWriterService() },
    ],
  }).compile();

  return {
    service: moduleRef.get(GamesService),
    readOrder,
    close: () => moduleRef.close(),
  };
}

describe('Task 8 HTTP event backfill snapshot coherence', () => {
  it('Task 8 PIN keeps the contiguous event set and watermark at sequence 3', async () => {
    const fixture = await createSnapshotFixture(false);

    try {
      const result = await fixture.service.listEvents(reader, 'task8-snapshot-game', 1);

      expect(result.events.map((event) => event.sequence)).toEqual([2, 3]);
      expect(result.lastSequence).toBe(3);
    } finally {
      await fixture.close();
    }
  });

  it('Task 8 RED rejects an event set at 3 paired with a newer watermark at 4', async () => {
    const fixture = await createSnapshotFixture(true);

    try {
      const result = await fixture.service.listEvents(reader, 'task8-snapshot-game', 1);
      const eventSequences = result.events.map((event) => event.sequence);
      const maxEventSequence = Math.max(...eventSequences);
      const coherentWithAppend = result.lastSequence === 4 && maxEventSequence >= 4;
      const coherentlyBounded = result.lastSequence === 3 && maxEventSequence <= 3;

      expect(fixture.readOrder).toEqual(
        expect.arrayContaining(['events-snapshot', 'append-commit', 'watermark-read']),
      );
      if (!coherentWithAppend && !coherentlyBounded) {
        throw new Error(
          `Incoherent backfill response: eventSequences=${JSON.stringify(eventSequences)} lastSequence=${result.lastSequence}`,
        );
      }
    } finally {
      await fixture.close();
    }
  });
});
