import { Prisma } from '@prisma/client';
import {
  createFakePrisma,
  type FakeIdentity,
  type FakeUser,
} from '../../test/helpers/account-link-fake-prisma';
import { issuePhoneProofToken } from '../verification/phone-proof-token';
import { AccountLinkService, RECENT_LOGIN_MAX_AGE_SECONDS } from './account-link.service';
import type { AuthService, KakaoProfile } from './auth.service';
import { signInThenLinkConflict } from './social-link-conflict';
import { issueSocialLinkToken, type SocialLinkClaims } from './social-link-token';

// Link tokens are signed with the session secret.
const savedSessionSecret = process.env.V1_SESSION_SECRET;
beforeAll(() => {
  process.env.V1_SESSION_SECRET = 'x'.repeat(48);
});
afterAll(() => {
  if (savedSessionSecret === undefined) delete process.env.V1_SESSION_SECRET;
  else process.env.V1_SESSION_SECRET = savedSessionSecret;
});

const CALLER = 'user-caller';
const OTHER_CALLER = 'user-other-caller';
const EMPTY = 'user-empty-signup';
const KAKAO_KEY = 'kakao-key-1';

const user = (id: string, overrides: Partial<FakeUser> = {}): FakeUser => ({
  id,
  email: `${id}@example.test`,
  phone: null,
  accountStatus: 'active',
  onboardingStatus: 'completed',
  adminUser: null,
  deletedAt: null,
  emailVerifiedAt: null,
  phoneVerifiedAt: null,
  ...overrides,
});

const identity = (id: string, userId: string, provider: string, key: string, overrides: Partial<FakeIdentity> = {}): FakeIdentity => ({
  id,
  userId,
  provider,
  providerUserKey: key,
  email: null,
  passwordHash: null,
  status: 'active',
  lastLoginAt: null,
  ...overrides,
});

const emailLogin = (userId: string) => identity(`email-${userId}`, userId, 'email', `${userId}@example.test`, { passwordHash: 'hash' });

const kakaoProfile = (overrides: Partial<KakaoProfile> = {}): KakaoProfile => ({
  providerUserKey: KAKAO_KEY,
  email: null,
  emailValid: false,
  emailVerified: false,
  profileImageUrl: null,
  nickname: null,
  signupPrefill: null,
  ...overrides,
});

const TOKEN_FORM = { accessToken: 'native-sdk-token-0123456789' };
const CODE_FORM = { code: 'auth-code', redirectUri: 'https://teameet.co.kr/auth/kakao/callback' };

function build(seed: { users: FakeUser[]; identities: FakeIdentity[] }) {
  const fake = createFakePrisma(seed);
  const auth = {
    fetchKakaoProfileForToken: jest.fn().mockResolvedValue(kakaoProfile()),
    fetchKakaoProfileForCode: jest.fn().mockResolvedValue(kakaoProfile()),
  };
  const appleIdentity = { verifyIdentityToken: jest.fn() };
  const appleTokens = { storeFromAuthorizationCode: jest.fn().mockResolvedValue(undefined) };
  const notice = { id: 'notice-1', targetType: 'system', targetId: null, title: '로그인 수단이 연결됐어요', body: null, deepLink: '/my/settings' };
  const notifications = { createInTransaction: jest.fn().mockResolvedValue(notice), deliverCreated: jest.fn() };
  const realtime = { forceDisconnectUser: jest.fn() };
  const service = new AccountLinkService(
    fake.prisma as never,
    auth as unknown as AuthService,
    appleIdentity as never,
    appleTokens as never,
    notifications as never,
    realtime,
  );
  return { service, auth, appleIdentity, appleTokens, notifications, realtime, ...fake };
}

const callerWithEmailLogin = (id = CALLER) => ({ users: [user(id)], identities: [emailLogin(id)] });

/** An abandoned social signup holding the Kakao identity, plus what it left behind. */
function withEmptySignup(
  onboardingStatus: string,
  overrides: { user?: Partial<FakeUser>; identity?: Partial<FakeIdentity>; extraIdentities?: FakeIdentity[] } = {},
) {
  return {
    users: [user(CALLER), user(EMPTY, { onboardingStatus, email: 'kakao-signup@example.test', phone: '01055556666', ...overrides.user })],
    identities: [
      emailLogin(CALLER),
      identity('kakao-on-empty', EMPTY, 'kakao', KAKAO_KEY, overrides.identity),
      ...(overrides.extraIdentities ?? []),
    ],
  };
}

async function failure(promise: Promise<unknown>) {
  return promise.then(
    () => {
      throw new Error('expected the call to be refused');
    },
    (error: { getResponse(): { code: string; details?: unknown } }) => error.getResponse(),
  );
}

describe('AccountLinkService.linkKakao', () => {
  it('attaches a Kakao identity nobody holds, records it and tells the account', async () => {
    const { service, state, notifications } = build(callerWithEmailLogin());

    const result = await service.linkKakao(CALLER, TOKEN_FORM, 60);

    expect(result).toEqual({ provider: 'kakao', alreadyLinked: false, mergedPendingAccount: false, authProviders: ['email', 'kakao'] });
    const added = state.identities.find((row) => row.provider === 'kakao');
    expect(added).toMatchObject({ userId: CALLER, providerUserKey: KAKAO_KEY, status: 'active' });
    expect(state.logs).toEqual([
      expect.objectContaining({ targetType: 'auth_identity', targetId: added?.id, toStatus: 'linked', actorUserId: CALLER, reason: 'account_link:kakao' }),
    ]);
    // Stored in the link's own transaction (it receives the transaction client), pushed after it committed.
    expect(notifications.createInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ $executeRaw: expect.any(Function) }),
      CALLER,
      'social_identity_linked',
      { vars: { name: '카카오' }, businessKey: `social-link:${added?.id}` },
    );
    expect(notifications.deliverCreated).toHaveBeenCalledWith(CALLER, 'social_identity_linked', expect.objectContaining({ id: 'notice-1' }));
  });

  it('stores the Kakao email only when Kakao vouches for it', async () => {
    const vouched = build(callerWithEmailLogin());
    vouched.auth.fetchKakaoProfileForToken.mockResolvedValue(kakaoProfile({ email: 'Me@Example.test', emailValid: true, emailVerified: true }));
    await vouched.service.linkKakao(CALLER, TOKEN_FORM, null);
    expect(vouched.state.identities.find((row) => row.provider === 'kakao')?.email).toBe('me@example.test');

    const unvouched = build(callerWithEmailLogin());
    unvouched.auth.fetchKakaoProfileForToken.mockResolvedValue(kakaoProfile({ email: 'me@example.test', emailValid: true, emailVerified: false }));
    await unvouched.service.linkKakao(CALLER, TOKEN_FORM, null);
    expect(unvouched.state.identities.find((row) => row.provider === 'kakao')?.email).toBeNull();
  });

  it('verifies the web code form and the native token form through the existing login checks', async () => {
    const web = build(callerWithEmailLogin());
    await web.service.linkKakao(CALLER, CODE_FORM, null);
    expect(web.auth.fetchKakaoProfileForCode).toHaveBeenCalledWith('auth-code', 'https://teameet.co.kr/auth/kakao/callback');
    expect(web.auth.fetchKakaoProfileForToken).not.toHaveBeenCalled();

    const native = build(callerWithEmailLogin());
    await native.service.linkKakao(CALLER, TOKEN_FORM, null);
    expect(native.auth.fetchKakaoProfileForToken).toHaveBeenCalledWith(TOKEN_FORM.accessToken);
    expect(native.auth.fetchKakaoProfileForCode).not.toHaveBeenCalled();
  });

  it('refuses a body that mixes both forms before asking Kakao anything', async () => {
    const { service, auth, state } = build(callerWithEmailLogin());

    expect(await failure(service.linkKakao(CALLER, { ...CODE_FORM, ...TOKEN_FORM }, null))).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(auth.fetchKakaoProfileForCode).not.toHaveBeenCalled();
    expect(auth.fetchKakaoProfileForToken).not.toHaveBeenCalled();
    expect(state.identities).toHaveLength(1);
  });

  it('writes nothing when Kakao rejects the token', async () => {
    const { service, auth, state, prisma } = build(callerWithEmailLogin());
    auth.fetchKakaoProfileForToken.mockRejectedValue(new Error('Kakao token is not valid for this app'));

    await expect(service.linkKakao(CALLER, TOKEN_FORM, null)).rejects.toThrow('Kakao token is not valid for this app');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(state.identities).toHaveLength(1);
  });

  describe('repeat and conflicting links', () => {
    it('answers a repeat of the same link as already linked and writes nothing', async () => {
      const seed = callerWithEmailLogin();
      seed.identities.push(identity('kakao-own', CALLER, 'kakao', KAKAO_KEY));
      const { service, state, notifications } = build(seed);

      const result = await service.linkKakao(CALLER, TOKEN_FORM, null);

      expect(result).toEqual({ provider: 'kakao', alreadyLinked: true, mergedPendingAccount: false, authProviders: ['email', 'kakao'] });
      expect(state.identities).toHaveLength(2);
      expect(state.logs).toHaveLength(0);
      expect(notifications.createInTransaction).not.toHaveBeenCalled();
      expect(notifications.deliverCreated).not.toHaveBeenCalled();
    });

    it('refuses a second, different Kakao account on the same login', async () => {
      const seed = callerWithEmailLogin();
      seed.identities.push(identity('kakao-own', CALLER, 'kakao', 'someone-elses-kakao'));
      const { service, state } = build(seed);

      expect(await failure(service.linkKakao(CALLER, TOKEN_FORM, null))).toMatchObject({ code: 'SOCIAL_LINK_PROVIDER_EXISTS' });
      expect(state.identities.map((row) => row.providerUserKey)).toEqual([`${CALLER}@example.test`, 'someone-elses-kakao']);
    });

    it('lets an Apple identity sit beside the Kakao one (the provider is the unit)', async () => {
      const seed = callerWithEmailLogin();
      seed.identities.push(identity('apple-own', CALLER, 'apple', 'apple-sub'));
      const { service } = build(seed);

      expect(await service.linkKakao(CALLER, TOKEN_FORM, null)).toMatchObject({ alreadyLinked: false, authProviders: ['email', 'apple', 'kakao'] });
    });

    it('refuses a Kakao login that belongs to another account that is really in use', async () => {
      const seed = { users: [user(CALLER), user('user-real-owner')], identities: [emailLogin(CALLER), identity('kakao-owned', 'user-real-owner', 'kakao', KAKAO_KEY)] };
      const { service, state } = build(seed);

      expect(await failure(service.linkKakao(CALLER, TOKEN_FORM, null))).toMatchObject({ code: 'SOCIAL_LINK_PROVIDER_IN_USE' });
      expect(state.identities.find((row) => row.id === 'kakao-owned')?.userId).toBe('user-real-owner');
      expect(state.logs).toHaveLength(0);
    });

    it('turns a unique-index loss at insert time into the same in-use answer', async () => {
      const { service, client } = build(callerWithEmailLogin());
      client.v1AuthIdentity.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
      );

      expect(await failure(service.linkKakao(CALLER, TOKEN_FORM, null))).toMatchObject({ code: 'SOCIAL_LINK_PROVIDER_IN_USE' });
    });
  });

  describe('moving the identity off an empty signup account', () => {
    it.each(['social_terms_required', 'social_profile_required', 'social_profile_deferred'])(
      'moves it from a %s account, retires that account and hands over what it left',
      async (onboardingStatus) => {
        const { service, state, realtime } = build(withEmptySignup(onboardingStatus));
        state.inquiries.push({ id: 'inquiry-1', userId: EMPTY }, { id: 'inquiry-2', userId: CALLER });
        state.uploads.push({ id: 'upload-1', ownerUserId: EMPTY });

        const result = await service.linkKakao(CALLER, TOKEN_FORM, 120);

        expect(result).toEqual({ provider: 'kakao', alreadyLinked: false, mergedPendingAccount: true, authProviders: ['email', 'kakao'] });
        // The same row moved, so the provider key stays unique and an Apple refresh token would travel with it.
        expect(state.identities.filter((row) => row.provider === 'kakao')).toEqual([
          expect.objectContaining({ id: 'kakao-on-empty', userId: CALLER, status: 'active' }),
        ]);
        expect(state.users.find((row) => row.id === EMPTY)).toMatchObject({
          accountStatus: 'deleted',
          // Out of the signup steps as well, so a signup request still in flight cannot complete it.
          onboardingStatus: 'not_started',
          email: `deleted+${EMPTY}@deleted.teameet.local`,
          phone: `deleted-${EMPTY}`,
          emailVerifiedAt: null,
          phoneVerifiedAt: null,
          deletedAt: expect.any(Date),
        });
        expect(state.profileMasks).toEqual([EMPTY]);
        expect(state.inquiries).toEqual([{ id: 'inquiry-1', userId: CALLER }, { id: 'inquiry-2', userId: CALLER }]);
        expect(state.uploads).toEqual([{ id: 'upload-1', ownerUserId: CALLER }]);
        expect(state.logs).toHaveLength(2);
        expect(state.logs).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ targetType: 'auth_identity', targetId: 'kakao-on-empty', reason: 'account_link:kakao;merged_pending_user' }),
            expect.objectContaining({ targetType: 'user', targetId: EMPTY, toStatus: 'deleted', actorUserId: CALLER }),
          ]),
        );
        expect(realtime.forceDisconnectUser).toHaveBeenCalledWith(EMPTY);
      },
    );

    describe('waiting team invitations of the abandoned signup', () => {
      const invitation = (id: string, teamId: string, overrides: Record<string, unknown> = {}) => ({
        id, teamId, invitedUserId: EMPTY, invitedByUserId: 'user-team-owner', status: 'pending', ...overrides,
      });

      it('go to the account that takes over, still waiting', async () => {
        const { service, state } = build(withEmptySignup('social_profile_required'));
        state.invitations.push(invitation('inv-a', 'team-a'), invitation('inv-b', 'team-b'));

        await service.linkKakao(CALLER, TOKEN_FORM, null);

        expect(state.invitations).toEqual([
          expect.objectContaining({ id: 'inv-a', invitedUserId: CALLER, status: 'pending' }),
          expect.objectContaining({ id: 'inv-b', invitedUserId: CALLER, status: 'pending' }),
        ]);
      });

      it('are cancelled, not duplicated, where the caller is already in the team, already invited, or sent them', async () => {
        const { service, state } = build(withEmptySignup('social_profile_required'));
        state.memberships.push({ teamId: 'team-member', userId: CALLER, status: 'active' });
        state.invitations.push(
          invitation('inv-member', 'team-member'),
          invitation('inv-already', 'team-already'),
          invitation('inv-own', 'team-own', { invitedByUserId: CALLER }),
          invitation('inv-moves', 'team-moves'),
          { ...invitation('inv-callers', 'team-already'), invitedUserId: CALLER },
        );

        await service.linkKakao(CALLER, TOKEN_FORM, null);

        const byId = Object.fromEntries(state.invitations.map((row) => [row.id, row]));
        expect(byId['inv-moves']).toMatchObject({ invitedUserId: CALLER, status: 'pending' });
        for (const id of ['inv-member', 'inv-already', 'inv-own']) {
          expect(byId[id]).toMatchObject({ invitedUserId: EMPTY, status: 'cancelled', respondedAt: expect.any(Date) });
        }
        // The caller's own waiting invitation is untouched and stays the only one for its team.
        expect(byId['inv-callers']).toMatchObject({ invitedUserId: CALLER, status: 'pending' });
        expect(state.invitations.filter((row) => row.invitedUserId === CALLER && row.status === 'pending' && row.teamId === 'team-already')).toHaveLength(1);
      });

      it('does not count a membership the caller has left as being in the team', async () => {
        const { service, state } = build(withEmptySignup('social_profile_required'));
        state.memberships.push({ teamId: 'team-left', userId: CALLER, status: 'left' });
        state.invitations.push(invitation('inv-left', 'team-left'));

        await service.linkKakao(CALLER, TOKEN_FORM, null);

        expect(state.invitations[0]).toMatchObject({ invitedUserId: CALLER, status: 'pending' });
      });

      it('leave finished invitations and other people’s invitations where they are', async () => {
        const { service, state } = build(withEmptySignup('social_profile_required'));
        state.invitations.push(
          invitation('inv-accepted', 'team-a', { status: 'accepted' }),
          invitation('inv-declined', 'team-b', { status: 'declined' }),
          invitation('inv-else', 'team-c', { invitedUserId: 'user-someone-else' }),
        );

        await service.linkKakao(CALLER, TOKEN_FORM, null);

        expect(state.invitations.map((row) => [row.id, row.invitedUserId, row.status])).toEqual([
          ['inv-accepted', EMPTY, 'accepted'],
          ['inv-declined', EMPTY, 'declined'],
          ['inv-else', 'user-someone-else', 'pending'],
        ]);
      });

      it('stay with the signup when the link is refused', async () => {
        const { service, state } = build(withEmptySignup('completed'));
        state.invitations.push(invitation('inv-a', 'team-a'));

        expect(await failure(service.linkKakao(CALLER, TOKEN_FORM, null))).toMatchObject({ code: 'SOCIAL_LINK_PROVIDER_IN_USE' });
        expect(state.invitations[0]).toMatchObject({ invitedUserId: EMPTY, status: 'pending' });
      });
    });

    it('frees the retired account’s email and phone for their real owner', async () => {
      const { service, state } = build(withEmptySignup('social_profile_required'));
      await service.linkKakao(CALLER, TOKEN_FORM, null);

      const taken = state.users.filter((row) => row.email === 'kakao-signup@example.test' || row.phone === '01055556666');
      expect(taken).toHaveLength(0);
    });

    // The empty-account rule narrows who may be retired, so every way of not being empty is paired with the
    // empty fixture above (same shape, one property changed) to show the property is what blocks it.
    it.each([
      ['has finished signup', { user: { onboardingStatus: 'completed' } }],
      ['is suspended', { user: { accountStatus: 'suspended' } }],
      ['holds an operator role', { user: { adminUser: { id: 'admin-row' } } }],
      ['has a password login', { identity: { passwordHash: 'hash' } }],
      ['has a second login method', { extraIdentities: [identity('apple-on-empty', EMPTY, 'apple', 'apple-sub')] }],
      ['has an inactive identity row', { identity: { status: 'blocked' } }],
    ] as const)('leaves an account that %s alone', async (_label, overrides) => {
      const { service, state, realtime, notifications } = build(withEmptySignup('social_profile_required', overrides as never));
      state.inquiries.push({ id: 'inquiry-1', userId: EMPTY });

      expect(await failure(service.linkKakao(CALLER, TOKEN_FORM, null))).toMatchObject({ code: 'SOCIAL_LINK_PROVIDER_IN_USE' });

      expect(state.identities.find((row) => row.id === 'kakao-on-empty')?.userId).toBe(EMPTY);
      expect(state.users.find((row) => row.id === EMPTY)?.accountStatus).not.toBe('deleted');
      expect(state.inquiries).toEqual([{ id: 'inquiry-1', userId: EMPTY }]);
      expect(state.logs).toHaveLength(0);
      expect(realtime.forceDisconnectUser).not.toHaveBeenCalled();
      expect(notifications.createInTransaction).not.toHaveBeenCalled();
      expect(notifications.deliverCreated).not.toHaveBeenCalled();
    });

    // Status alone is not "unused": any real relation keeps the account where it is.
    it.each([
      'teamMemberships', 'ownedTeams', 'teamJoinApplications', 'hostedMatches', 'matchApplications', 'matchParticipants',
      'createdTeamMatches', 'teamMatchApplications', 'chatParticipations', 'chatMessages', 'tournamentRegistrationsApplied',
      'tournamentPlayerEntries', 'tournamentStaffAssignments', 'tournamentReviews', 'postEventReviewsWritten',
    ])('leaves a signup account alone once it has %s', async (relation) => {
      const { service, state } = build(withEmptySignup('social_profile_deferred', { user: { activity: { [relation]: 1 } } }));

      expect(await failure(service.linkKakao(CALLER, TOKEN_FORM, null))).toMatchObject({ code: 'SOCIAL_LINK_PROVIDER_IN_USE' });
      expect(state.identities.find((row) => row.id === 'kakao-on-empty')?.userId).toBe(EMPTY);
      expect(state.users.find((row) => row.id === EMPTY)?.accountStatus).toBe('active');
    });

    it('treats zero counts of every relation as unused', async () => {
      const zeros = Object.fromEntries(['teamMemberships', 'ownedTeams', 'chatMessages'].map((relation) => [relation, 0]));
      const { service } = build(withEmptySignup('social_profile_deferred', { user: { activity: zeros } }));

      await expect(service.linkKakao(CALLER, TOKEN_FORM, null)).resolves.toMatchObject({ mergedPendingAccount: true });
    });

    it('refuses when the empty account finished signup between the read and the retire', async () => {
      const { service, state, client } = build(withEmptySignup('social_profile_required'));
      state.inquiries.push({ id: 'inquiry-1', userId: EMPTY });
      // The guarded update on the retire step is what notices: the read still saw an empty account.
      const realFind = client.v1AuthIdentity.findUnique.getMockImplementation()!;
      client.v1AuthIdentity.findUnique.mockImplementationOnce(async (args) => {
        const found = await realFind(args);
        state.users.find((row) => row.id === EMPTY)!.onboardingStatus = 'completed';
        return found && { ...found, user: { ...found.user, onboardingStatus: 'social_profile_required' } };
      });

      expect(await failure(service.linkKakao(CALLER, TOKEN_FORM, null))).toMatchObject({ code: 'SOCIAL_LINK_PROVIDER_IN_USE' });
      expect(state.identities.find((row) => row.id === 'kakao-on-empty')?.userId).toBe(EMPTY);
      expect(state.inquiries).toEqual([{ id: 'inquiry-1', userId: EMPTY }]);
    });
  });

  describe('who may call', () => {
    it.each([
      ['social_terms_required', '/terms?mode=social'],
      ['social_profile_required', '/signup/social'],
      ['social_profile_deferred', '/signup/social'],
    ])('refuses a caller whose own signup is %s', async (onboardingStatus, route) => {
      const { service, state } = build({
        users: [user(CALLER, { onboardingStatus })],
        identities: [identity('login-pending', CALLER, 'apple', 'apple-sub')],
      });

      expect(await failure(service.linkKakao(CALLER, TOKEN_FORM, null))).toEqual({
        code: 'SIGNUP_INCOMPLETE',
        message: expect.any(String),
        details: { next: { route } },
      });
      expect(state.identities).toHaveLength(1);
    });

    it.each(['active', 'suspended'])('refuses a caller who holds an operator role (%s) and changes nothing', async (status) => {
      const seed = callerWithEmailLogin();
      seed.users[0].adminUser = { id: 'admin-row', status };
      const { service, state, notifications } = build(seed);

      expect(await failure(service.linkKakao(CALLER, TOKEN_FORM, null))).toMatchObject({ code: 'SOCIAL_LINK_ADMIN_FORBIDDEN' });
      expect(state.identities).toHaveLength(1);
      expect(notifications.createInTransaction).not.toHaveBeenCalled();
    });

    it('does not count a revoked operator role', async () => {
      const seed = callerWithEmailLogin();
      seed.users[0].adminUser = { id: 'admin-row', status: 'revoked' };
      const { service } = build(seed);

      await expect(service.linkKakao(CALLER, TOKEN_FORM, null)).resolves.toMatchObject({ alreadyLinked: false });
    });

    it('refuses a caller whose account was deleted even if its status still reads active', async () => {
      const { service, state } = build({ users: [user(CALLER, { deletedAt: new Date() })], identities: [emailLogin(CALLER)] });

      expect(await failure(service.linkKakao(CALLER, TOKEN_FORM, null))).toMatchObject({ code: 'PERMISSION_DENIED' });
      expect(state.identities).toHaveLength(1);
    });

    it('locks the caller row inside the link transaction before reading it', async () => {
      const { service, transactions } = build(callerWithEmailLogin());

      await service.linkKakao(CALLER, TOKEN_FORM, null);

      expect(transactions).toHaveLength(1);
      expect(transactions[0].$queryRaw).toHaveBeenCalledTimes(1);
      expect(String(transactions[0].$queryRaw.mock.calls[0][0].join(' '))).toMatch(/FOR UPDATE/);
      expect(transactions[0].$queryRaw.mock.calls[0][1]).toBe(CALLER);
    });

    it('refuses a caller whose account is no longer active', async () => {
      const { service } = build({ users: [user(CALLER, { accountStatus: 'suspended' })], identities: [emailLogin(CALLER)] });

      expect(await failure(service.linkKakao(CALLER, TOKEN_FORM, null))).toMatchObject({ code: 'PERMISSION_DENIED' });
    });
  });

  describe('recent login', () => {
    it('refuses an older session before contacting Kakao', async () => {
      const { service, auth, state } = build(callerWithEmailLogin());

      expect(await failure(service.linkKakao(CALLER, TOKEN_FORM, RECENT_LOGIN_MAX_AGE_SECONDS + 1))).toEqual({
        code: 'RECENT_LOGIN_REQUIRED',
        message: expect.any(String),
        details: { maxAgeSeconds: 1800 },
      });
      expect(auth.fetchKakaoProfileForToken).not.toHaveBeenCalled();
      expect(state.identities).toHaveLength(1);
    });

    it('refuses a request without a session age in production, and still accepts a recent session there', async () => {
      const savedEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const { service, auth, state } = build(callerWithEmailLogin());

        expect(await failure(service.linkKakao(CALLER, TOKEN_FORM, null))).toMatchObject({ code: 'RECENT_LOGIN_REQUIRED' });
        expect(auth.fetchKakaoProfileForToken).not.toHaveBeenCalled();
        expect(state.identities).toHaveLength(1);
        await expect(service.linkKakao(CALLER, TOKEN_FORM, 60)).resolves.toMatchObject({ alreadyLinked: false });
      } finally {
        process.env.NODE_ENV = savedEnv;
      }
    });

    it('accepts a session exactly at the limit, and a header identity that has no session age', async () => {
      const atLimit = build(callerWithEmailLogin());
      await expect(atLimit.service.linkKakao(CALLER, TOKEN_FORM, RECENT_LOGIN_MAX_AGE_SECONDS)).resolves.toMatchObject({ alreadyLinked: false });

      const headerIdentity = build(callerWithEmailLogin());
      await expect(headerIdentity.service.linkKakao(CALLER, TOKEN_FORM, null)).resolves.toMatchObject({ alreadyLinked: false });
    });
  });

  describe('side effects after the link is stored', () => {
    it('stores the notice with the link or not at all', async () => {
      const { service, state, notifications } = build(callerWithEmailLogin());
      notifications.createInTransaction.mockRejectedValue(new Error('notification table unavailable'));

      await expect(service.linkKakao(CALLER, TOKEN_FORM, null)).rejects.toThrow('notification table unavailable');
      expect(state.identities).toHaveLength(1);
      expect(state.logs).toHaveLength(0);
      expect(notifications.deliverCreated).not.toHaveBeenCalled();
    });

    it('still links when the notice could not be worded (nothing to push)', async () => {
      const { service, state, notifications } = build(callerWithEmailLogin());
      notifications.createInTransaction.mockResolvedValue(null);

      await expect(service.linkKakao(CALLER, TOKEN_FORM, null)).resolves.toMatchObject({ alreadyLinked: false });
      expect(state.identities.some((row) => row.provider === 'kakao')).toBe(true);
      expect(notifications.deliverCreated).not.toHaveBeenCalled();
    });

    it('still succeeds when the retired account’s socket cannot be closed', async () => {
      const { service, state, realtime } = build(withEmptySignup('social_profile_required'));
      realtime.forceDisconnectUser.mockImplementation(() => {
        throw new Error('gateway not ready');
      });

      await expect(service.linkKakao(CALLER, TOKEN_FORM, null)).resolves.toMatchObject({ mergedPendingAccount: true });
      expect(state.identities.find((row) => row.id === 'kakao-on-empty')?.userId).toBe(CALLER);
    });
  });

  describe('concurrent links', () => {
    it('lets exactly one of two accounts claim the same Kakao login held by an empty signup', async () => {
      const seed = withEmptySignup('social_profile_required');
      seed.users.push(user(OTHER_CALLER));
      seed.identities.push(emailLogin(OTHER_CALLER));
      const { service, state } = build(seed);
      state.inquiries.push({ id: 'inquiry-1', userId: EMPTY });

      const settled = await Promise.allSettled([
        service.linkKakao(CALLER, TOKEN_FORM, null),
        service.linkKakao(OTHER_CALLER, TOKEN_FORM, null),
      ]);

      expect(settled.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
      const loser = settled.find((outcome) => outcome.status === 'rejected') as PromiseRejectedResult;
      expect(loser.reason.getResponse().code).toBe('SOCIAL_LINK_PROVIDER_IN_USE');
      const winner = settled[0].status === 'fulfilled' ? CALLER : OTHER_CALLER;
      expect(state.identities.filter((row) => row.provider === 'kakao')).toEqual([expect.objectContaining({ userId: winner })]);
      expect(state.inquiries).toEqual([{ id: 'inquiry-1', userId: winner }]);
      expect(state.logs.filter((log) => log.targetType === 'auth_identity')).toHaveLength(1);
    });

    it('lets exactly one of two accounts claim the same Kakao login nobody holds', async () => {
      const seed = { users: [user(CALLER), user(OTHER_CALLER)], identities: [emailLogin(CALLER), emailLogin(OTHER_CALLER)] };
      const { service, state } = build(seed);

      const settled = await Promise.allSettled([
        service.linkKakao(CALLER, TOKEN_FORM, null),
        service.linkKakao(OTHER_CALLER, TOKEN_FORM, null),
      ]);

      expect(settled.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
      expect(state.identities.filter((row) => row.provider === 'kakao')).toHaveLength(1);
    });

    it('keeps one Kakao identity per account when the same account links two different Kakao logins at once', async () => {
      const { service, state, auth } = build(callerWithEmailLogin());
      auth.fetchKakaoProfileForToken
        .mockResolvedValueOnce(kakaoProfile({ providerUserKey: 'kakao-key-a' }))
        .mockResolvedValueOnce(kakaoProfile({ providerUserKey: 'kakao-key-b' }));

      const settled = await Promise.allSettled([
        service.linkKakao(CALLER, TOKEN_FORM, null),
        service.linkKakao(CALLER, TOKEN_FORM, null),
      ]);

      expect(settled.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
      expect((settled.find((outcome) => outcome.status === 'rejected') as PromiseRejectedResult).reason.getResponse().code).toBe(
        'SOCIAL_LINK_PROVIDER_EXISTS',
      );
      expect(state.identities.filter((row) => row.provider === 'kakao')).toHaveLength(1);
    });
  });
});

describe('AccountLinkService.linkApple', () => {
  const APPLE_DTO = { identityToken: 'a'.repeat(40), nonce: 'nonce-0123456789', authorizationCode: 'apple-auth-code' };
  const claims = (overrides: Record<string, unknown> = {}) => ({
    subject: 'apple-sub-1',
    audience: 'kr.co.teameet.app',
    email: null,
    emailVerified: false,
    isPrivateEmail: false,
    ...overrides,
  });

  it('verifies the identity token with its nonce, links the subject and keeps the refresh-token exchange', async () => {
    const { service, appleIdentity, appleTokens, state, notifications } = build(callerWithEmailLogin());
    appleIdentity.verifyIdentityToken.mockResolvedValue(claims());

    const result = await service.linkApple(CALLER, APPLE_DTO, 30);

    expect(appleIdentity.verifyIdentityToken).toHaveBeenCalledWith(APPLE_DTO.identityToken, APPLE_DTO.nonce);
    expect(result).toEqual({ provider: 'apple', alreadyLinked: false, mergedPendingAccount: false, authProviders: ['email', 'apple'] });
    expect(state.identities.find((row) => row.provider === 'apple')).toMatchObject({ userId: CALLER, providerUserKey: 'apple-sub-1' });
    expect(state.logs[0]).toMatchObject({ reason: 'account_link:apple' });
    expect(appleTokens.storeFromAuthorizationCode).toHaveBeenCalledWith({
      subject: 'apple-sub-1',
      clientId: 'kr.co.teameet.app',
      authorizationCode: 'apple-auth-code',
    });
    expect(notifications.createInTransaction).toHaveBeenCalledWith(expect.anything(), CALLER, 'social_identity_linked', expect.objectContaining({ vars: { name: 'Apple' } }));
  });

  it('stores the Apple email only when verified, and skips the token exchange without a code', async () => {
    const verified = build(callerWithEmailLogin());
    verified.appleIdentity.verifyIdentityToken.mockResolvedValue(claims({ email: 'Me@Privaterelay.AppleID.com', emailVerified: true }));
    await verified.service.linkApple(CALLER, { ...APPLE_DTO, authorizationCode: undefined }, null);
    expect(verified.state.identities.find((row) => row.provider === 'apple')?.email).toBe('me@privaterelay.appleid.com');
    expect(verified.appleTokens.storeFromAuthorizationCode).not.toHaveBeenCalled();

    const unverified = build(callerWithEmailLogin());
    unverified.appleIdentity.verifyIdentityToken.mockResolvedValue(claims({ email: 'me@example.test', emailVerified: false }));
    await unverified.service.linkApple(CALLER, APPLE_DTO, null);
    expect(unverified.state.identities.find((row) => row.provider === 'apple')?.email).toBeNull();
  });

  it('moves an Apple identity off an empty signup the same way', async () => {
    const seed = withEmptySignup('social_profile_deferred', { identity: { provider: 'apple', providerUserKey: 'apple-sub-1' } });
    const { service, appleIdentity, state } = build(seed);
    appleIdentity.verifyIdentityToken.mockResolvedValue(claims());

    expect(await service.linkApple(CALLER, APPLE_DTO, null)).toMatchObject({ provider: 'apple', mergedPendingAccount: true });
    expect(state.identities.find((row) => row.id === 'kakao-on-empty')).toMatchObject({ userId: CALLER, provider: 'apple' });
  });

  it('refuses an old session and a forged token without writing', async () => {
    const old = build(callerWithEmailLogin());
    expect(await failure(old.service.linkApple(CALLER, APPLE_DTO, RECENT_LOGIN_MAX_AGE_SECONDS + 1))).toMatchObject({ code: 'RECENT_LOGIN_REQUIRED' });
    expect(old.appleIdentity.verifyIdentityToken).not.toHaveBeenCalled();

    const forged = build(callerWithEmailLogin());
    forged.appleIdentity.verifyIdentityToken.mockRejectedValue(new Error('Apple login failed'));
    await expect(forged.service.linkApple(CALLER, APPLE_DTO, null)).rejects.toThrow('Apple login failed');
    expect(forged.state.identities).toHaveLength(1);
    expect(forged.appleTokens.storeFromAuthorizationCode).not.toHaveBeenCalled();
  });
});

describe('AccountLinkService.linkPending', () => {
  const verifiedKakao: SocialLinkClaims = { kind: 'verified_identity', provider: 'kakao', providerUserKey: KAKAO_KEY, email: 'me@example.test' };
  const pendingKakao = (pendingUserId = EMPTY): SocialLinkClaims => ({ kind: 'pending_account', provider: 'kakao', providerUserKey: KAKAO_KEY, pendingUserId });
  /** A token for `claims` that the accounts in `targets` (the collided-with members) may spend. */
  const tokenOf = (claims: SocialLinkClaims, targets: string[] = [CALLER], nowMs?: number) => ({ linkToken: issueSocialLinkToken(claims, targets, nowMs) });

  describe('a token for an identity no account holds yet', () => {
    it('attaches it to the account that just signed in, with the verified email, a log and a notification', async () => {
      const { service, state, notifications, auth, appleIdentity } = build(callerWithEmailLogin());

      const result = await service.linkPending(CALLER, tokenOf(verifiedKakao), 60);

      expect(result).toEqual({ provider: 'kakao', alreadyLinked: false, mergedPendingAccount: false, authProviders: ['email', 'kakao'] });
      expect(state.identities.find((row) => row.provider === 'kakao')).toMatchObject({ userId: CALLER, providerUserKey: KAKAO_KEY, email: 'me@example.test' });
      expect(state.logs[0]).toMatchObject({ reason: 'account_link:kakao', actorUserId: CALLER });
      expect(notifications.createInTransaction).toHaveBeenCalledTimes(1);
      expect(notifications.deliverCreated).toHaveBeenCalledTimes(1);
      // No new proof is asked of the provider: the token already is the proof.
      expect(auth.fetchKakaoProfileForToken).not.toHaveBeenCalled();
      expect(appleIdentity.verifyIdentityToken).not.toHaveBeenCalled();
    });

    it('works with the token exactly as a conflict response hands it out', async () => {
      const { details } = signInThenLinkConflict('SOCIAL_LINK_REQUIRES_VERIFIED_EMAIL', verifiedKakao, [CALLER]).getResponse() as { details: { linkToken: string } };
      const { service, state } = build(callerWithEmailLogin());

      await expect(service.linkPending(CALLER, { linkToken: details.linkToken }, null)).resolves.toMatchObject({ provider: 'kakao', alreadyLinked: false });
      expect(state.identities.some((row) => row.provider === 'kakao' && row.userId === CALLER)).toBe(true);
    });

    it('moves it off an abandoned signup that has taken it in the meantime', async () => {
      const { service, state } = build(withEmptySignup('social_profile_required'));

      const result = await service.linkPending(CALLER, tokenOf(verifiedKakao), null);

      expect(result).toMatchObject({ mergedPendingAccount: true });
      expect(state.identities.find((row) => row.id === 'kakao-on-empty')?.userId).toBe(CALLER);
      expect(state.users.find((row) => row.id === EMPTY)?.accountStatus).toBe('deleted');
    });

    it('refuses it when a real account has taken it, and when this account has another login of that provider', async () => {
      const taken = build({ users: [user(CALLER), user('user-real-owner')], identities: [emailLogin(CALLER), identity('kakao-owned', 'user-real-owner', 'kakao', KAKAO_KEY)] });
      expect(await failure(taken.service.linkPending(CALLER, tokenOf(verifiedKakao), null))).toMatchObject({ code: 'SOCIAL_LINK_PROVIDER_IN_USE' });
      expect(taken.state.identities.find((row) => row.id === 'kakao-owned')?.userId).toBe('user-real-owner');

      const other = build({ users: [user(CALLER)], identities: [emailLogin(CALLER), identity('kakao-own', CALLER, 'kakao', 'someone-elses-kakao')] });
      expect(await failure(other.service.linkPending(CALLER, tokenOf(verifiedKakao), null))).toMatchObject({ code: 'SOCIAL_LINK_PROVIDER_EXISTS' });
    });

    it('lets exactly one of two accounts that both may spend a token spend it', async () => {
      const { service, state } = build({ users: [user(CALLER), user(OTHER_CALLER)], identities: [emailLogin(CALLER), emailLogin(OTHER_CALLER)] });
      const token = tokenOf(verifiedKakao, [CALLER, OTHER_CALLER]);

      const settled = await Promise.allSettled([service.linkPending(CALLER, token, null), service.linkPending(OTHER_CALLER, token, null)]);

      expect(settled.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
      expect(state.identities.filter((row) => row.provider === 'kakao')).toHaveLength(1);
    });
  });

  describe('a token for the login of an unfinished signup that stopped on a number conflict', () => {
    it('moves that login to the account that just signed in and retires the signup', async () => {
      const { service, state, realtime } = build(withEmptySignup('social_profile_required'));
      state.inquiries.push({ id: 'inquiry-1', userId: EMPTY });

      const result = await service.linkPending(CALLER, tokenOf(pendingKakao()), 90);

      expect(result).toEqual({ provider: 'kakao', alreadyLinked: false, mergedPendingAccount: true, authProviders: ['email', 'kakao'] });
      expect(state.identities.find((row) => row.id === 'kakao-on-empty')?.userId).toBe(CALLER);
      expect(state.users.find((row) => row.id === EMPTY)).toMatchObject({ accountStatus: 'deleted', phone: `deleted-${EMPTY}` });
      expect(state.inquiries).toEqual([{ id: 'inquiry-1', userId: CALLER }]);
      expect(realtime.forceDisconnectUser).toHaveBeenCalledWith(EMPTY);
    });

    it('answers a second use by the same account as already linked', async () => {
      const { service, state } = build(withEmptySignup('social_profile_required'));
      const token = tokenOf(pendingKakao());
      await service.linkPending(CALLER, token, null);

      expect(await service.linkPending(CALLER, token, null)).toMatchObject({ alreadyLinked: true, mergedPendingAccount: false });
      expect(state.identities.filter((row) => row.provider === 'kakao')).toHaveLength(1);
    });

    // The signup is what the token vouches for; once it is a real account the login is no longer free to move.
    it('refuses when that signup has become a real account in the meantime', async () => {
      const { service, state } = build(withEmptySignup('completed'));

      expect(await failure(service.linkPending(CALLER, tokenOf(pendingKakao()), null))).toMatchObject({ code: 'SOCIAL_LINK_PROVIDER_IN_USE' });
      expect(state.identities.find((row) => row.id === 'kakao-on-empty')?.userId).toBe(EMPTY);
      expect(state.users.find((row) => row.id === EMPTY)?.accountStatus).toBe('active');
    });

    it('refuses when the login has moved to some other account since', async () => {
      const seed = withEmptySignup('social_profile_required');
      seed.users.push(user('user-someone-else'));
      seed.identities.find((row) => row.id === 'kakao-on-empty')!.userId = 'user-someone-else';
      const { service, state } = build(seed);

      expect(await failure(service.linkPending(CALLER, tokenOf(pendingKakao()), null))).toMatchObject({ code: 'SOCIAL_LINK_PROVIDER_IN_USE' });
      expect(state.identities.find((row) => row.id === 'kakao-on-empty')?.userId).toBe('user-someone-else');
    });

    it('is invalid once the login is gone, and does not create one from the token', async () => {
      const { service, state } = build(callerWithEmailLogin());

      expect(await failure(service.linkPending(CALLER, tokenOf(pendingKakao()), null))).toMatchObject({ code: 'SOCIAL_LINK_TOKEN_INVALID' });
      expect(state.identities).toHaveLength(1);
    });

    it('does not let a token for one signup move a login held by another signup', async () => {
      const { service, state } = build(withEmptySignup('social_profile_required'));

      expect(await failure(service.linkPending(CALLER, tokenOf(pendingKakao('user-some-other-signup')), null))).toMatchObject({ code: 'SOCIAL_LINK_PROVIDER_IN_USE' });
      expect(state.identities.find((row) => row.id === 'kakao-on-empty')?.userId).toBe(EMPTY);
    });
  });

  // The token is a bearer value: whoever is signed in when it is spent is who it attaches to. It therefore names the
  // accounts it may go to, and anybody else's session is refused.
  describe('a session of an account the token was not issued for', () => {
    const otherMember = () => ({
      users: [user(CALLER), user(OTHER_CALLER)],
      identities: [emailLogin(CALLER), emailLogin(OTHER_CALLER)],
    });

    it.each([
      ['an unclaimed identity', () => tokenOf(verifiedKakao, [CALLER])],
      ['a login on an unfinished signup', () => tokenOf(pendingKakao(), [CALLER])],
    ])('is refused for %s, with nothing created or moved', async (_name, makeToken) => {
      const seed = withEmptySignup('social_profile_required');
      seed.users.push(user(OTHER_CALLER));
      seed.identities.push(emailLogin(OTHER_CALLER));
      const { service, state, notifications, realtime } = build(seed);
      const before = JSON.stringify([state.users, state.identities]);

      const refused = await failure(service.linkPending(OTHER_CALLER, makeToken(), null));

      expect(refused).toMatchObject({
        code: 'SOCIAL_LINK_TOKEN_ACCOUNT_MISMATCH',
        message: '안내받은 계정과 다른 계정으로 로그인했어요. 설정 › 로그인 방법에서 직접 연결할 수 있어요.',
      });
      expect(JSON.stringify([state.users, state.identities])).toBe(before);
      expect(state.logs).toHaveLength(0);
      expect(notifications.createInTransaction).not.toHaveBeenCalled();
      expect(realtime.forceDisconnectUser).not.toHaveBeenCalled();
    });

    it('does not say which account the token was for', async () => {
      const { service } = build(otherMember());

      const refused = await failure(service.linkPending(OTHER_CALLER, tokenOf(verifiedKakao, [CALLER]), null));

      expect(JSON.stringify(refused)).not.toContain(CALLER);
    });

    it('is refused even when the identity is free and the session is perfectly recent', async () => {
      const { service, state } = build(otherMember());

      expect(await failure(service.linkPending(OTHER_CALLER, tokenOf(verifiedKakao, [CALLER]), 1))).toMatchObject({ code: 'SOCIAL_LINK_TOKEN_ACCOUNT_MISMATCH' });
      expect(state.identities.some((row) => row.provider === 'kakao')).toBe(false);
    });

    it('is accepted for the account it was issued for, whichever of several candidates signs in', async () => {
      for (const signedInAs of [CALLER, OTHER_CALLER]) {
        const { service, state } = build(otherMember());

        await expect(service.linkPending(signedInAs, tokenOf(verifiedKakao, [CALLER, OTHER_CALLER]), null)).resolves.toMatchObject({ alreadyLinked: false });
        expect(state.identities.find((row) => row.provider === 'kakao')?.userId).toBe(signedInAs);
      }
    });

    it('does not widen to a third account when two candidates were named', async () => {
      const seed = otherMember();
      seed.users.push(user('user-third'));
      seed.identities.push(emailLogin('user-third'));
      const { service } = build(seed);

      expect(await failure(service.linkPending('user-third', tokenOf(verifiedKakao, [CALLER, OTHER_CALLER]), null))).toMatchObject({
        code: 'SOCIAL_LINK_TOKEN_ACCOUNT_MISMATCH',
      });
    });
  });

  describe('tokens that are not good', () => {
    const past = Date.now() - 31 * 60 * 1000;
    it.each([
      ['a forged value', () => ({ linkToken: 'not-a-link-token-at-all-but-long-enough' })],
      ['an expired token', () => tokenOf(verifiedKakao, [CALLER], past)],
      ['a token with its signature cut', () => ({ linkToken: issueSocialLinkToken(verifiedKakao, [CALLER]).slice(0, -3) })],
    ])('answers %s with SOCIAL_LINK_TOKEN_INVALID and writes nothing', async (_name, makeDto) => {
      const { service, state, notifications } = build(callerWithEmailLogin());

      expect(await failure(service.linkPending(CALLER, makeDto(), null))).toMatchObject({ code: 'SOCIAL_LINK_TOKEN_INVALID' });
      expect(state.identities).toHaveLength(1);
      expect(state.logs).toHaveLength(0);
      expect(notifications.createInTransaction).not.toHaveBeenCalled();
      expect(notifications.deliverCreated).not.toHaveBeenCalled();
    });

    it('does not take a token signed for another purpose', async () => {
      const { service } = build(callerWithEmailLogin());
      const phoneProof = issuePhoneProofToken('01012345678');

      expect(await failure(service.linkPending(CALLER, { linkToken: phoneProof }, null))).toMatchObject({ code: 'SOCIAL_LINK_TOKEN_INVALID' });
    });
  });

  describe('who may call', () => {
    it('asks for a recent login before it looks at the token', async () => {
      const { service, state } = build(callerWithEmailLogin());

      expect(await failure(service.linkPending(CALLER, tokenOf(verifiedKakao), RECENT_LOGIN_MAX_AGE_SECONDS + 1))).toMatchObject({
        code: 'RECENT_LOGIN_REQUIRED',
        details: { maxAgeSeconds: 1800 },
      });
      expect(state.identities).toHaveLength(1);
    });

    it('keeps a caller whose own signup is unfinished out', async () => {
      const { service, state } = build({ users: [user(CALLER, { onboardingStatus: 'social_profile_required' })], identities: [identity('login-pending', CALLER, 'apple', 'apple-sub')] });

      expect(await failure(service.linkPending(CALLER, tokenOf(verifiedKakao), null))).toMatchObject({ code: 'SIGNUP_INCOMPLETE' });
      expect(state.identities).toHaveLength(1);
    });
  });
});
