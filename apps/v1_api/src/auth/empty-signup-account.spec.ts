import { ACTIVITY_RELATION_COUNTS, releaseSignupPhone } from './empty-signup-account';

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
