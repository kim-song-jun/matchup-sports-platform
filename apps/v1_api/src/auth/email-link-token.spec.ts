import { issueEmailProofToken } from '../verification/email-proof-token';
import { issuePhoneProofToken } from '../verification/phone-proof-token';
import { EMAIL_LINK_TOKEN_TTL_SECONDS, issueEmailLinkToken, readEmailLinkToken } from './email-link-token';
import { issueSocialLinkToken } from './social-link-token';
import { verifyEmailProofToken } from '../verification/email-proof-token';

const savedSessionSecret = process.env.V1_SESSION_SECRET;
beforeAll(() => {
  process.env.V1_SESSION_SECRET = 'x'.repeat(48);
});
afterAll(() => {
  if (savedSessionSecret === undefined) delete process.env.V1_SESSION_SECRET;
  else process.env.V1_SESSION_SECRET = savedSessionSecret;
});

const NOW = Date.UTC(2026, 10, 1, 12, 0, 0);
const MINUTE = 60_000;

describe('email link token', () => {
  it('lives ten minutes and names the address it vouches for', () => {
    const token = issueEmailLinkToken('user-a', 'Runner@Example.com', NOW);

    expect(EMAIL_LINK_TOKEN_TTL_SECONDS).toBe(600);
    expect(readEmailLinkToken(token, 'user-a', NOW + 9 * MINUTE)).toBe('runner@example.com');
    expect(readEmailLinkToken(token, 'user-a', NOW + 10 * MINUTE + 1)).toBeNull();
  });

  it('is only good for the account it was issued to', () => {
    const token = issueEmailLinkToken('user-a', 'runner@example.com', NOW);

    expect(readEmailLinkToken(token, 'user-b', NOW)).toBeNull();
  });

  it('does not carry the account id in the clear', () => {
    const token = issueEmailLinkToken('user-account-id-123', 'runner@example.com', NOW);

    expect(Buffer.from(token.split('.')[0], 'base64url').toString('utf8')).not.toContain('user-account-id-123');
  });

  it('rejects a payload whose address was swapped, even with the signature of another token', () => {
    const [, signature] = issueEmailLinkToken('user-a', 'runner@example.com', NOW).split('.');
    const [forgedPayload] = issueEmailLinkToken('user-a', 'victim@example.com', NOW).split('.');

    expect(readEmailLinkToken(`${forgedPayload}.${signature}`, 'user-a', NOW)).toBeNull();
  });

  it('rejects garbage, a missing signature and an empty address', () => {
    const empty = Buffer.from(`email_login_link:digest::${NOW + MINUTE}`).toString('base64url');

    expect(readEmailLinkToken('', 'user-a', NOW)).toBeNull();
    expect(readEmailLinkToken('not-a-token', 'user-a', NOW)).toBeNull();
    expect(readEmailLinkToken(`${empty}.sig`, 'user-a', NOW)).toBeNull();
  });

  it('survives a quoted local part that contains a colon', () => {
    const token = issueEmailLinkToken('user-a', '"a:b"@example.com', NOW);

    expect(readEmailLinkToken(token, 'user-a', NOW)).toBe('"a:b"@example.com');
  });

  it('does not accept the other proof tokens, and they do not accept it', () => {
    const link = issueEmailLinkToken('user-a', 'runner@example.com', NOW);

    expect(readEmailLinkToken(issueEmailProofToken('runner@example.com', 'password_reset', NOW), 'user-a', NOW)).toBeNull();
    expect(readEmailLinkToken(issuePhoneProofToken('01012345678', 'password_reset', NOW), 'user-a', NOW)).toBeNull();
    expect(
      readEmailLinkToken(
        issueSocialLinkToken({ kind: 'verified_identity', provider: 'kakao', providerUserKey: 'k', email: null }, ['user-a'], NOW),
        'user-a',
        NOW,
      ),
    ).toBeNull();
    expect(verifyEmailProofToken(link, 'runner@example.com', 'password_reset', NOW)).toBe(false);
  });
});
