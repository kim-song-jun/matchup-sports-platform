import type { Prisma, V1Game, V1GamePeriod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { GameOperationClaim } from './v1-game-operations-worker.service';

export const CLOCK_TEST_NOW = new Date('2026-10-16T03:00:00.000Z');
export type ClockRow = Pick<V1Game, 'id' | 'state' | 'version'> & { periods: V1GamePeriod[] };
type Options = {
  readonly count?: number;
  readonly cutover?: boolean;
  readonly scanError?: boolean;
  readonly outbox?: boolean;
  readonly onLock?: (row: ClockRow) => void | Promise<void>;
};

export function deferredClockGate() {
  let release: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, open() { if (!release) throw new Error('Clock gate was not initialized'); release(); } };
}

/** Row storage and SQL persistence only; production services own all clock/lifecycle decisions. */
export function clockLifecycleDatabase(options: Options = {}) {
  const rows: ClockRow[] = Array.from({ length: options.count ?? 1 }, (_, index): ClockRow => {
    const id = `clock-${String(index).padStart(3, '0')}`;
    return { id, state: 'LIVE', version: 1, periods: [1, 2].map((number): V1GamePeriod => ({
      id: `${id}-period-${number}`, gameId: id, number, state: number === 1 ? 'LIVE' : 'SCHEDULED',
      startedAt: number === 1 ? new Date(CLOCK_TEST_NOW.getTime() - 61_000) : null,
      endedAt: null, pausedAt: null, pausedTotalMs: 0, createdAt: CLOCK_TEST_NOW, updatedAt: CLOCK_TEST_NOW,
    })) };
  });
  const audits: Prisma.V1OperationAuditCreateArgs['data'][] = [];
  const commands = new Map<string, Prisma.V1IdempotencyRecordCreateArgs['data']>();
  const effects: Array<{ requestId: unknown; body: unknown }> = [];
  const batchSizes: number[] = [];
  let transactions = 0;
  let locks = 0;
  let status: 'PENDING' | 'PROCESSING' | 'COMPLETED' = 'PENDING';
  const outbox: GameOperationClaim = {
    id: 'clock-outbox', businessKey: 'clock-failure-outbox-proof', aggregateType: 'GAME', aggregateId: 'clock-000',
    revisionId: null, type: 'GAME_RESULT_CHANGE_REQUESTED', payload: {}, attempts: 0, retryGeneration: 0,
    version: 0, leaseOwner: '', leaseUntil: new Date(CLOCK_TEST_NOW.getTime() + 30_000),
  };
  function row(id: unknown) {
    const found = rows.find((candidate) => candidate.id === id);
    if (!found) throw new Error(`Unknown clock fixture game: ${String(id)}`);
    return found;
  }
  const loaded = (stored: ClockRow) => ({
    ...stored, sourceType: 'TEAM_MATCH', periods: stored.periods.filter((period) => period.state === 'LIVE').map((period) => ({ ...period })),
    competitionConfig: { periods: [{ durationMinutes: 1, extraTime: false }, { durationMinutes: 1, extraTime: false }] },
    teamMatch: { id: `match-${stored.id}`, deletedAt: null, tournamentId: null, leagueId: null,
      fieldId: null, tournament: null, league: null, tournamentDetails: null },
  });
  const sqlText = (query: TemplateStringsArray | Prisma.Sql) => 'sql' in query ? query.sql : query.join('?');
  const queryRaw = async (query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => {
    const sql = sqlText(query);
    if (sql.includes('pg_try_advisory_xact_lock_shared')) return [{ acquired: options.cutover ?? true }];
    if (sql.includes('FROM v1_games') && sql.includes('FOR UPDATE')) {
      const stored = row(values[0]); locks += 1; await options.onLock?.(stored); return [{ id: stored.id }];
    }
    if (sql.includes('WITH candidate AS')) {
      if (!options.outbox || status !== 'PENDING') return [];
      if (typeof values[0] !== 'string') throw new Error('Outbox claim requires its actual lease owner');
      status = 'PROCESSING'; outbox.leaseOwner = values[0]; outbox.version += 1; outbox.attempts += 1;
      return [{ ...outbox }];
    }
    if (sql.includes('FROM v1_outbox_events') && sql.includes('FOR UPDATE')) {
      return status === 'PROCESSING' && values[0] === outbox.id && values[1] === outbox.leaseOwner && values[2] === outbox.version
        ? [{ id: outbox.id }] : [];
    }
    throw new Error(`Unsupported clock fixture SQL: ${sql}`);
  };
  const executeRaw = async (query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => {
    const sql = sqlText(query);
    if (sql.includes('INSERT INTO v1_operation_audits')) { effects.push({ requestId: values[3], body: values[4] }); return 1; }
    if (sql.includes("SET status = 'COMPLETED'")) {
      if (status !== 'PROCESSING' || values[0] !== outbox.id || values[1] !== outbox.leaseOwner || values[2] !== outbox.version) return 0;
      status = 'COMPLETED'; outbox.version += 1; return 1;
    }
    if (sql.includes('v1_outbox_events')) return 0;
    throw new Error(`Unsupported clock fixture SQL write: ${sql}`);
  };
  const delegates = {
    v1Game: {
      findMany: async ({ where, take }: Prisma.V1GameFindManyArgs) => {
        if (options.scanError) throw new Error('clock scan unavailable');
        const cursor = typeof where?.id === 'object' && typeof where.id.gt === 'string' ? where.id.gt : '';
        const result = rows.filter((candidate) => candidate.id > cursor && candidate.state === 'LIVE' &&
          candidate.periods.some((period) => period.state === 'LIVE' && period.startedAt !== null && period.pausedAt === null))
          .sort((a, b) => a.id.localeCompare(b.id)).slice(0, take ?? rows.length).map(loaded);
        batchSizes.push(result.length); return result;
      },
      findUnique: async ({ where }: Prisma.V1GameFindUniqueArgs) => loaded(row(where.id)),
      update: async ({ where, data }: Prisma.V1GameUpdateArgs) => {
        const stored = row(where.id);
        if (typeof data.state === 'string') stored.state = data.state;
        if (typeof data.version === 'number') stored.version = data.version;
        else if (data.version?.increment !== undefined) stored.version += data.version.increment;
        return loaded(stored);
      },
    },
    v1GamePeriod: {
      findFirst: async ({ where }: Prisma.V1GamePeriodFindFirstArgs) => row(where?.gameId).periods.find((period) =>
        (where?.state === undefined || where.state === period.state) && (where?.number === undefined || where.number === period.number)) ?? null,
      update: async ({ where, data }: Prisma.V1GamePeriodUpdateArgs) => {
        const period = rows.flatMap((stored) => stored.periods).find((candidate) => candidate.id === where.id);
        if (!period) throw new Error('Unknown clock fixture period');
        if (typeof data.state === 'string') period.state = data.state;
        if (data.endedAt instanceof Date || data.endedAt === null) period.endedAt = data.endedAt;
        return { ...period };
      },
    },
    v1IdempotencyRecord: {
      findUnique: async ({ where }: Prisma.V1IdempotencyRecordFindUniqueArgs) =>
        commands.get(where.actorUserId_action_resourceType_resourceId_idempotencyKey?.idempotencyKey ?? '') ?? null,
      create: async ({ data }: Prisma.V1IdempotencyRecordCreateArgs) => { commands.set(data.idempotencyKey, data); return data; },
    },
    v1OperationAudit: { create: async ({ data }: Prisma.V1OperationAuditCreateArgs) => {
      audits.push(data); return { id: `audit-${audits.length}` };
    } },
  };
  const prisma = new PrismaService();
  for (const [name, delegate] of Object.entries(delegates)) Object.defineProperty(prisma, name, { value: delegate });
  Object.defineProperties(prisma, {
    $queryRaw: { value: queryRaw }, $executeRaw: { value: executeRaw },
    $transaction: { value: async <T>(operation: (tx: PrismaService) => Promise<T>) => { transactions += 1; return operation(prisma); } },
  });
  const snapshot = () => structuredClone({ rows, audits, commands: [...commands.values()], effects, status, transactions, locks, batchSizes });
  return { prisma, rows, snapshot };
}
