import { WITHDRAWAL_FINALIZATION_REPORT_TYPE } from './withdrawal-finalization-report';
import { WITHDRAWAL_GRACE_ELAPSED_REASON, WithdrawalFinalizationService } from './withdrawal-finalization.service';
import { buildDeletedEmail, buildDeletedPhone, buildDeletedProviderUserKey } from './final-account-deletion';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-30T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const PAST_GRACE = 30 * DAY_MS + 60_000;
const INSIDE_GRACE = 30 * DAY_MS - 60 * 60_000;

type User = { id: string; accountStatus: string; email: string | null; phone: string | null; deletedAt: Date | null };
type Log = {
  id: string;
  targetType: string;
  targetId: string;
  fromStatus: string | null;
  toStatus: string;
  actorType: string;
  actorUserId: string | null;
  adminUserId: string | null;
  reason: string | null;
  createdAt: Date;
};
type Identity = { id: string; userId: string; provider: string; status: string; providerUserKey: string; passwordHash: string | null };
type Membership = { id: string; userId: string; teamId: string; role: string; status: string };
type Team = { id: string; name: string; ownerUserId: string; status: string; deletedAt: Date | null; memberCount: number };
type OutboxRow = { businessKey: string; type: string; aggregateId: string; payload: { finalizedCount: number; skipped: { userId: string; reason: string }[] } };

type State = {
  users: User[];
  logs: Log[];
  identities: Identity[];
  admins: { userId: string; status: string }[];
  memberships: Membership[];
  teams: Team[];
  outbox: OutboxRow[];
};

/**
 * A database that keeps the rows the job decides on and applies the `where`/`data` it is given, with
 * transactions that run one at a time (like the per-user row lock) and roll their changes back on a throw.
 */
function createDatabase(initial: Partial<State> = {}) {
  let state: State = { users: [], logs: [], identities: [], admins: [], memberships: [], teams: [], outbox: [], ...initial };
  let nextLogId = 1;
  const hooks: { afterScan?: () => void; failIdentityLookupFor?: string; failReport?: Error } = {};
  const cleanup = {
    pushSubscription: jest.fn().mockResolvedValue({ count: 1 }),
    pushDevice: jest.fn().mockResolvedValue({ count: 1 }),
    profile: jest.fn().mockResolvedValue({ count: 1 }),
  };
  let queue: Promise<unknown> = Promise.resolve();

  const latestLog = (userId: string) =>
    state.logs
      .filter((row) => row.targetType === 'user' && row.targetId === userId && row.toStatus === 'withdrawal_pending')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const userById = (id: string) => state.users.find((user) => user.id === id);

  const prisma = {
    v1User: {
      findMany: jest.fn(async ({ where }: { where: { accountStatus: string } }) =>
        state.users.filter((user) => user.accountStatus === where.accountStatus).map((user) => ({ id: user.id })),
      ),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const user = userById(where.id);
        return user ? { ...user } : null;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<User> }) => {
        const user = userById(where.id);
        if (!user) throw new Error('user not found');
        Object.assign(user, data);
        return { ...user };
      }),
    },
    v1StatusChangeLog: {
      groupBy: jest.fn(async ({ where }: { where: { targetId: { in: string[] } } }) => {
        const rows = where.targetId.in.flatMap((id) => {
          const row = latestLog(id);
          return row ? [{ targetId: id, _max: { createdAt: row.createdAt } }] : [];
        });
        hooks.afterScan?.();
        return rows;
      }),
      findFirst: jest.fn(async ({ where }: { where: { targetId: string } }) => {
        const row = latestLog(where.targetId);
        return row ? { createdAt: row.createdAt } : null;
      }),
      create: jest.fn(async ({ data }: { data: Omit<Log, 'id' | 'createdAt' | 'actorUserId' | 'adminUserId'> & Partial<Pick<Log, 'actorUserId' | 'adminUserId'>> }) => {
        const row: Log = { ...data, actorUserId: data.actorUserId ?? null, adminUserId: data.adminUserId ?? null, id: `log-${nextLogId++}`, createdAt: NOW };
        state.logs.push(row);
        return { id: row.id };
      }),
    },
    v1AdminUser: {
      findUnique: jest.fn(async ({ where }: { where: { userId: string } }) => state.admins.find((admin) => admin.userId === where.userId) ?? null),
    },
    v1Team: {
      findFirst: jest.fn(async ({ where }: { where: { ownerUserId: string } }) =>
        state.teams.find((team) => team.ownerUserId === where.ownerUserId && team.status === 'active' && team.deletedAt === null) ?? null,
      ),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: { memberCount?: { decrement: number } } }) => {
        const team = state.teams.find((row) => row.id === where.id);
        if (team && data.memberCount) team.memberCount -= data.memberCount.decrement;
        return team;
      }),
    },
    v1TeamMembership: {
      findFirst: jest.fn(async ({ where }: { where: { userId: string; role: { in: string[] } } }) => {
        const membership = state.memberships.find(
          (row) => row.userId === where.userId && row.status === 'active' && where.role.in.includes(row.role),
        );
        const team = membership && state.teams.find((row) => row.id === membership.teamId && row.status === 'active' && row.deletedAt === null);
        return membership && team ? { role: membership.role, team: { id: team.id, name: team.name } } : null;
      }),
      findMany: jest.fn(async ({ where }: { where: { userId: string } }) =>
        state.memberships.filter((row) => row.userId === where.userId && row.status === 'active'),
      ),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Membership> }) => {
        Object.assign(state.memberships.find((row) => row.id === where.id) ?? {}, data);
        return {};
      }),
    },
    v1TournamentPlayer: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    v1AuthIdentity: {
      findMany: jest.fn(async ({ where }: { where: { userId: string } }) => {
        if (hooks.failIdentityLookupFor === where.userId) throw new Error('identity lookup failed');
        return state.identities.filter((row) => row.userId === where.userId).map((row) => ({ id: row.id, provider: row.provider }));
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Identity> }) => {
        Object.assign(state.identities.find((row) => row.id === where.id) ?? {}, data);
        return {};
      }),
    },
    v1UserProfile: { updateMany: cleanup.profile },
    v1UserRecordConsent: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    v1PushSubscription: { deleteMany: cleanup.pushSubscription },
    v1PushDevice: { deleteMany: cleanup.pushDevice },
    v1ChatUserBlock: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    v1UserRegion: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    v1UserSportPreference: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    v1SearchHistory: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    v1VerificationToken: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    v1OutboxEvent: {
      createMany: jest.fn(async ({ data }: { data: (Omit<OutboxRow, 'payload'> & { payload: OutboxRow['payload'] })[] }) => {
        if (hooks.failReport) throw hooks.failReport;
        let count = 0;
        for (const row of data) {
          if (state.outbox.some((existing) => existing.businessKey === row.businessKey)) continue;
          state.outbox.push(structuredClone(row));
          count += 1;
        }
        return { count };
      }),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn(<T>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
      const run = queue.then(async () => {
        const snapshot = structuredClone(state);
        try {
          return await callback(prisma);
        } catch (error) {
          state = snapshot;
          throw error;
        }
      });
      queue = run.catch(() => undefined);
      return run;
    }),
  };

  return {
    prisma,
    hooks,
    cleanup,
    get state() {
      return state;
    },
    user: (id: string) => state.users.find((user) => user.id === id)!,
  };
}

function withdrawing(id: string, requestedAgoMs: number | null, overrides: Partial<User> = {}): Partial<State> {
  return {
    users: [{ id, accountStatus: 'withdrawal_pending', email: `${id}@example.test`, phone: `010-${id}`, deletedAt: null, ...overrides }],
    identities: [{ id: `identity-${id}`, userId: id, provider: 'email', status: 'active', providerUserKey: `${id}@example.test`, passwordHash: 'hash' }],
    logs:
      requestedAgoMs === null
        ? []
        : [
            {
              id: `request-${id}`,
              targetType: 'user',
              targetId: id,
              fromStatus: 'active',
              toStatus: 'withdrawal_pending',
              actorType: 'user',
              actorUserId: id,
              adminUserId: null,
              reason: null,
              createdAt: ago(requestedAgoMs),
            },
          ],
  };
}

function merge(...parts: Partial<State>[]): Partial<State> {
  const merged: State = { users: [], logs: [], identities: [], admins: [], memberships: [], teams: [], outbox: [] };
  for (const part of parts) {
    for (const key of Object.keys(merged) as (keyof State)[]) {
      (merged[key] as unknown[]).push(...((part[key] as unknown[] | undefined) ?? []));
    }
  }
  return merged;
}

function createService(db: ReturnType<typeof createDatabase>) {
  const logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };
  const service = new WithdrawalFinalizationService(db.prisma as never, logger as never);
  return { service, logger };
}

describe('WithdrawalFinalizationService', () => {
  describe('grace period', () => {
    it('keeps an account until the 30 days are over and destroys it once they are', async () => {
      const db = createDatabase(
        merge(withdrawing('inside', INSIDE_GRACE), withdrawing('past', PAST_GRACE), withdrawing('exact', 30 * DAY_MS)),
      );
      const { service } = createService(db);

      const result = await service.finalizeDue(NOW);

      expect(result.finalizedUserIds.sort()).toEqual(['exact', 'past']);
      expect(result.skipped).toEqual([]);
      expect(db.user('inside')).toMatchObject({ accountStatus: 'withdrawal_pending', email: 'inside@example.test', phone: '010-inside', deletedAt: null });
      expect(db.state.identities.find((row) => row.userId === 'inside')).toMatchObject({ status: 'active', passwordHash: 'hash' });
      for (const id of ['past', 'exact']) {
        expect(db.user(id)).toMatchObject({
          accountStatus: 'deleted',
          email: buildDeletedEmail(id),
          phone: buildDeletedPhone(id),
          deletedAt: NOW,
        });
      }
    });

    it('releases the phone number so another account can use it', async () => {
      const db = createDatabase(withdrawing('past', PAST_GRACE, { phone: '01012345678' }));
      const { service } = createService(db);

      await service.finalizeDue(NOW);

      expect(db.state.users.some((user) => user.phone === '01012345678')).toBe(false);
    });

    it('counts a re-filed request from the newer one', async () => {
      const refiled = withdrawing('refiled', PAST_GRACE);
      refiled.logs!.push({ ...refiled.logs![0], id: 'request-again', createdAt: ago(2 * DAY_MS) });
      const db = createDatabase(refiled);
      const { service } = createService(db);

      const result = await service.finalizeDue(NOW);

      expect(result.finalizedUserIds).toEqual([]);
      expect(db.user('refiled').accountStatus).toBe('withdrawal_pending');
    });
  });

  describe('what a finalized account goes through', () => {
    it('is deleted by the system with the grace reason, logins unlinked and personal data cleared', async () => {
      const db = createDatabase(withdrawing('past', PAST_GRACE));
      const { service } = createService(db);

      await service.finalizeDue(NOW);

      expect(db.state.identities[0]).toMatchObject({
        status: 'unlinked',
        providerUserKey: buildDeletedProviderUserKey('past', 'identity-past'),
        passwordHash: null,
      });
      expect(db.cleanup.profile).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'past' } }));
      expect(db.cleanup.pushDevice).toHaveBeenCalledWith({ where: { userId: 'past' } });
      expect(db.cleanup.pushSubscription).toHaveBeenCalledWith({ where: { userId: 'past' } });
      const statusLog = db.state.logs.find((row) => row.toStatus === 'deleted');
      expect(statusLog).toMatchObject({
        targetType: 'user',
        targetId: 'past',
        fromStatus: 'withdrawal_pending',
        actorType: 'system',
        adminUserId: null,
        reason: WITHDRAWAL_GRACE_ELAPSED_REASON,
      });
    });

    it('removes it from any team it is only a member of, recorded as the system', async () => {
      const db = createDatabase(
        merge(withdrawing('past', PAST_GRACE), {
          teams: [{ id: 't1', name: 'Team', ownerUserId: 'someone-else', status: 'active', deletedAt: null, memberCount: 5 }],
          memberships: [{ id: 'm1', userId: 'past', teamId: 't1', role: 'member', status: 'active' }],
        }),
      );
      const { service } = createService(db);

      await service.finalizeDue(NOW);

      expect(db.state.memberships[0]).toMatchObject({ status: 'removed', removedByUserId: null });
      expect(db.state.teams[0].memberCount).toBe(4);
      expect(db.state.logs.find((row) => row.targetType === 'team_membership')).toMatchObject({
        actorType: 'system',
        actorUserId: null,
        reason: WITHDRAWAL_GRACE_ELAPSED_REASON,
      });
    });
  });

  describe('accounts that need a person', () => {
    it('leaves each of them alone, says why, and still finalizes the others', async () => {
      const db = createDatabase(
        merge(
          withdrawing('admin', PAST_GRACE),
          withdrawing('manager', PAST_GRACE),
          withdrawing('owner', PAST_GRACE),
          withdrawing('nolog', null),
          withdrawing('fine', PAST_GRACE),
          {
            admins: [{ userId: 'admin', status: 'active' }],
            teams: [
              { id: 't1', name: 'Team One', ownerUserId: 'someone-else', status: 'active', deletedAt: null, memberCount: 3 },
              { id: 't2', name: 'Team Two', ownerUserId: 'owner', status: 'active', deletedAt: null, memberCount: 3 },
            ],
            memberships: [{ id: 'm1', userId: 'manager', teamId: 't1', role: 'manager', status: 'active' }],
          },
        ),
      );
      const { service } = createService(db);

      const result = await service.finalizeDue(NOW);

      expect(result.finalizedUserIds).toEqual(['fine']);
      expect([...result.skipped].sort((a, b) => a.userId.localeCompare(b.userId))).toEqual([
        { userId: 'admin', reason: 'active_admin' },
        { userId: 'manager', reason: 'team_authority' },
        { userId: 'nolog', reason: 'no_request_log' },
        { userId: 'owner', reason: 'team_authority' },
      ]);
      for (const id of ['admin', 'manager', 'owner', 'nolog']) {
        expect(db.user(id)).toMatchObject({ accountStatus: 'withdrawal_pending', email: `${id}@example.test`, deletedAt: null });
      }
      expect(db.state.memberships[0].status).toBe('active');
    });

    it('does not count an admin record that has been revoked', async () => {
      const db = createDatabase(merge(withdrawing('former', PAST_GRACE), { admins: [{ userId: 'former', status: 'revoked' }] }));
      const { service } = createService(db);

      const result = await service.finalizeDue(NOW);

      expect(result.finalizedUserIds).toEqual(['former']);
    });

    it('logs a failure with its error, reports that account, rolls it back and moves on', async () => {
      const db = createDatabase(merge(withdrawing('broken', PAST_GRACE), withdrawing('fine', PAST_GRACE)));
      db.hooks.failIdentityLookupFor = 'broken';
      const { service, logger } = createService(db);

      const result = await service.finalizeDue(NOW);

      expect(result.finalizedUserIds).toEqual(['fine']);
      expect(result.skipped).toEqual([{ userId: 'broken', reason: 'finalization_failed' }]);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.objectContaining({ message: 'identity lookup failed' }), userId: 'broken' }),
        expect.any(String),
      );
      // The user row had already been updated when the lookup threw; the rollback must undo it.
      expect(db.user('broken')).toMatchObject({ accountStatus: 'withdrawal_pending', email: 'broken@example.test', deletedAt: null });
    });
  });

  describe('changes of mind and other actors during a run', () => {
    it('does not delete an account that was restored between the scan and the lock', async () => {
      const db = createDatabase(withdrawing('restored', PAST_GRACE));
      db.hooks.afterScan = () => {
        db.user('restored').accountStatus = 'active';
      };
      const { service } = createService(db);

      const result = await service.finalizeDue(NOW);

      expect(result).toEqual({ finalizedUserIds: [], skipped: [] });
      expect(db.user('restored')).toMatchObject({ accountStatus: 'active', email: 'restored@example.test', deletedAt: null });
      expect(db.cleanup.profile).not.toHaveBeenCalled();
    });

    it('does not delete an account that filed a fresh request between the scan and the lock', async () => {
      const db = createDatabase(withdrawing('again', PAST_GRACE));
      db.hooks.afterScan = () => {
        db.state.logs.push({ ...db.state.logs[0], id: 'request-again', createdAt: ago(60_000) });
      };
      const { service } = createService(db);

      const result = await service.finalizeDue(NOW);

      expect(result).toEqual({ finalizedUserIds: [], skipped: [] });
      expect(db.user('again').accountStatus).toBe('withdrawal_pending');
    });

    it('leaves an account an operator deleted in the meantime alone, and counts nothing for it', async () => {
      const db = createDatabase(withdrawing('taken', PAST_GRACE));
      db.hooks.afterScan = () => {
        Object.assign(db.user('taken'), { accountStatus: 'deleted', email: buildDeletedEmail('taken'), deletedAt: ago(1_000) });
      };
      const { service } = createService(db);

      const result = await service.finalizeDue(NOW);

      expect(result).toEqual({ finalizedUserIds: [], skipped: [] });
      expect(db.user('taken').deletedAt).toEqual(ago(1_000));
      expect(db.cleanup.profile).not.toHaveBeenCalled();
    });

    it('is idempotent: a second run finds nothing left to do', async () => {
      const db = createDatabase(withdrawing('past', PAST_GRACE));
      const { service } = createService(db);

      await service.finalizeDue(NOW);
      const second = await service.finalizeDue(new Date(NOW.getTime() + 60 * 60_000));

      expect(second).toEqual({ finalizedUserIds: [], skipped: [] });
      expect(db.cleanup.profile).toHaveBeenCalledTimes(1);
      expect(db.state.logs.filter((row) => row.toStatus === 'deleted')).toHaveLength(1);
    });

    it('lets two instances race over the same accounts: each is deleted once and counted once', async () => {
      const db = createDatabase(merge(withdrawing('a', PAST_GRACE), withdrawing('b', PAST_GRACE)));
      const first = createService(db).service;
      const second = createService(db).service;

      const [one, two] = await Promise.all([first.finalizeDue(NOW), second.finalizeDue(NOW)]);

      expect([...one.finalizedUserIds, ...two.finalizedUserIds].sort()).toEqual(['a', 'b']);
      expect(db.cleanup.profile).toHaveBeenCalledTimes(2);
      expect(db.state.logs.filter((row) => row.toStatus === 'deleted')).toHaveLength(2);
      // However the two runs split the work, the reports add up to the two deletions.
      expect(db.state.outbox.reduce((sum, row) => sum + row.payload.finalizedCount, 0)).toBe(2);
    });
  });

  describe('report', () => {
    it('says nothing when the run found nothing to do', async () => {
      const db = createDatabase(withdrawing('inside', INSIDE_GRACE));
      const { service } = createService(db);

      await service.finalizeDue(NOW);

      expect(db.state.outbox).toEqual([]);
    });

    it('queues one report with the counts and the ids that need a person, and no personal data', async () => {
      const db = createDatabase(merge(withdrawing('fine', PAST_GRACE), withdrawing('nolog', null)));
      const { service } = createService(db);

      await service.finalizeDue(NOW);

      expect(db.state.outbox).toHaveLength(1);
      const [report] = db.state.outbox;
      expect(report).toMatchObject({
        type: WITHDRAWAL_FINALIZATION_REPORT_TYPE,
        aggregateId: NOW.toISOString(),
        payload: { finalizedCount: 1, skipped: [{ userId: 'nolog', reason: 'no_request_log' }] },
      });
      expect(JSON.stringify(report)).not.toMatch(/example\.test|010-/);
    });

    it('repeats an unchanged list of accounts that need a person once a day, not on every hourly run', async () => {
      const db = createDatabase(withdrawing('nolog', null));
      const { service } = createService(db);

      await service.finalizeDue(NOW);
      await service.finalizeDue(new Date(NOW.getTime() + 60 * 60_000));
      expect(db.state.outbox).toHaveLength(1);

      await service.finalizeDue(new Date(NOW.getTime() + DAY_MS));
      expect(db.state.outbox).toHaveLength(2);
    });

    it('logs a report that could not be queued without undoing or failing the deletions', async () => {
      const db = createDatabase(withdrawing('past', PAST_GRACE));
      db.hooks.failReport = new Error('outbox unavailable');
      const { service, logger } = createService(db);

      const result = await service.finalizeDue(NOW);

      expect(result.finalizedUserIds).toEqual(['past']);
      expect(db.user('past').accountStatus).toBe('deleted');
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.objectContaining({ message: 'outbox unavailable' }) }),
        expect.any(String),
      );
    });
  });

  describe('schedule', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('runs once at start, then hourly, until the module is destroyed', async () => {
      const db = createDatabase();
      const { service } = createService(db);
      const run = jest.spyOn(service, 'finalizeDue').mockResolvedValue({ finalizedUserIds: [], skipped: [] });

      service.onModuleInit();
      await jest.advanceTimersByTimeAsync(0);
      expect(run).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(60 * 60_000);
      expect(run).toHaveBeenCalledTimes(2);

      service.onModuleDestroy();
      await jest.advanceTimersByTimeAsync(3 * 60 * 60_000);
      expect(run).toHaveBeenCalledTimes(2);
    });

    it('logs a failed run instead of letting it escape', async () => {
      const db = createDatabase();
      const { service, logger } = createService(db);
      jest.spyOn(service, 'finalizeDue').mockRejectedValue(new Error('database down'));

      service.onModuleInit();
      await jest.advanceTimersByTimeAsync(0);
      service.onModuleDestroy();

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.objectContaining({ message: 'database down' }) }),
        expect.any(String),
      );
    });
  });
});
