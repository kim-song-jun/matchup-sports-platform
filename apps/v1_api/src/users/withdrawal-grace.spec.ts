import { findPhoneRegistration } from '../verification/phone-registered';
import {
  WITHDRAWAL_GRACE_DAYS,
  findWithdrawalRequestedAt,
  findWithdrawalRequestedAtByUser,
  isWithdrawalGraceElapsed,
  withdrawalGraceEndsAt,
  withdrawalPendingUntil,
} from './withdrawal-grace';

type StatusLog = { id: string; targetType: string; targetId: string; toStatus: string; createdAt: Date };

/** Status-log store that answers `findFirst` / `groupBy` by actually applying the `where` it is given. */
function statusLogStore(rows: StatusLog[]) {
  const matches = (where: { targetType?: string; toStatus?: string; targetId?: string | { in: string[] } }) =>
    rows.filter(
      (row) =>
        (where.targetType === undefined || row.targetType === where.targetType) &&
        (where.toStatus === undefined || row.toStatus === where.toStatus) &&
        (where.targetId === undefined ||
          (typeof where.targetId === 'string' ? row.targetId === where.targetId : where.targetId.in.includes(row.targetId))),
    );
  return {
    v1StatusChangeLog: {
      findFirst: jest.fn(async ({ where }: { where: Parameters<typeof matches>[0] }) => {
        const found = matches(where).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
        return found[0] ? { createdAt: found[0].createdAt } : null;
      }),
      groupBy: jest.fn(async ({ where }: { where: Parameters<typeof matches>[0] }) => {
        const latest = new Map<string, Date>();
        for (const row of matches(where)) {
          const current = latest.get(row.targetId);
          if (!current || row.createdAt > current) latest.set(row.targetId, row.createdAt);
        }
        return [...latest].map(([targetId, createdAt]) => ({ targetId, _max: { createdAt } }));
      }),
    },
  };
}

const log = (id: string, targetId: string, createdAt: string, overrides: Partial<StatusLog> = {}): StatusLog => ({
  id,
  targetType: 'user',
  targetId,
  toStatus: 'withdrawal_pending',
  createdAt: new Date(createdAt),
  ...overrides,
});

describe('withdrawal grace period', () => {
  it('lasts 30 days from the request', () => {
    expect(WITHDRAWAL_GRACE_DAYS).toBe(30);
    expect(withdrawalGraceEndsAt(new Date('2026-10-01T09:30:00.000Z')).toISOString()).toBe('2026-10-31T09:30:00.000Z');
  });

  it('is over at the instant it ends and not a moment before', () => {
    const requestedAt = new Date('2026-10-01T00:00:00.000Z');
    const end = withdrawalGraceEndsAt(requestedAt).getTime();

    expect(isWithdrawalGraceElapsed(requestedAt, new Date(end - 1))).toBe(false);
    expect(isWithdrawalGraceElapsed(requestedAt, new Date('2026-10-30T23:00:00.000Z'))).toBe(false);
    expect(isWithdrawalGraceElapsed(requestedAt, new Date(end))).toBe(true);
    expect(isWithdrawalGraceElapsed(requestedAt, new Date(end + 1))).toBe(true);
  });
});

describe('findWithdrawalRequestedAt', () => {
  it('reads the latest request, so a cancelled and re-filed withdrawal counts from the new one', async () => {
    const db = statusLogStore([
      log('a', 'u1', '2026-08-01T00:00:00.000Z'),
      log('b', 'u1', '2026-09-15T00:00:00.000Z'),
      log('c', 'u1', '2026-08-20T00:00:00.000Z'),
    ]);

    await expect(findWithdrawalRequestedAt(db as never, 'u1')).resolves.toEqual(new Date('2026-09-15T00:00:00.000Z'));
  });

  it('ignores other accounts, other targets and other transitions', async () => {
    const db = statusLogStore([
      log('a', 'u2', '2026-09-01T00:00:00.000Z'),
      log('b', 'u1', '2026-09-02T00:00:00.000Z', { toStatus: 'active' }),
      log('c', 'u1', '2026-09-03T00:00:00.000Z', { targetType: 'team' }),
    ]);

    await expect(findWithdrawalRequestedAt(db as never, 'u1')).resolves.toBeNull();
  });

  it('answers many accounts in one query, leaving out those without a request log', async () => {
    const db = statusLogStore([
      log('a', 'u1', '2026-08-01T00:00:00.000Z'),
      log('b', 'u1', '2026-09-15T00:00:00.000Z'),
      log('c', 'u2', '2026-07-01T00:00:00.000Z'),
      log('d', 'u4', '2026-07-01T00:00:00.000Z', { toStatus: 'active' }),
    ]);

    const requestedAt = await findWithdrawalRequestedAtByUser(db as never, ['u1', 'u2', 'u3', 'u4']);

    expect(Object.fromEntries(requestedAt)).toEqual({
      u1: new Date('2026-09-15T00:00:00.000Z'),
      u2: new Date('2026-07-01T00:00:00.000Z'),
    });
    expect(db.v1StatusChangeLog.groupBy).toHaveBeenCalledTimes(1);
  });

  it('does not query for an empty list', async () => {
    const db = statusLogStore([]);

    expect((await findWithdrawalRequestedAtByUser(db as never, [])).size).toBe(0);
    expect(db.v1StatusChangeLog.groupBy).not.toHaveBeenCalled();
  });
});

describe('withdrawalPendingUntil', () => {
  const db = () => statusLogStore([log('a', 'u1', '2026-10-01T00:00:00.000Z')]);

  it('gives the end of the grace period for a withdrawal', async () => {
    await expect(withdrawalPendingUntil(db() as never, { id: 'u1', accountStatus: 'withdrawal_pending' })).resolves.toBe(
      '2026-10-31T00:00:00.000Z',
    );
  });

  it('is null, without reading any log, for an account that is not withdrawing', async () => {
    const store = db();

    await expect(withdrawalPendingUntil(store as never, { id: 'u1', accountStatus: 'active' })).resolves.toBeNull();
    expect(store.v1StatusChangeLog.findFirst).not.toHaveBeenCalled();
  });

  it('is null for a withdrawal that has no request log', async () => {
    await expect(withdrawalPendingUntil(db() as never, { id: 'u9', accountStatus: 'withdrawal_pending' })).resolves.toBeNull();
  });
});

describe('findPhoneRegistration', () => {
  function database(holder: { id: string; accountStatus: string } | null) {
    return {
      ...statusLogStore([log('a', 'u1', '2026-10-01T00:00:00.000Z')]),
      v1User: {
        findUnique: jest.fn(async ({ where }: { where: { phone: string } }) => (where.phone === '01012345678' ? holder : null)),
      },
    };
  }

  it('reports a free number', async () => {
    await expect(findPhoneRegistration(database({ id: 'u1', accountStatus: 'active' }) as never, '01099998888')).resolves.toEqual({
      registered: false,
      withdrawalPendingUntil: null,
    });
  });

  it('reports a number held by an active account without a grace end', async () => {
    await expect(findPhoneRegistration(database({ id: 'u1', accountStatus: 'active' }) as never, '01012345678')).resolves.toEqual({
      registered: true,
      withdrawalPendingUntil: null,
    });
  });

  it('reports when a withdrawing account that holds the number is destroyed', async () => {
    await expect(
      findPhoneRegistration(database({ id: 'u1', accountStatus: 'withdrawal_pending' }) as never, '01012345678'),
    ).resolves.toEqual({ registered: true, withdrawalPendingUntil: '2026-10-31T00:00:00.000Z' });
  });
});
