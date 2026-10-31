import { AsyncLocalStorage } from 'node:async_hooks';
import { Prisma } from '@prisma/client';

/**
 * Small stateful stand-in for the tables account linking touches, for specs. It keeps real rows, enforces the
 * (provider, providerUserKey) unique index, honours advisory locks across concurrent transactions and undoes only
 * the writes of a failed transaction, so a spec asserts on resulting state instead of on which calls were made.
 */
export type FakeUser = {
  id: string;
  email: string | null;
  phone: string | null;
  accountStatus: string;
  onboardingStatus: string;
  adminUser: { id: string; status?: string } | null;
  /** Counts of the relations that mean the account was used (teams, matches, chat, ...). Absent = none. */
  activity?: Record<string, number>;
  deletedAt: Date | null;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
};

export type FakeIdentity = {
  id: string;
  userId: string;
  provider: string;
  providerUserKey: string;
  email: string | null;
  passwordHash: string | null;
  status: string;
  lastLoginAt: Date | null;
};

type Where = Record<string, unknown>;

export function createFakePrisma(seed: { users: FakeUser[]; identities: FakeIdentity[] }) {
  const state = {
    users: seed.users,
    identities: seed.identities,
    inquiries: [] as { id: string; userId: string }[],
    invitations: [] as { id: string; teamId: string; invitedUserId: string; invitedByUserId: string; status: string; respondedAt?: Date }[],
    memberships: [] as { teamId: string; userId: string; status: string }[],
    uploads: [] as { id: string; ownerUserId: string }[],
    profileMasks: [] as string[],
    logs: [] as Record<string, unknown>[],
  };
  let nextId = 1;
  const locks = new Map<string, Promise<void>>();
  // Each transaction keeps its own undo list; a failed one reverts its writes without touching what others committed.
  const undoLog = new AsyncLocalStorage<Array<() => void>>();
  const recordUndo = (undo: () => void) => undoLog.getStore()?.push(undo);
  const restoreRows = <T extends object>(rows: T[]) => {
    const before = rows.map((row) => ({ row, copy: { ...row } }));
    recordUndo(() => before.forEach(({ row, copy }) => Object.assign(row, copy)));
  };

  const tick = () => Promise.resolve();
  const matches = (row: Record<string, unknown>, where: Where) =>
    Object.entries(where).every(([key, expected]) => {
      if (expected && typeof expected === 'object' && 'in' in expected) {
        return (expected as { in: unknown[] }).in.includes(row[key]);
      }
      return row[key] === expected;
    });
  const activeIdentities = (userId: string) =>
    state.identities.filter((identity) => identity.userId === userId && identity.status === 'active');
  const withRelations = (user: FakeUser) => ({
    ...user,
    adminUser: user.adminUser && { status: 'active', ...user.adminUser },
    _count: { ...user.activity },
    authIdentities: activeIdentities(user.id).map((identity) => ({ ...identity })),
  });
  const countOf = (rows: unknown[]) => ({ count: rows.length });

  const client = {
    v1User: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        await tick();
        const user = state.users.find((row) => row.id === where.id);
        return user ? withRelations(user) : null;
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Where; data: Partial<FakeUser> }) => {
        await tick();
        const rows = state.users.filter((row) => matches(row as unknown as Record<string, unknown>, where));
        restoreRows(rows);
        rows.forEach((row) => Object.assign(row, data));
        return countOf(rows);
      }),
    },
    v1AuthIdentity: {
      findUnique: jest.fn(
        async ({ where }: { where: { provider_providerUserKey: { provider: string; providerUserKey: string } } }) => {
          await tick();
          const key = where.provider_providerUserKey;
          const identity = state.identities.find(
            (row) => row.provider === key.provider && row.providerUserKey === key.providerUserKey,
          );
          if (!identity) return null;
          const owner = state.users.find((row) => row.id === identity.userId);
          return owner ? { ...identity, user: withRelations(owner) } : null;
        },
      ),
      create: jest.fn(async ({ data }: { data: Omit<FakeIdentity, 'id' | 'passwordHash'> }) => {
        await tick();
        if (state.identities.some((row) => row.provider === data.provider && row.providerUserKey === data.providerUserKey)) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });
        }
        const row: FakeIdentity = { ...data, id: `identity-${nextId++}`, passwordHash: null };
        state.identities.push(row);
        recordUndo(() => state.identities.splice(state.identities.indexOf(row), 1));
        return { id: row.id };
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Where; data: Partial<FakeIdentity> }) => {
        await tick();
        const rows = state.identities.filter((row) => matches(row as unknown as Record<string, unknown>, where));
        restoreRows(rows);
        rows.forEach((row) => Object.assign(row, data));
        return countOf(rows);
      }),
      findMany: jest.fn(async ({ where }: { where: { userId: string; status: string } }) => {
        await tick();
        return state.identities
          .filter((row) => row.userId === where.userId && row.status === where.status)
          .map((row) => ({ provider: row.provider }));
      }),
    },
    v1UserProfile: {
      updateMany: jest.fn(async ({ where }: { where: { userId: string } }) => {
        await tick();
        state.profileMasks.push(where.userId);
        recordUndo(() => state.profileMasks.splice(state.profileMasks.lastIndexOf(where.userId), 1));
        return { count: 1 };
      }),
    },
    v1Inquiry: {
      updateMany: jest.fn(async ({ where, data }: { where: { userId: string }; data: { userId: string } }) => {
        await tick();
        const rows = state.inquiries.filter((row) => row.userId === where.userId);
        restoreRows(rows);
        rows.forEach((row) => (row.userId = data.userId));
        return countOf(rows);
      }),
    },
    v1UploadAsset: {
      updateMany: jest.fn(async ({ where, data }: { where: { ownerUserId: string }; data: { ownerUserId: string } }) => {
        await tick();
        const rows = state.uploads.filter((row) => row.ownerUserId === where.ownerUserId);
        restoreRows(rows);
        rows.forEach((row) => (row.ownerUserId = data.ownerUserId));
        return countOf(rows);
      }),
    },
    v1TeamInvitation: {
      findMany: jest.fn(async ({ where }: { where: Where }) => {
        await tick();
        return state.invitations.filter((row) => matches(row as unknown as Record<string, unknown>, where)).map((row) => ({ ...row }));
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
        await tick();
        const rows = state.invitations.filter((row) => matches(row as unknown as Record<string, unknown>, where));
        restoreRows(rows);
        rows.forEach((row) => Object.assign(row, data));
        return countOf(rows);
      }),
    },
    v1TeamMembership: {
      findMany: jest.fn(async ({ where }: { where: Where }) => {
        await tick();
        return state.memberships.filter((row) => matches(row as unknown as Record<string, unknown>, where)).map((row) => ({ ...row }));
      }),
    },
    v1UserRecordConsent: { updateMany: jest.fn(async () => ({ count: 0 })) },
    v1PushSubscription: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    v1PushDevice: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    v1ChatUserBlock: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    v1UserRegion: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    v1UserSportPreference: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    v1SearchHistory: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    v1VerificationToken: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    v1StatusChangeLog: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        await tick();
        state.logs.push(data);
        recordUndo(() => state.logs.splice(state.logs.indexOf(data), 1));
        return data;
      }),
    },
  };

  async function acquire(scope: string, held: Array<() => void>) {
    const previous = locks.get(scope) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((resolve) => (release = resolve));
    locks.set(scope, previous.then(() => mine));
    held.push(release);
    await previous;
  }

  const transactions: Array<{ $queryRaw: jest.Mock; $executeRaw: jest.Mock }> = [];
  const prisma = {
    ...client,
    $transaction: jest.fn(async (run: (tx: unknown) => Promise<unknown>) => {
      const held: Array<() => void> = [];
      const undo: Array<() => void> = [];
      const tx = {
        ...client,
        $executeRaw: jest.fn(async (_strings: TemplateStringsArray, scope: string) => {
          await acquire(scope, held);
          return 1;
        }),
        // Row lock on the caller (`SELECT ... FOR UPDATE`); the advisory locks above already order the specs' callers.
        $queryRaw: jest.fn(async () => []),
      };
      transactions.push(tx);
      try {
        return await undoLog.run(undo, () => run(tx));
      } catch (error) {
        undo.reverse().forEach((revert) => revert());
        throw error;
      } finally {
        held.forEach((release) => release());
      }
    }),
  };

  return { prisma, client, state, transactions };
}
