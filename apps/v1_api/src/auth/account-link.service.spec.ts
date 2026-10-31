import { Prisma } from '@prisma/client';
import {
  createFakePrisma,
  type FakeIdentity,
  type FakeUser,
} from '../../test/helpers/account-link-fake-prisma';
import { AccountLinkService, RECENT_LOGIN_MAX_AGE_SECONDS } from './account-link.service';
import type { AuthService, KakaoProfile } from './auth.service';

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
  const notifications = { emitNotification: jest.fn().mockResolvedValue(undefined) };
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
    expect(notifications.emitNotification).toHaveBeenCalledWith(CALLER, 'social_identity_linked', null, undefined, {
      vars: { name: '카카오' },
      businessKey: `social-link:${added?.id}`,
    });
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
      expect(notifications.emitNotification).not.toHaveBeenCalled();
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
      expect(notifications.emitNotification).not.toHaveBeenCalled();
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

    it('accepts a session exactly at the limit, and a header identity that has no session age', async () => {
      const atLimit = build(callerWithEmailLogin());
      await expect(atLimit.service.linkKakao(CALLER, TOKEN_FORM, RECENT_LOGIN_MAX_AGE_SECONDS)).resolves.toMatchObject({ alreadyLinked: false });

      const headerIdentity = build(callerWithEmailLogin());
      await expect(headerIdentity.service.linkKakao(CALLER, TOKEN_FORM, null)).resolves.toMatchObject({ alreadyLinked: false });
    });
  });

  describe('side effects after the link is stored', () => {
    it('still succeeds when the notification cannot be created', async () => {
      const { service, state, notifications } = build(callerWithEmailLogin());
      notifications.emitNotification.mockRejectedValue(new Error('push provider down'));

      await expect(service.linkKakao(CALLER, TOKEN_FORM, null)).resolves.toMatchObject({ alreadyLinked: false });
      expect(state.identities.some((row) => row.provider === 'kakao')).toBe(true);
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
    expect(notifications.emitNotification).toHaveBeenCalledWith(CALLER, 'social_identity_linked', null, undefined, expect.objectContaining({ vars: { name: 'Apple' } }));
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
