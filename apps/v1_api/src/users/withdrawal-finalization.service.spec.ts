import { WITHDRAWAL_FINALIZATION_REPORT_TYPE } from './withdrawal-finalization-report';
import { MAX_FINALIZATIONS_PER_RUN } from './withdrawal-grace';
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
type OutboxRow = {
  businessKey: string;
  type: string;
  aggregateId: string;
  payload: { finalizedCount: number; skipped: { userId: string; reason: string }[]; remainingDue: number };
};
type Onboarding = { userId: string; draftJson: unknown };
type StatusCondition = string | { not: string };
const statusMatches = (actual: string, condition: StatusCondition) =>
  typeof condition === 'string' ? actual === condition : actual !== condition.not;

type State = {
  users: User[];
  logs: Log[];
  identities: Identity[];
  admins: { userId: string; status: string }[];
  memberships: Membership[];
  teams: Team[];
  outbox: OutboxRow[];
  onboarding: Onboarding[];
};

/**
 * A database that keeps the rows the job decides on and applies the `where`/`data` it is given, with
 * transactions that run one at a time (like the per-user row lock) and roll their changes back on a throw.
 */
function createDatabase(initial: Partial<State> = {}) {
  let state: State = { users: [], logs: [], identities: [], admins: [], memberships: [], teams: [], outbox: [], onboarding: [], ...initial };
  let nextLogId = 1;
  const hooks: { afterScan?: () => void; onIdentityLookup?: (userId: string) => void; failIdentityLookupFor?: string; failReport?: Error } = {};
  const cleanup = {
    pushSubscription: jest.fn().mockResolvedValue({ count: 1 }),
    pushDevice: jest.fn().mockResolvedValue({ count: 1 }),
    profile: jest.fn().mockResolvedValue({ count: 1 }),
  };
  let queue: Promise<unknown> = Promise.resolve();

  const latestLog = (userId: string, where: { targetType: string; toStatus: string }) =>
    state.logs
      .filter((row) => row.targetType === where.targetType && row.targetId === userId && row.toStatus === where.toStatus)
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
      groupBy: jest.fn(async ({ where }: { where: { targetType: string; toStatus: string; targetId: { in: string[] } } }) => {
        const rows = where.targetId.in.flatMap((id) => {
          const row = latestLog(id, where);
          return row ? [{ targetId: id, _max: { createdAt: row.createdAt } }] : [];
        });
        hooks.afterScan?.();
        return rows;
      }),
      findFirst: jest.fn(async ({ where }: { where: { targetType: string; toStatus: string; targetId: string } }) => {
        const row = latestLog(where.targetId, where);
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
      findFirst: jest.fn(async ({ where }: { where: { ownerUserId: string; status: StatusCondition; deletedAt: null } }) =>
        state.teams.find(
          (team) => team.ownerUserId === where.ownerUserId && statusMatches(team.status, where.status) && team.deletedAt === where.deletedAt,
        ) ?? null,
      ),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: { memberCount?: { decrement: number } } }) => {
        const team = state.teams.find((row) => row.id === where.id);
        if (team && data.memberCount) team.memberCount -= data.memberCount.decrement;
        return team;
      }),
    },
    v1TeamMembership: {
      findFirst: jest.fn(
        async ({ where }: { where: { userId: string; role: { in: string[] }; team: { status: StatusCondition; deletedAt: null } } }) => {
          const found = state.memberships.flatMap((row) => {
            const team = state.teams.find((candidate) => candidate.id === row.teamId);
            const matches =
              row.userId === where.userId &&
              row.status === 'active' &&
              where.role.in.includes(row.role) &&
              team &&
              statusMatches(team.status, where.team.status) &&
              team.deletedAt === where.team.deletedAt;
            return matches ? [{ id: row.id, role: row.role, team: { id: team.id, name: team.name } }] : [];
          });
          return found[0] ?? null;
        },
      ),
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
        hooks.onIdentityLookup?.(where.userId);
        if (hooks.failIdentityLookupFor === where.userId) throw new Error('identity lookup failed');
        return state.identities.filter((row) => row.userId === where.userId).map((row) => ({ id: row.id, provider: row.provider }));
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Identity> }) => {
        Object.assign(state.identities.find((row) => row.id === where.id) ?? {}, data);
        return {};
      }),
    },
    v1UserProfile: { updateMany: cleanup.profile },
    v1UserOnboardingProgress: {
      updateMany: jest.fn(async ({ where, data }: { where: { userId: string }; data: { draftJson: unknown } }) => {
        const rows = state.onboarding.filter((row) => row.userId === where.userId);
        for (const row of rows) row.draftJson = data.draftJson;
        return { count: rows.length };
      }),
    },
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
    onboarding: [{ userId: id, draftJson: { kakaoName: `${id}-name`, kakaoPhone: '01011112222', appleName: `${id}-apple` } }],
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
  const merged: State = { users: [], logs: [], identities: [], admins: [], memberships: [], teams: [], outbox: [], onboarding: [] };
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
      expect(db.state.onboarding.find((row) => row.userId === 'inside')?.draftJson).toMatchObject({ kakaoName: 'inside-name' });
      expect(db.state.onboarding.find((row) => row.userId === 'past')?.draftJson).toEqual({});
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

    it('counts a request cancelled and re-filed from the latest one', async () => {
      const refiled = withdrawing('refiled', 40 * DAY_MS);
      const [first] = refiled.logs!;
      refiled.logs!.push(
        { ...first, id: 'cancelled', fromStatus: 'withdrawal_pending', toStatus: 'active', createdAt: ago(35 * DAY_MS) },
        { ...first, id: 'request-again', createdAt: ago(2 * DAY_MS) },
      );
      const db = createDatabase(refiled);
      const { service } = createService(db);

      const result = await service.finalizeDue(NOW);

      expect(result.finalizedUserIds).toEqual([]);
      expect(db.user('refiled').accountStatus).toBe('withdrawal_pending');

      const later = await service.finalizeDue(new Date(NOW.getTime() + 29 * DAY_MS));
      expect(later.finalizedUserIds).toEqual(['refiled']);
    });

    it('ignores a withdrawal_pending log written for something other than the user', async () => {
      const lookalike = (id: string, createdAt: Date) => ({
        id,
        targetType: 'team_membership',
        targetId: 'wrong-target',
        fromStatus: 'active',
        toStatus: 'withdrawal_pending',
        actorType: 'system',
        actorUserId: null,
        adminUserId: null,
        reason: null,
        createdAt,
      });
      const onlyLookalike = withdrawing('lookalike-only', null);
      onlyLookalike.logs!.push({ ...lookalike('l1', ago(PAST_GRACE)), targetId: 'lookalike-only' });
      const recentLookalike = withdrawing('lookalike-recent', PAST_GRACE);
      recentLookalike.logs!.push({ ...lookalike('l2', ago(DAY_MS)), targetId: 'lookalike-recent' });
      const db = createDatabase(merge(onlyLookalike, recentLookalike));
      const { service } = createService(db);

      const result = await service.finalizeDue(NOW);

      // The first has no request of its own; the second's real request is old enough and the stray log is not a restart.
      expect(result.skipped).toEqual([{ userId: 'lookalike-only', reason: 'no_request_log' }]);
      expect(result.finalizedUserIds).toEqual(['lookalike-recent']);
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
      expect(db.state.onboarding[0].draftJson).toEqual({});
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

    it('counts a suspended team, but not an archived or deleted one, as authority that needs a person', async () => {
      const team = (id: string, ownerUserId: string, status: string, deletedAt: Date | null = null) => ({
        id,
        name: id,
        ownerUserId,
        status,
        deletedAt,
        memberCount: 3,
      });
      const db = createDatabase(
        merge(
          withdrawing('suspended-owner', PAST_GRACE),
          withdrawing('suspended-manager', PAST_GRACE),
          withdrawing('archived-owner', PAST_GRACE),
          withdrawing('deleted-owner', PAST_GRACE),
          {
            teams: [
              team('t-suspended', 'suspended-owner', 'suspended'),
              team('t-other-suspended', 'someone-else', 'suspended'),
              team('t-archived', 'archived-owner', 'archived'),
              team('t-deleted', 'deleted-owner', 'active', ago(DAY_MS)),
            ],
            memberships: [{ id: 'm1', userId: 'suspended-manager', teamId: 't-other-suspended', role: 'manager', status: 'active' }],
          },
        ),
      );
      const { service } = createService(db);

      const result = await service.finalizeDue(NOW);

      expect([...result.skipped].sort((a, b) => a.userId.localeCompare(b.userId))).toEqual([
        { userId: 'suspended-manager', reason: 'team_authority' },
        { userId: 'suspended-owner', reason: 'team_authority' },
      ]);
      expect(result.finalizedUserIds.sort()).toEqual(['archived-owner', 'deleted-owner']);
      for (const id of ['suspended-owner', 'suspended-manager']) {
        expect(db.user(id)).toMatchObject({ accountStatus: 'withdrawal_pending', deletedAt: null });
      }
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

      expect(result).toEqual({ finalizedUserIds: [], skipped: [], remainingDue: 0 });
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

      expect(result).toEqual({ finalizedUserIds: [], skipped: [], remainingDue: 0 });
      expect(db.user('again').accountStatus).toBe('withdrawal_pending');
    });

    it('leaves an account an operator deleted in the meantime alone, and counts nothing for it', async () => {
      const db = createDatabase(withdrawing('taken', PAST_GRACE));
      db.hooks.afterScan = () => {
        Object.assign(db.user('taken'), { accountStatus: 'deleted', email: buildDeletedEmail('taken'), deletedAt: ago(1_000) });
      };
      const { service } = createService(db);

      const result = await service.finalizeDue(NOW);

      expect(result).toEqual({ finalizedUserIds: [], skipped: [], remainingDue: 0 });
      expect(db.user('taken').deletedAt).toEqual(ago(1_000));
      expect(db.cleanup.profile).not.toHaveBeenCalled();
    });

    it('is idempotent: a second run finds nothing left to do', async () => {
      const db = createDatabase(withdrawing('past', PAST_GRACE));
      const { service } = createService(db);

      await service.finalizeDue(NOW);
      const second = await service.finalizeDue(new Date(NOW.getTime() + 60 * 60_000));

      expect(second).toEqual({ finalizedUserIds: [], skipped: [], remainingDue: 0 });
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

  describe('deletion cap', () => {
    const due = (count: number, from = 1) =>
      merge(...Array.from({ length: count }, (_, index) => withdrawing(`u${String(from + index).padStart(2, '0')}`, PAST_GRACE)));

    it('destroys at most the cap per run, leaves the rest untouched, and carries them to the next hour', async () => {
      expect(MAX_FINALIZATIONS_PER_RUN).toBe(20);
      const db = createDatabase(due(MAX_FINALIZATIONS_PER_RUN + 1));
      const { service } = createService(db);

      const first = await service.finalizeDue(NOW);

      expect(first.finalizedUserIds).toHaveLength(MAX_FINALIZATIONS_PER_RUN);
      expect(first.remainingDue).toBe(1);
      expect(first.skipped).toEqual([]);
      const last = `u${MAX_FINALIZATIONS_PER_RUN + 1}`;
      expect(db.user(last)).toMatchObject({ accountStatus: 'withdrawal_pending', email: `${last}@example.test`, deletedAt: null });
      expect(db.state.onboarding.find((row) => row.userId === last)?.draftJson).toMatchObject({ kakaoName: `${last}-name` });
      expect(db.state.outbox).toHaveLength(1);
      expect(db.state.outbox[0].payload).toMatchObject({ finalizedCount: MAX_FINALIZATIONS_PER_RUN, remainingDue: 1 });

      const second = await service.finalizeDue(new Date(NOW.getTime() + 60 * 60_000));

      expect(second.finalizedUserIds).toEqual([last]);
      expect(second.remainingDue).toBe(0);
    });

    it('does not spend the cap on accounts it leaves alone', async () => {
      const admins = merge(
        ...['a1', 'a2', 'a3'].map((id) => withdrawing(id, PAST_GRACE)),
        { admins: ['a1', 'a2', 'a3'].map((userId) => ({ userId, status: 'active' })) },
      );
      const db = createDatabase(merge(admins, due(MAX_FINALIZATIONS_PER_RUN, 10)));
      const { service } = createService(db);

      const result = await service.finalizeDue(NOW);

      expect(result.finalizedUserIds).toHaveLength(MAX_FINALIZATIONS_PER_RUN);
      expect(result.skipped).toHaveLength(3);
      expect(result.remainingDue).toBe(0);
    });

    it('reports an over-cap run even when nothing else happened to be skipped', async () => {
      const db = createDatabase(due(MAX_FINALIZATIONS_PER_RUN + 5));
      const { service } = createService(db);

      await service.finalizeDue(NOW);

      expect(db.state.outbox[0].payload).toMatchObject({ remainingDue: 5, skipped: [] });
    });
  });

  describe('shutdown', () => {
    beforeEach(() => jest.useFakeTimers({ now: NOW }));
    afterEach(() => jest.useRealTimers());

    it('waits for the run in flight before onModuleDestroy returns', async () => {
      const db = createDatabase();
      const { service } = createService(db);
      let finishRun: () => void = () => undefined;
      jest.spyOn(service, 'finalizeDue').mockReturnValue(
        new Promise((resolve) => {
          finishRun = () => resolve({ finalizedUserIds: [], skipped: [], remainingDue: 0 });
        }),
      );
      service.onModuleInit();
      let destroyed = false;

      const destroying = service.onModuleDestroy().then(() => {
        destroyed = true;
      });
      await jest.advanceTimersByTimeAsync(10);
      expect(destroyed).toBe(false);

      finishRun();
      await destroying;
      expect(destroyed).toBe(true);
    });

    it('starts no new account once shutdown began, and still records what it left', async () => {
      const db = createDatabase(merge(withdrawing('a', PAST_GRACE), withdrawing('b', PAST_GRACE)));
      const { service } = createService(db);
      db.hooks.afterScan = () => void service.onModuleDestroy();

      const result = await service.finalizeDue(NOW);

      expect(result.finalizedUserIds).toEqual([]);
      expect(result.remainingDue).toBe(2);
      expect(db.user('a').accountStatus).toBe('withdrawal_pending');
      expect(db.state.outbox[0].payload).toMatchObject({ remainingDue: 2 });
    });

    it('finishes the account it is on, leaves the next ones, and records both', async () => {
      const db = createDatabase(merge(withdrawing('a', PAST_GRACE), withdrawing('b', PAST_GRACE)));
      const { service } = createService(db);
      db.hooks.onIdentityLookup = (userId) => {
        if (userId === 'a') void service.onModuleDestroy();
      };

      const result = await service.finalizeDue(NOW);

      expect(result.finalizedUserIds).toEqual(['a']);
      expect(result.remainingDue).toBe(1);
      expect(db.user('a').accountStatus).toBe('deleted');
      expect(db.user('b').accountStatus).toBe('withdrawal_pending');
      expect(db.state.outbox[0].payload).toMatchObject({ finalizedCount: 1, remainingDue: 1 });
    });

    it('logs, with the error, a report it could not record while shutting down, and still lets shutdown finish', async () => {
      const db = createDatabase(withdrawing('past', PAST_GRACE));
      db.hooks.failReport = new Error('outbox unavailable');
      const { service, logger } = createService(db);

      service.onModuleInit();
      await service.onModuleDestroy();

      expect(db.user('past').accountStatus).toBe('withdrawal_pending');
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.objectContaining({ message: 'outbox unavailable' }), finalized: 0 }),
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
      const run = jest.spyOn(service, 'finalizeDue').mockResolvedValue({ finalizedUserIds: [], skipped: [], remainingDue: 0 });

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
