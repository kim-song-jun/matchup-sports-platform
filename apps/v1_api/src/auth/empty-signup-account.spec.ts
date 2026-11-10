import { ACTIVITY_RELATION_COUNTS, releaseExpiredSignupPhone, releaseSignupPhone } from './empty-signup-account';

const noActivity = Object.fromEntries(Object.keys(ACTIVITY_RELATION_COUNTS).map((key) => [key, 0]));

function emptySignup(overrides: { passwordHash?: string; user?: Record<string, unknown> } = {}) {
  return {
    id: 'identity-1',
    status: 'active',
    passwordHash: overrides.passwordHash ?? null,
    user: {
      accountStatus: 'active',
      onboardingStatus: 'social_profile_required',
      phone: '01012345678',
      adminUser: null,
      authIdentities: [{ id: 'identity-1' }],
      _count: noActivity,
      ...overrides.user,
    },
  };
}

function fakeDb(holder: ReturnType<typeof emptySignup> | null, updated = 1) {
  return {
    v1AuthIdentity: { findFirst: jest.fn().mockResolvedValue(holder) },
    v1User: { updateMany: jest.fn().mockResolvedValue({ count: updated }) },
    v1StatusChangeLog: { create: jest.fn().mockResolvedValue({}) },
  };
}

describe('releaseSignupPhone', () => {
  it.each(['social_terms_required', 'social_profile_required'])(
    'frees the number of an empty signup on %s, guarded on the same status columns',
    async (onboardingStatus) => {
      const db = fakeDb(emptySignup({ user: { onboardingStatus } }));

      await expect(releaseSignupPhone(db as never, 'user-1', 'abandoned_signup')).resolves.toBe(true);

      expect(db.v1User.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'user-1',
          accountStatus: 'active',
          onboardingStatus: { in: ['social_terms_required', 'social_profile_required'] },
          phone: { not: null },
        },
        data: { phone: null, phoneVerifiedAt: null },
      });
      expect(db.v1StatusChangeLog.create).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ['abandoned_signup', { actorType: 'user', actorUserId: 'user-1' }],
    ['expired_signup', { actorType: 'system', actorUserId: null }],
  ] as const)('records a %s release as a user_phone status change by the right actor', async (reason, actor) => {
    const db = fakeDb(emptySignup());

    await releaseSignupPhone(db as never, 'user-1', reason);

    expect(db.v1StatusChangeLog.create).toHaveBeenCalledWith({
      data: { targetType: 'user_phone', targetId: 'user-1', fromStatus: 'signup', toStatus: 'released', reason, ...actor },
    });
  });

  it.each([
    ['skipped the profile step (a member already using the account)', emptySignup({ user: { onboardingStatus: 'social_profile_deferred' } })],
    ['finished signup', emptySignup({ user: { onboardingStatus: 'completed' } })],
    ['has team activity', emptySignup({ user: { _count: { ...noActivity, teamMemberships: 1 } } })],
    ['has an operator role', emptySignup({ user: { adminUser: { id: 'admin-1' } } })],
    ['has a password login', emptySignup({ passwordHash: 'hash' })],
    ['has a second login method', emptySignup({ user: { authIdentities: [{ id: 'identity-1' }, { id: 'identity-2' }] } })],
    ['is not active', emptySignup({ user: { accountStatus: 'withdrawal_pending' } })],
    ['holds no number', emptySignup({ user: { phone: null } })],
  ])('keeps the number of an account that %s', async (_name, holder) => {
    const db = fakeDb(holder);

    await expect(releaseSignupPhone(db as never, 'user-1', 'abandoned_signup')).resolves.toBe(false);

    expect(db.v1User.updateMany).not.toHaveBeenCalled();
    expect(db.v1StatusChangeLog.create).not.toHaveBeenCalled();
  });

  it('does nothing for a user with no active login', async () => {
    const db = fakeDb(null);

    await expect(releaseSignupPhone(db as never, 'user-1', 'abandoned_signup')).resolves.toBe(false);

    expect(db.v1User.updateMany).not.toHaveBeenCalled();
  });

  it('reports false when the signup moved on between the read and the write', async () => {
    const db = fakeDb(emptySignup(), 0);

    await expect(releaseSignupPhone(db as never, 'user-1', 'abandoned_signup')).resolves.toBe(false);
    expect(db.v1StatusChangeLog.create).not.toHaveBeenCalled();
  });
});

describe('releaseSignupPhone with an idle guard', () => {
  it('adds the untouched-since condition to the write, so a signup that moved on after the read keeps its number', async () => {
    const db = fakeDb(emptySignup());
    const idleSince = new Date('2026-11-07T00:00:00.000Z');

    await releaseSignupPhone(db as never, 'user-1', 'expired_signup_lazy', idleSince);

    expect(db.v1User.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'user-1', updatedAt: { lt: idleSince } }) }),
    );
  });

  it('records a lazy release as a system action with its own reason', async () => {
    const db = fakeDb(emptySignup());

    await releaseSignupPhone(db as never, 'user-1', 'expired_signup_lazy', new Date());

    expect(db.v1StatusChangeLog.create).toHaveBeenCalledWith({
      data: {
        targetType: 'user_phone', targetId: 'user-1', fromStatus: 'signup', toStatus: 'released',
        actorType: 'system', actorUserId: null, reason: 'expired_signup_lazy',
      },
    });
  });
});

describe('releaseExpiredSignupPhone', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const holder = (overrides: Record<string, unknown> = {}) => ({
    id: 'holder-1',
    onboardingStatus: 'social_profile_required',
    createdAt: new Date(Date.now() - 2 * DAY_MS),
    updatedAt: new Date(Date.now() - 2 * DAY_MS),
    ...overrides,
  });

  function fakePrisma(row: ReturnType<typeof holder> | null, updated = 1) {
    const tx = fakeDb(emptySignup(), updated);
    const prisma = {
      v1User: { findUnique: jest.fn().mockResolvedValue(row) },
      $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
    };
    return { prisma, tx };
  }

  it('releases the number of a signup idle past the 24h window, guarded on that same cutoff', async () => {
    const { prisma, tx } = fakePrisma(holder());

    await expect(releaseExpiredSignupPhone(prisma as never, '01012345678')).resolves.toBe(true);

    expect(prisma.v1User.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { phone: '01012345678' } }));
    const { where } = tx.v1User.updateMany.mock.calls[0][0];
    expect(where.id).toBe('holder-1');
    expect(Date.now() - where.updatedAt.lt.getTime()).toBeGreaterThanOrEqual(DAY_MS);
    expect(tx.v1StatusChangeLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ targetId: 'holder-1', reason: 'expired_signup_lazy' }),
    });
  });

  it.each([
    ['nobody holds the number', null],
    ['the signup is still inside its 24h window', holder({ updatedAt: new Date(), createdAt: new Date() })],
    ['the holder finished signup', holder({ onboardingStatus: 'completed' })],
    ['the holder skipped the profile step', holder({ onboardingStatus: 'social_profile_deferred' })],
  ])('does nothing when %s', async (_name, row) => {
    const { prisma, tx } = fakePrisma(row);

    await expect(releaseExpiredSignupPhone(prisma as never, '01012345678')).resolves.toBe(false);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.v1User.updateMany).not.toHaveBeenCalled();
  });

  it('never releases the caller\'s own number', async () => {
    const { prisma } = fakePrisma(holder());

    await expect(releaseExpiredSignupPhone(prisma as never, '01012345678', 'holder-1')).resolves.toBe(false);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('reports false when the holder moved on between the read and the write', async () => {
    const { prisma, tx } = fakePrisma(holder(), 0);

    await expect(releaseExpiredSignupPhone(prisma as never, '01012345678')).resolves.toBe(false);

    expect(tx.v1StatusChangeLog.create).not.toHaveBeenCalled();
  });
});
