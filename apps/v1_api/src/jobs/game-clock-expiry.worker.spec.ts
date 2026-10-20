import type { Prisma, V1Game, V1GamePeriod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FOOTBALL_V1_CONFIG } from '../tournaments/competition-config/competition-config';
import { V1GameOperationsWorkerService } from './v1-game-operations-worker.service';

// Only the DB connector constructor is replaced; worker methods/handler registration stay real.
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

const NOW = new Date('2026-10-15T03:00:00.000Z');
const MINUTE_MS = 60_000;
const PERIOD_MS = FOOTBALL_V1_CONFIG.periods[0].durationMinutes * MINUTE_MS;

type ClockInput = {
  readonly state?: V1Game['state'];
  readonly startedAt: Date | null;
  readonly pausedTotalMs?: number;
  readonly pausedAt?: Date | null;
  readonly scheduledEndAt?: Date;
  readonly currentPeriod?: number;
  readonly extraTime?: boolean;
  readonly sharedRecord?: boolean;
};

/** Persistence only: expiry decisions and lifecycle transitions belong to the real worker. */
function clockDatabase(input: ClockInput) {
  const game: V1Game = {
    id: 'clock-game', sourceType: 'TEAM_MATCH', teamMatchId: 'clock-match',
    state: input.state ?? 'LIVE', version: 1, lastSequence: 0,
    competitionConfigVersionId: 'clock-config', currentOfficialRevisionId: null,
    createdAt: NOW, updatedAt: NOW,
  };
  const periods: V1GamePeriod[] = [1, 2].map((number) => ({
    id: `clock-period-${number}`, gameId: game.id, number,
    state: number === (input.currentPeriod ?? 1) && input.startedAt !== null ? 'LIVE' : number < (input.currentPeriod ?? 1) ? 'ENDED' : 'SCHEDULED',
    startedAt: number === (input.currentPeriod ?? 1) ? input.startedAt : null, endedAt: null,
    pausedTotalMs: number === (input.currentPeriod ?? 1) ? input.pausedTotalMs ?? 0 : 0,
    pausedAt: number === (input.currentPeriod ?? 1) ? input.pausedAt ?? null : null,
    createdAt: NOW, updatedAt: NOW,
  }));
  const config = {
    id: game.competitionConfigVersionId,
    periods: FOOTBALL_V1_CONFIG.periods.map((period) => ({ ...period, extraTime: input.extraTime ?? period.extraTime })),
  };
  const match = {
    id: game.teamMatchId, tournamentId: 'clock-tournament', leagueId: null, deletedAt: null, fieldId: null,
    endAt: input.scheduledEndAt ?? new Date(NOW.getTime() + PERIOD_MS),
    tournament: { kind: 'tournament' }, league: null,
    tournamentDetails: { teamMatchId: game.teamMatchId, tournamentId: 'clock-tournament' },
  };
  const audits: Prisma.V1OperationAuditCreateArgs['data'][] = [];
  const revisions: Prisma.V1GameResultRevisionCreateArgs['data'][] = [];
  const commands = new Map<string, Prisma.V1IdempotencyRecordCreateArgs['data']>();
  const sharedRecord = input.sharedRecord ? { gameId: game.id, version: 1, confirmations: ['home'], officialAt: null } : null;
  const loadedGame = () => ({
    ...game, periods: periods.filter((period) => period.state === 'LIVE'), competitionConfig: config,
    teamMatch: match, sharedRecord,
  });
  const findPeriod = (where: Prisma.V1GamePeriodWhereInput = {}) => periods.find((period) =>
    (where.id === undefined || where.id === period.id) &&
    (where.gameId === undefined || where.gameId === period.gameId) &&
    (where.number === undefined || where.number === period.number) &&
    (where.state === undefined || where.state === period.state),
  ) ?? null;
  const queryRaw = async (query: TemplateStringsArray | Prisma.Sql) => {
    const sql = 'sql' in query ? query.sql : query.join('?');
    if (sql.includes('pg_try_advisory_xact_lock_shared')) return [{ acquired: true }];
    if (sql.includes('v1_outbox_events')) return [];
    if (sql.includes('FROM v1_games') && sql.includes('FOR UPDATE')) return [{ id: game.id }];
    throw new Error(`Clock fixture does not implement this SQL: ${sql}`);
  };
  const executeRaw = async (query: TemplateStringsArray | Prisma.Sql) => {
    const sql = 'sql' in query ? query.sql : query.join('?');
    if (sql.includes('v1_outbox_events')) return 0;
    throw new Error(`Clock fixture does not implement this SQL write: ${sql}`);
  };
  const delegates = {
    v1Game: {
      findMany: async () => [loadedGame()],
      findUnique: async () => loadedGame(),
      update: async ({ data }: Prisma.V1GameUpdateArgs) => {
        if (typeof data.state === 'string') game.state = data.state;
        if (typeof data.version === 'number') game.version = data.version;
        else if (data.version?.increment !== undefined) game.version += data.version.increment;
        return loadedGame();
      },
    },
    v1GamePeriod: {
      findMany: async () => periods.map((period) => ({ ...period, game: loadedGame() })),
      findFirst: async ({ where }: Prisma.V1GamePeriodFindFirstArgs) => findPeriod(where),
      update: async ({ where, data }: Prisma.V1GamePeriodUpdateArgs) => {
        const period = periods.find((row) => row.id === where.id);
        if (!period) throw new Error('Clock fixture received an unknown period ID');
        if (typeof data.state === 'string') period.state = data.state;
        if (data.endedAt instanceof Date || data.endedAt === null) period.endedAt = data.endedAt;
        return period;
      },
    },
    v1CompetitionConfigVersion: { findUnique: async () => config },
    v1IdempotencyRecord: {
      findUnique: async ({ where }: Prisma.V1IdempotencyRecordFindUniqueArgs) =>
        commands.get(where.actorUserId_action_resourceType_resourceId_idempotencyKey?.idempotencyKey ?? '') ?? null,
      create: async ({ data }: Prisma.V1IdempotencyRecordCreateArgs) => {
        commands.set(data.idempotencyKey, data);
        return data;
      },
    },
    v1OperationAudit: {
      create: async ({ data }: Prisma.V1OperationAuditCreateArgs) => {
        audits.push(data);
        return { id: `clock-audit-${audits.length}` };
      },
    },
    v1GameResultRevision: {
      create: async ({ data }: Prisma.V1GameResultRevisionCreateArgs) => {
        revisions.push(data);
        return { id: `clock-revision-${revisions.length}` };
      },
    },
  };
  // Keep the public PrismaService type without a live client or a blanket type assertion.
  const prisma = new PrismaService();
  for (const [name, delegate] of Object.entries(delegates)) {
    Object.defineProperty(prisma, name, { value: delegate, configurable: true });
  }
  Object.defineProperties(prisma, {
    $queryRaw: { value: queryRaw },
    $executeRaw: { value: executeRaw },
    $transaction: { value: async <T>(operation: (tx: PrismaService) => Promise<T>) => operation(prisma) },
  });
  const snapshot = () => structuredClone({ game, periods, audits, revisions, sharedRecord, commands: [...commands.values()] });
  return { prisma, snapshot };
}

async function cycle(prisma: PrismaService) {
  const worker = new V1GameOperationsWorkerService(prisma);
  try {
    return await worker.processOne();
  } finally {
    await worker.shutdown();
  }
}

describe('MD-QA #142 — production worker consumes persisted game-clock expiry', () => {
  beforeEach(() => { jest.useFakeTimers({ now: NOW }); });
  afterEach(() => { jest.useRealTimers(); });

  it('persists the expired first period and halftime without a result, even when the schedule ends later', async () => {
    const db = clockDatabase({ startedAt: new Date(NOW.getTime() - PERIOD_MS - MINUTE_MS) });

    const processed = await cycle(db.prisma);

    const persisted = db.snapshot();
    // The baseline idle worker returns normally; this state assertion must supply the actual RED.
    expect(persisted.periods[0]).toMatchObject({ state: 'ENDED', endedAt: NOW });
    expect(processed).toBe(true);
    expect(persisted.periods[1]).toMatchObject({ state: 'HALFTIME', startedAt: null, endedAt: null });
    expect(persisted.game).toMatchObject({ state: 'LIVE', version: 2, lastSequence: 0, currentOfficialRevisionId: null });
    expect(persisted.audits).toEqual([expect.objectContaining({
      actorType: 'SYSTEM', actorUserId: null, action: 'GAME_END_PERIOD', resourceId: persisted.game.id,
    })]);
    expect(persisted.revisions).toEqual([]);
  });

  const unchangedCases: ReadonlyArray<{ readonly name: string; readonly input: ClockInput }> = [
    {
      name: 'configured play time remains below the threshold',
      input: { startedAt: new Date(NOW.getTime() - PERIOD_MS + MINUTE_MS) },
    },
    {
      name: 'completed pauses leave 44 played minutes despite 46 wall-clock minutes',
      input: { startedAt: new Date(NOW.getTime() - PERIOD_MS - MINUTE_MS), pausedTotalMs: 2 * MINUTE_MS },
    },
    {
      name: 'a current pause freezes the play clock before its threshold',
      input: {
        state: 'PAUSED', startedAt: new Date(NOW.getTime() - PERIOD_MS - 10 * MINUTE_MS),
        pausedAt: new Date(NOW.getTime() - 12 * MINUTE_MS), pausedTotalMs: 2 * MINUTE_MS,
      },
    },
    {
      name: 'a passed scheduled endAt does not end five minutes of actual play',
      input: {
        startedAt: new Date(NOW.getTime() - 5 * MINUTE_MS), scheduledEndAt: new Date(NOW.getTime() - MINUTE_MS),
      },
    },
  ];

  it.each(unchangedCases)('preserves persisted state when $name', async ({ input }) => {
    const db = clockDatabase(input);
    const before = db.snapshot();

    await cycle(db.prisma);

    expect(db.snapshot()).toEqual(before);
  });

  it('closes the last period while leaving final end and all result revisions to the operator', async () => {
    const db = clockDatabase({ currentPeriod: 2, startedAt: new Date(NOW.getTime() - PERIOD_MS) });
    await cycle(db.prisma);
    expect(db.snapshot().periods[1]).toMatchObject({ state: 'ENDED', endedAt: NOW });
    expect(db.snapshot().game).toMatchObject({ state: 'LIVE', version: 2, currentOfficialRevisionId: null });
    expect(db.snapshot().revisions).toEqual([]);
  });

  it('expires a configured extra-time period at its own duration without adding that duration again', async () => {
    const db = clockDatabase({ extraTime: true, startedAt: new Date(NOW.getTime() - PERIOD_MS) });
    await cycle(db.prisma);
    expect(db.snapshot().periods[0]).toMatchObject({ state: 'ENDED', endedAt: NOW });
    expect(db.snapshot().audits).toHaveLength(1);
  });

  it('persists one durable expiry command after completed pauses and no duplicate transition on restart', async () => {
    const db = clockDatabase({ startedAt: new Date(NOW.getTime() - PERIOD_MS - 10 * MINUTE_MS), pausedTotalMs: 8 * MINUTE_MS });
    await cycle(db.prisma);
    const committed = db.snapshot();
    expect(committed.periods[0]).toMatchObject({ state: 'ENDED', endedAt: NOW });
    expect(committed.commands).toEqual([expect.objectContaining({ actorUserId: 'SYSTEM:GAME_CLOCK_EXPIRY', action: 'game_end_period' })]);
    await cycle(db.prisma);
    expect(db.snapshot()).toEqual(committed);
  });

  it('preserves shared recording without inventing a period clock that was never started', async () => {
    const db = clockDatabase({ sharedRecord: true, startedAt: null });
    const before = db.snapshot();
    await cycle(db.prisma);
    expect(db.snapshot()).toEqual(before);
  });

  it('expires an already running clock after shared recording begins without confirming either team result', async () => {
    const db = clockDatabase({ sharedRecord: true, startedAt: new Date(NOW.getTime() - PERIOD_MS - MINUTE_MS) });
    const before = db.snapshot();
    await cycle(db.prisma);
    const after = db.snapshot();
    expect(after.periods[0]).toMatchObject({ state: 'ENDED', endedAt: NOW });
    expect(after.game).toMatchObject({ state: 'LIVE', version: 2, currentOfficialRevisionId: null });
    expect(after.audits).toHaveLength(1);
    expect(after.revisions).toEqual([]);
    expect(after.sharedRecord).toEqual(before.sharedRecord);
  });
});
