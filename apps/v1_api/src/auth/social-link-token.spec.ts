import { createHmac } from 'node:crypto';
import { issueEmailProofToken } from '../verification/email-proof-token';
import { issuePhoneProofToken, verifyPhoneProofToken } from '../verification/phone-proof-token';
import { SOCIAL_LINK_TOKEN_TTL_SECONDS, isLinkableSocialProvider, issueSocialLinkToken, readSocialLinkToken, type SocialLinkClaims } from './social-link-token';

const SECRET = 'x'.repeat(48);
const NOW = Date.UTC(2026, 9, 31, 4, 0, 0);

const VERIFIED: SocialLinkClaims = { kind: 'verified_identity', provider: 'kakao', providerUserKey: 'kakao-key-1', email: 'me@example.test' };
const PENDING: SocialLinkClaims = { kind: 'pending_account', provider: 'apple', providerUserKey: 'apple-sub-1', pendingUserId: 'user-pending' };

function signedToken(payload: string, secret = SECRET) {
  return `${Buffer.from(payload).toString('base64url')}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
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

  it('lives for ten minutes', () => {
    expect(SOCIAL_LINK_TOKEN_TTL_SECONDS).toBe(600);
  });

  it.each([
    ['a verified identity', VERIFIED],
    ['a verified identity without an email', { ...VERIFIED, email: null }],
    ['an unfinished signup account', PENDING],
  ])('returns the claims of %s', (_name, claims) => {
    expect(readSocialLinkToken(issueSocialLinkToken(claims, NOW), NOW + 1_000)).toEqual(claims);
  });

  it('expires after the lifetime', () => {
    const token = issueSocialLinkToken(VERIFIED, NOW);
    expect(readSocialLinkToken(token, NOW + 10 * 60 * 1000 - 1)).toEqual(VERIFIED);
    expect(readSocialLinkToken(token, NOW + 10 * 60 * 1000 + 1)).toBeNull();
  });

  it('rejects a token signed with another secret and a token whose content was altered', () => {
    const token = issueSocialLinkToken(VERIFIED, NOW);
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
    const token = issueSocialLinkToken(VERIFIED, NOW);
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
    const token = issueSocialLinkToken(VERIFIED, NOW);
    expect(verifyPhoneProofToken(token, '01012345678', 'signup', NOW)).toBe(false);
    expect(verifyPhoneProofToken(token, '01012345678', 'password_reset', NOW)).toBe(false);
  });

  it.each([
    ['not a token', 'garbage'],
    ['an empty string', ''],
    ['a payload of another purpose with a valid signature', signedToken(`other_purpose:${Buffer.from('["verified_identity","kakao","k",null]').toString('base64url')}:${NOW + 60_000}`)],
    ['an unknown claim kind', signedToken(`social_link_pending:${Buffer.from('["something","kakao","k",null]').toString('base64url')}:${NOW + 60_000}`)],
    ['a provider that cannot be linked', signedToken(`social_link_pending:${Buffer.from('["verified_identity","email","k",null]').toString('base64url')}:${NOW + 60_000}`)],
    ['a pending account without its user id', signedToken(`social_link_pending:${Buffer.from('["pending_account","kakao","k",""]').toString('base64url')}:${NOW + 60_000}`)],
    ['claims that are not JSON', signedToken(`social_link_pending:${Buffer.from('not json').toString('base64url')}:${NOW + 60_000}`)],
    ['extra claims', signedToken(`social_link_pending:${Buffer.from('["verified_identity","kakao","k",null,"extra"]').toString('base64url')}:${NOW + 60_000}`)],
  ])('rejects %s', (_name, token) => {
    expect(readSocialLinkToken(token, NOW)).toBeNull();
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
