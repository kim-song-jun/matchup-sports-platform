import { Prisma } from '@prisma/client';

/**
 * Stateful in-memory stand-in for the Prisma delegates the login-hardening services use. It implements
 * the where/data operators those services rely on (equality, gt/gte/lt/lte, increment) so unit specs
 * exercise real window, cap and attempt arithmetic instead of asserting call arguments. The real SQL
 * (the spray aggregate, the advisory lock, unique outbox keys) is covered by the integration spec.
 */
type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

function toComparable(value: unknown): unknown {
  return value instanceof Date ? value.getTime() : value;
}

function operatorMatches(actual: unknown, operator: string, expected: unknown): boolean {
  const a = toComparable(actual);
  const b = toComparable(expected);
  if (operator === 'not') return a !== b;
  if (a === null || a === undefined) return false;
  switch (operator) {
    case 'gt': return (a as number) > (b as number);
    case 'gte': return (a as number) >= (b as number);
    case 'lt': return (a as number) < (b as number);
    case 'lte': return (a as number) <= (b as number);
    default: throw new Error(`fake prisma: unsupported operator ${operator}`);
  }
}

function matches(row: Row, where: Where = {}): boolean {
  return Object.entries(where).every(([field, condition]) => {
    const actual = row[field];
    if (condition !== null && typeof condition === 'object' && !(condition instanceof Date)) {
      return Object.entries(condition as Record<string, unknown>).every(([op, expected]) =>
        operatorMatches(actual, op, expected),
      );
    }
    return toComparable(actual) === toComparable(condition);
  });
}

function applyData(row: Row, data: Record<string, unknown>): void {
  for (const [field, value] of Object.entries(data)) {
    if (value !== null && typeof value === 'object' && !(value instanceof Date) && 'increment' in value) {
      row[field] = (row[field] as number) + (value as { increment: number }).increment;
    } else {
      row[field] = value;
    }
  }
}

function sortedBy(rows: Row[], orderBy?: Record<string, 'asc' | 'desc'>): Row[] {
  if (!orderBy) return rows;
  const [[field, direction]] = Object.entries(orderBy);
  return [...rows].sort((x, y) => {
    const delta = (toComparable(x[field]) as number) - (toComparable(y[field]) as number);
    return direction === 'desc' ? -delta : delta;
  });
}

function notFound(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Record to update not found.', {
    code: 'P2025',
    clientVersion: 'test',
  });
}

function delegate(rows: Row[], defaults: () => Row) {
  let sequence = 0;
  return {
    create: jest.fn(async ({ data }: { data: Row }) => {
      const row = { id: `row-${rows.length + 1}-${(sequence += 1)}`, ...defaults(), ...data };
      rows.push(row);
      return { ...row };
    }),
    findFirst: jest.fn(async ({ where, orderBy }: { where?: Where; orderBy?: Record<string, 'asc' | 'desc'> } = {}) => {
      const found = sortedBy(rows.filter((row) => matches(row, where)), orderBy)[0];
      return found ? { ...found } : null;
    }),
    findUnique: jest.fn(async ({ where }: { where: Where }) => {
      const found = rows.find((row) => matches(row, where));
      return found ? { ...found } : null;
    }),
    count: jest.fn(async ({ where }: { where?: Where } = {}) => rows.filter((row) => matches(row, where)).length),
    update: jest.fn(async ({ where, data }: { where: Where; data: Row }) => {
      const found = rows.find((row) => matches(row, where));
      if (!found) throw notFound();
      applyData(found, data);
      return { ...found };
    }),
    updateMany: jest.fn(async ({ where, data }: { where?: Where; data: Row }) => {
      const found = rows.filter((row) => matches(row, where));
      found.forEach((row) => applyData(row, data));
      return { count: found.length };
    }),
    deleteMany: jest.fn(async ({ where }: { where?: Where } = {}) => {
      const keep = rows.filter((row) => !matches(row, where));
      const count = rows.length - keep.length;
      rows.splice(0, rows.length, ...keep);
      return { count };
    }),
  };
}

export interface LoginSecurityFakeState {
  attempts: Row[];
  challenges: Row[];
  anomalies: Row[];
  outbox: Row[];
  identities: Row[];
}

/** `identities` rows are `{ id, userId, provider, providerUserKey, passwordHash, status, user }`. */
export function createLoginSecurityFakePrisma() {
  const state: LoginSecurityFakeState = { attempts: [], challenges: [], anomalies: [], outbox: [], identities: [] };

  const challengeDelegate = delegate(state.challenges, () => ({
    attemptCount: 0,
    sentCount: 0,
    sendFailedAt: null,
    usedAt: null,
    userId: null,
    createdAt: new Date(),
  }));
  const outboxDelegate = delegate(state.outbox, () => ({ status: 'PENDING', createdAt: new Date() }));

  const prisma = {
    v1LoginAttempt: delegate(state.attempts, () => ({ ipKey: null, createdAt: new Date() })),
    v1LoginStepUpChallenge: {
      ...challengeDelegate,
      aggregate: jest.fn(async ({ where }: { where?: Where }) => ({
        _sum: {
          sentCount: state.challenges
            .filter((row) => matches(row, where))
            .reduce((sum, row) => sum + (row.sentCount as number), 0),
        },
      })),
    },
    v1SecurityAnomaly: delegate(state.anomalies, () => ({ startedAt: new Date(), lastDetectedAt: new Date() })),
    v1OutboxEvent: {
      ...outboxDelegate,
      create: jest.fn(async ({ data }: { data: Row }) => {
        if (state.outbox.some((row) => row.businessKey === data.businessKey)) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed on business_key', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        return outboxDelegate.create({ data });
      }),
      createMany: jest.fn(async ({ data, skipDuplicates }: { data: Row[]; skipDuplicates?: boolean }) => {
        let count = 0;
        for (const row of data) {
          if (skipDuplicates && state.outbox.some((existing) => existing.businessKey === row.businessKey)) continue;
          await outboxDelegate.create({ data: row });
          count += 1;
        }
        return { count };
      }),
    },
    v1AuthIdentity: {
      findUnique: jest.fn(async ({ where }: { where: { provider_providerUserKey: { provider: string; providerUserKey: string } } }) => {
        const key = where.provider_providerUserKey;
        const found = state.identities.find(
          (row) => row.provider === key.provider && row.providerUserKey === key.providerUserKey,
        );
        return found ?? null;
      }),
      findFirst: jest.fn(async ({ where }: { where: Where }) => state.identities.find((row) => matches(row, where)) ?? null),
      update: jest.fn(async () => ({})),
    },
    v1User: { update: jest.fn(async () => ({})) },
    /** The spray aggregate: mirrors `WHERE result = 'failed' AND created_at > $since`. */
    $queryRaw: jest.fn(async (sql: { values: unknown[] }) => {
      const since = (sql.values[0] as Date).getTime();
      const failed = state.attempts.filter((row) => row.result === 'failed' && (row.createdAt as Date).getTime() > since);
      return [
        {
          failed: failed.length,
          accounts: new Set(failed.map((row) => row.emailKey)).size,
          ips: new Set(failed.map((row) => row.ipKey).filter((key) => key !== null)).size,
        },
      ];
    }),
    $executeRaw: jest.fn(async () => 1),
    $transaction: jest.fn(
      async (arg: unknown): Promise<unknown> =>
        typeof arg === 'function' ? (arg as (tx: unknown) => Promise<unknown>)(prisma) : Promise.all(arg as Promise<unknown>[]),
    ),
  };

  return { prisma, state };
}
