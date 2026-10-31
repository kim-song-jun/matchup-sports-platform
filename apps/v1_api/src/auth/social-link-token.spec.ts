import { createHmac } from 'node:crypto';
import { issueEmailProofToken } from '../verification/email-proof-token';
import { issuePhoneProofToken, verifyPhoneProofToken } from '../verification/phone-proof-token';
import {
  SOCIAL_LINK_TOKEN_TTL_SECONDS,
  isLinkableSocialProvider,
  issueSocialLinkToken,
  readSocialLinkToken,
  socialLinkAccountDigest,
  type SocialLinkClaims,
} from './social-link-token';

const SECRET = 'x'.repeat(48);
const NOW = Date.UTC(2026, 9, 31, 4, 0, 0);

const VERIFIED: SocialLinkClaims = { kind: 'verified_identity', provider: 'kakao', providerUserKey: 'kakao-key-1', email: 'me@example.test' };
const PENDING: SocialLinkClaims = { kind: 'pending_account', provider: 'apple', providerUserKey: 'apple-sub-1', pendingUserId: 'user-pending' };
const OWNER = 'user-owner-1111';

function signedToken(payload: string, secret = SECRET) {
  return `${Buffer.from(payload).toString('base64url')}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}
function craftedToken(tuple: unknown[]) {
  return signedToken(`social_link_pending:${Buffer.from(JSON.stringify(tuple)).toString('base64url')}:${NOW + 60_000}`);
}
/** The signed payload and the claims inside it, both decoded, as anyone holding the token can read them. */
function visibleContent(token: string) {
  const payload = Buffer.from(token.split('.')[0], 'base64url').toString('utf8');
  const [, claims] = payload.split(':');
  return `${payload}\n${Buffer.from(claims, 'base64url').toString('utf8')}`;
}

describe('social link token', () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.V1_SESSION_SECRET;
    process.env.V1_SESSION_SECRET = SECRET;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.V1_SESSION_SECRET;
    else process.env.V1_SESSION_SECRET = saved;
  });

  it('lives for thirty minutes', () => {
    expect(SOCIAL_LINK_TOKEN_TTL_SECONDS).toBe(1800);
  });

  it('returns the identity and the digests of the accounts it may go to', () => {
    const token = issueSocialLinkToken(VERIFIED, [OWNER], NOW);

    expect(readSocialLinkToken(token, NOW + 1_000)).toEqual({ ...VERIFIED, allowedAccounts: [socialLinkAccountDigest(OWNER)] });
  });

  it('holds an unfinished signup as a digest too', () => {
    const token = issueSocialLinkToken(PENDING, [OWNER], NOW);

    expect(readSocialLinkToken(token, NOW)).toEqual({
      kind: 'pending_account',
      provider: 'apple',
      providerUserKey: 'apple-sub-1',
      pendingAccount: socialLinkAccountDigest('user-pending'),
      allowedAccounts: [socialLinkAccountDigest(OWNER)],
    });
  });

  it('names every candidate account once, and never an account id in the clear', () => {
    const token = issueSocialLinkToken(PENDING, [OWNER, 'user-other-2222', OWNER], NOW);

    expect(readSocialLinkToken(token, NOW)?.allowedAccounts).toEqual([
      socialLinkAccountDigest(OWNER),
      socialLinkAccountDigest('user-other-2222'),
    ]);
    const visible = visibleContent(token);
    for (const id of [OWNER, 'user-other-2222', 'user-pending']) expect(visible).not.toContain(id);
  });

  it('ties account digests to this secret and this purpose', () => {
    const digest = socialLinkAccountDigest(OWNER);
    expect(digest).not.toBe(socialLinkAccountDigest('user-other-2222'));
    expect(digest).not.toContain(OWNER);
    process.env.V1_SESSION_SECRET = 'y'.repeat(48);
    expect(socialLinkAccountDigest(OWNER)).not.toBe(digest);
  });

  it('is not issued without an account to go to', () => {
    expect(() => issueSocialLinkToken(VERIFIED, [], NOW)).toThrow();
  });

  it('expires after the lifetime', () => {
    const token = issueSocialLinkToken(VERIFIED, [OWNER], NOW);
    expect(readSocialLinkToken(token, NOW + 30 * 60 * 1000 - 1)).not.toBeNull();
    expect(readSocialLinkToken(token, NOW + 30 * 60 * 1000 + 1)).toBeNull();
  });

  // The longer lifetime is the link token's own: a finished phone check still has to be used within ten minutes.
  it('does not stretch the lifetime of the phone proofs it shares a secret with', () => {
    const at = NOW + 20 * 60 * 1000;
    expect(readSocialLinkToken(issueSocialLinkToken(VERIFIED, [OWNER], NOW), at)).not.toBeNull();
    expect(verifyPhoneProofToken(issuePhoneProofToken('01012345678', 'signup', NOW), '01012345678', 'signup', at)).toBe(false);
    expect(verifyPhoneProofToken(issuePhoneProofToken('01012345678', 'signup', NOW), '01012345678', 'signup', NOW + 10 * 60 * 1000 - 1)).toBe(true);
  });

  it('rejects a token signed with another secret and a token whose content was altered', () => {
    const token = issueSocialLinkToken(VERIFIED, [OWNER], NOW);
    process.env.V1_SESSION_SECRET = 'y'.repeat(48);
    expect(readSocialLinkToken(token, NOW)).toBeNull();
    process.env.V1_SESSION_SECRET = SECRET;

    const [payload, signature] = token.split('.');
    const [purpose, claims, exp] = Buffer.from(payload, 'base64url').toString('utf8').split(':');
    const otherClaims = Buffer.from(Buffer.from(claims, 'base64url').toString('utf8').replace('kakao-key-1', 'kakao-key-2')).toString('base64url');
    expect(otherClaims).not.toBe(claims);
    const altered = Buffer.from(`${purpose}:${otherClaims}:${exp}`).toString('base64url');
    expect(readSocialLinkToken(`${altered}.${signature}`, NOW)).toBeNull();
    expect(readSocialLinkToken(`${payload}.${signature.slice(0, -2)}xx`, NOW)).toBeNull();
  });

  it('is refused without a configured secret', () => {
    const token = issueSocialLinkToken(VERIFIED, [OWNER], NOW);
    process.env.V1_SESSION_SECRET = '';
    delete process.env.V1_JWT_SECRET;
    delete process.env.JWT_SECRET;
    expect(readSocialLinkToken(token, NOW)).toBeNull();
  });

  it('does not accept the phone or email proofs, which are signed with the same secret', () => {
    expect(readSocialLinkToken(issuePhoneProofToken('01012345678', 'signup', NOW), NOW)).toBeNull();
    expect(readSocialLinkToken(issuePhoneProofToken('01012345678', 'password_reset', NOW), NOW)).toBeNull();
    expect(readSocialLinkToken(issueEmailProofToken('me@example.test', 'password_reset', NOW), NOW)).toBeNull();
  });

  it('cannot be spent as a phone proof either', () => {
    const token = issueSocialLinkToken(VERIFIED, [OWNER], NOW);
    expect(verifyPhoneProofToken(token, '01012345678', 'signup', NOW)).toBe(false);
    expect(verifyPhoneProofToken(token, '01012345678', 'password_reset', NOW)).toBe(false);
  });

  it.each([
    ['not a token', () => 'garbage'],
    ['an empty string', () => ''],
    ['a payload of another purpose with a valid signature', () => signedToken(`other_purpose:${Buffer.from('["verified_identity","kakao","k",null,["d"]]').toString('base64url')}:${NOW + 60_000}`)],
    ['an unknown claim kind', () => craftedToken(['something', 'kakao', 'k', null, ['d']])],
    ['a provider that cannot be linked', () => craftedToken(['verified_identity', 'email', 'k', null, ['d']])],
    ['a pending account without its digest', () => craftedToken(['pending_account', 'kakao', 'k', '', ['d']])],
    ['claims that are not JSON', () => signedToken(`social_link_pending:${Buffer.from('not json').toString('base64url')}:${NOW + 60_000}`)],
    ['extra claims', () => craftedToken(['verified_identity', 'kakao', 'k', null, ['d'], 'extra'])],
    ['no allowed accounts', () => craftedToken(['verified_identity', 'kakao', 'k', null, []])],
    ['allowed accounts that are not a list', () => craftedToken(['verified_identity', 'kakao', 'k', null, 'd'])],
    ['an empty allowed digest', () => craftedToken(['verified_identity', 'kakao', 'k', null, ['']])],
    ['more allowed accounts than a conflict can have', () => craftedToken(['verified_identity', 'kakao', 'k', null, ['a', 'b', 'c', 'd', 'e']])],
    ['the shape from before accounts were bound', () => craftedToken(['verified_identity', 'kakao', 'k', null])],
  ])('rejects %s', (_name, makeToken) => {
    expect(readSocialLinkToken(makeToken(), NOW)).toBeNull();
  });

  it('accepts a hand-signed token of the right shape, which shows the rejections above are about content', () => {
    expect(readSocialLinkToken(craftedToken(['verified_identity', 'kakao', 'k', null, ['d']]), NOW)).toEqual({
      kind: 'verified_identity', provider: 'kakao', providerUserKey: 'k', email: null, allowedAccounts: ['d'],
    });
  });
});

describe('isLinkableSocialProvider', () => {
  it('accepts the two providers that can be linked while signed in and nothing else', () => {
    expect(isLinkableSocialProvider('kakao')).toBe(true);
    expect(isLinkableSocialProvider('apple')).toBe(true);
    expect(isLinkableSocialProvider('email')).toBe(false);
    expect(isLinkableSocialProvider('naver')).toBe(false);
  });
});
