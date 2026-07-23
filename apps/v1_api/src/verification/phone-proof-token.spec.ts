import { issuePhoneProofToken, verifyPhoneProofToken } from './phone-proof-token';

describe('phone-proof-token', () => {
  const OLD = process.env.V1_SESSION_SECRET;
  beforeEach(() => { process.env.V1_SESSION_SECRET = 'x'.repeat(48); });
  afterEach(() => { process.env.V1_SESSION_SECRET = OLD; });

  it('round-trips a token for the same phone', () => {
    const token = issuePhoneProofToken('01012345678');
    expect(verifyPhoneProofToken(token, '01012345678')).toBe(true);
  });

  it('rejects a token used for a different phone', () => {
    const token = issuePhoneProofToken('01012345678');
    expect(verifyPhoneProofToken(token, '01099998888')).toBe(false);
  });

  it('rejects an expired token', () => {
    const past = Date.now() - 20 * 60 * 1000;
    const token = issuePhoneProofToken('01012345678', past);
    expect(verifyPhoneProofToken(token, '01012345678')).toBe(false);
  });

  it('rejects a tampered signature', () => {
    const token = issuePhoneProofToken('01012345678');
    const tampered = `${token.slice(0, -2)}xy`;
    expect(verifyPhoneProofToken(tampered, '01012345678')).toBe(false);
  });

  it('rejects malformed tokens', () => {
    expect(verifyPhoneProofToken('', '01012345678')).toBe(false);
    expect(verifyPhoneProofToken('nodot', '01012345678')).toBe(false);
  });
});
