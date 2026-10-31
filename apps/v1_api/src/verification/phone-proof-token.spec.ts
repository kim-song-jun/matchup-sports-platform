import { issuePhoneProofToken, verifyPhoneProofToken } from './phone-proof-token';

describe('phone-proof-token', () => {
  // 원래 없던 값을 그대로 대입하면 문자열 "undefined" 가 남아 같은 worker 의 다른 테스트가
  // "시크릿이 있다"고 오인한다 — 없던 것은 delete 로 되돌린다.
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.V1_SESSION_SECRET;
    process.env.V1_SESSION_SECRET = 'x'.repeat(48);
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.V1_SESSION_SECRET;
    else process.env.V1_SESSION_SECRET = saved;
  });

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
    const token = issuePhoneProofToken('01012345678', 'signup', past);
    expect(verifyPhoneProofToken(token, '01012345678')).toBe(false);
  });

  // 용도가 페이로드에 없으면 "가입하려고 받은 증명"으로 남의 비밀번호를 재설정할 수 있다.
  it('용도가 다른 토큰은 서로 통하지 않는다', () => {
    const signupToken = issuePhoneProofToken('01012345678');
    const resetToken = issuePhoneProofToken('01012345678', 'password_reset');

    expect(verifyPhoneProofToken(signupToken, '01012345678', 'password_reset')).toBe(false);
    expect(verifyPhoneProofToken(resetToken, '01012345678', 'signup')).toBe(false);
    expect(verifyPhoneProofToken(resetToken, '01012345678', 'password_reset')).toBe(true);
  });

  // 기존 가입 토큰 형식은 그대로여야 배포 순간 진행 중이던 가입(TTL 10분)이 깨지지 않는다.
  it('signup 토큰은 기존 {phone}:{exp} 형식을 유지한다', () => {
    const token = issuePhoneProofToken('01012345678');
    const payload = Buffer.from(token.split('.')[0], 'base64url').toString('utf8');
    expect(payload).toMatch(/^01012345678:\d+$/);
  });

  // 가입 증명은 `{phone}:{exp}` 맨몸 형식이라, 번호 자리에 다른 토큰 계열의 페이로드 머리말을 넣으면 그 계열 토큰이 된다.
  it('refuses to issue or accept a bare signup proof for anything but digits', () => {
    expect(() => issuePhoneProofToken('withdrawal_cancel:u:1')).toThrow(/digit-only/);
    expect(() => issuePhoneProofToken('01012345678:extra')).toThrow(/digit-only/);
    expect(() => issuePhoneProofToken('01012345678', 'signup')).not.toThrow();
    expect(verifyPhoneProofToken(issuePhoneProofToken('01012345678'), 'withdrawal_cancel:u:1')).toBe(false);
    // 다른 용도는 맨 앞에 고정 용도 라벨이 붙어 번호 자리가 무엇이든 다른 계열과 겹치지 않는다.
    expect(() => issuePhoneProofToken('withdrawal_cancel:u:1', 'password_reset')).not.toThrow();
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
