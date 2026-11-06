import { issueEmailLinkToken } from '../auth/email-link-token';
import { issueEmailProofToken } from '../verification/email-proof-token';
import { issuePhoneProofToken } from '../verification/phone-proof-token';
import { EMAIL_CHANGE_TOKEN_TTL_SECONDS, issueEmailChangeToken, readEmailChangeToken } from './email-change-token';

const savedSessionSecret = process.env.V1_SESSION_SECRET;
beforeAll(() => {
  process.env.V1_SESSION_SECRET = 'x'.repeat(48);
});
afterAll(() => {
  if (savedSessionSecret === undefined) delete process.env.V1_SESSION_SECRET;
  else process.env.V1_SESSION_SECRET = savedSessionSecret;
});

const NOW = Date.UTC(2026, 10, 6, 12, 0, 0);
const MINUTE = 60_000;

describe('email change token', () => {
  it('lives ten minutes and names the address it vouches for', () => {
    const token = issueEmailChangeToken('user-a', 'Runner@Example.com', NOW);

    expect(EMAIL_CHANGE_TOKEN_TTL_SECONDS).toBe(600);
    expect(readEmailChangeToken(token, 'user-a', NOW + 9 * MINUTE)).toBe('runner@example.com');
    expect(readEmailChangeToken(token, 'user-a', NOW + 10 * MINUTE + 1)).toBeNull();
  });

  it('is only good for the account it was issued to', () => {
    const token = issueEmailChangeToken('user-a', 'runner@example.com', NOW);

    expect(readEmailChangeToken(token, 'user-b', NOW)).toBeNull();
  });

  it('does not carry the account id in the clear', () => {
    const token = issueEmailChangeToken('user-account-id-123', 'runner@example.com', NOW);

    expect(Buffer.from(token.split('.')[0], 'base64url').toString('utf8')).not.toContain('user-account-id-123');
  });

  it('rejects a payload whose address was swapped, even with the signature of another token', () => {
    const [, signature] = issueEmailChangeToken('user-a', 'runner@example.com', NOW).split('.');
    const [forgedPayload] = issueEmailChangeToken('user-a', 'victim@example.com', NOW).split('.');

    expect(readEmailChangeToken(`${forgedPayload}.${signature}`, 'user-a', NOW)).toBeNull();
  });

  it('rejects garbage, a missing signature and an empty address', () => {
    const empty = Buffer.from(`email_change:digest::${NOW + MINUTE}`).toString('base64url');

    expect(readEmailChangeToken('', 'user-a', NOW)).toBeNull();
    expect(readEmailChangeToken('not-a-token', 'user-a', NOW)).toBeNull();
    expect(readEmailChangeToken(`${empty}.sig`, 'user-a', NOW)).toBeNull();
  });

  it('does not accept the other proof tokens, and they do not accept it', () => {
    const change = issueEmailChangeToken('user-a', 'runner@example.com', NOW);

    expect(readEmailChangeToken(issueEmailLinkToken('user-a', 'runner@example.com', NOW), 'user-a', NOW)).toBeNull();
    expect(readEmailChangeToken(issueEmailProofToken('runner@example.com', 'password_reset', NOW), 'user-a', NOW)).toBeNull();
    expect(readEmailChangeToken(issuePhoneProofToken('01012345678', 'password_reset', NOW), 'user-a', NOW)).toBeNull();
    // The same secret signs both, so the purpose segment is the only thing keeping them apart.
    expect(issueEmailLinkToken('user-a', 'runner@example.com', NOW)).not.toBe(change);
  });
});
