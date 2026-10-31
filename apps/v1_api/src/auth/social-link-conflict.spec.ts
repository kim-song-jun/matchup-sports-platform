import { pendingAccountLinkClaims, signInThenLinkConflict } from './social-link-conflict';
import { readSocialLinkToken, type SocialLinkClaims } from './social-link-token';

describe('signInThenLinkConflict', () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.V1_SESSION_SECRET;
    process.env.V1_SESSION_SECRET = 'x'.repeat(48);
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.V1_SESSION_SECRET;
    else process.env.V1_SESSION_SECRET = saved;
  });

  it.each([
    ['kakao', '카카오'],
    ['apple', 'Apple'],
  ] as const)('tells a %s user that signing in to the original account links it automatically', (provider, label) => {
    const claims: SocialLinkClaims = { kind: 'verified_identity', provider, providerUserKey: `${provider}-key`, email: null };
    const error = signInThenLinkConflict('SOCIAL_LINK_REQUIRES_VERIFIED_EMAIL', claims);

    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toEqual({
      code: 'SOCIAL_LINK_REQUIRES_VERIFIED_EMAIL',
      message: `이미 팀밋 계정이 있어요. 원래 가입한 방법으로 로그인하면 ${label} 로그인이 자동으로 연결돼요.`,
      details: { next: 'sign_in_then_link', provider, linkToken: expect.any(String), linkTokenExpiresInSeconds: 600 },
    });
  });

  it('carries a token that reads back as exactly the claims the conflict was built from', () => {
    const claims: SocialLinkClaims = { kind: 'pending_account', provider: 'kakao', providerUserKey: 'kakao-key', pendingUserId: 'user-pending' };
    const { details } = signInThenLinkConflict('PHONE_CONFLICT', claims).getResponse() as { details: { linkToken: string } };

    expect(readSocialLinkToken(details.linkToken)).toEqual(claims);
  });

  it('keeps the code it is given', () => {
    const claims: SocialLinkClaims = { kind: 'verified_identity', provider: 'kakao', providerUserKey: 'k', email: null };
    expect(signInThenLinkConflict('PHONE_CONFLICT', claims).getResponse()).toMatchObject({ code: 'PHONE_CONFLICT' });
  });
});

describe('pendingAccountLinkClaims', () => {
  it('claims the first Kakao or Apple login of the unfinished signup, with that signup as the holder', () => {
    expect(
      pendingAccountLinkClaims('user-1', [
        { provider: 'email', providerUserKey: 'a@example.test' },
        { provider: 'apple', providerUserKey: 'apple-sub' },
      ]),
    ).toEqual({ kind: 'pending_account', provider: 'apple', providerUserKey: 'apple-sub', pendingUserId: 'user-1' });
  });

  it('has nothing to claim without a linkable login', () => {
    expect(pendingAccountLinkClaims('user-1', [{ provider: 'email', providerUserKey: 'a@example.test' }])).toBeNull();
    expect(pendingAccountLinkClaims('user-1', [])).toBeNull();
  });
});
