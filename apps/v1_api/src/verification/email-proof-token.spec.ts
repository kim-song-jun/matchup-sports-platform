import { issueEmailProofToken, verifyEmailProofToken } from './email-proof-token';
import { issuePhoneProofToken, verifyPhoneProofToken } from './phone-proof-token';

const EMAIL = 'runner@example.com';
const PHONE = '01012345678';

describe('email-proof-token', () => {
  const OLD = process.env.V1_SESSION_SECRET;
  beforeEach(() => {
    process.env.V1_SESSION_SECRET = 'x'.repeat(48);
  });
  afterEach(() => {
    process.env.V1_SESSION_SECRET = OLD;
  });

  it('같은 주소로 발급한 토큰은 통과한다', () => {
    expect(verifyEmailProofToken(issueEmailProofToken(EMAIL), EMAIL)).toBe(true);
  });

  it('다른 주소로 발급된 토큰은 통하지 않는다', () => {
    const token = issueEmailProofToken('other@example.com');
    expect(verifyEmailProofToken(token, EMAIL)).toBe(false);
  });

  it('만료된 토큰은 거부한다', () => {
    const past = Date.now() - 20 * 60 * 1000;
    const token = issueEmailProofToken(EMAIL, 'password_reset', past);
    expect(verifyEmailProofToken(token, EMAIL)).toBe(false);
  });

  // 사용자가 대문자로 입력했다고 증명이 깨지면 안 된다 — 계정 조회와 같은 표준형을 써야 한다.
  it('대소문자·앞뒤 공백이 달라도 같은 주소로 본다', () => {
    const token = issueEmailProofToken('  Runner@Example.COM ');
    expect(verifyEmailProofToken(token, EMAIL)).toBe(true);
    expect(verifyEmailProofToken(issueEmailProofToken(EMAIL), 'RUNNER@EXAMPLE.COM')).toBe(true);
  });

  it('서명이 변조되면 거부한다', () => {
    const token = issueEmailProofToken(EMAIL);
    expect(verifyEmailProofToken(`${token.slice(0, -2)}xy`, EMAIL)).toBe(false);
  });

  it('형식이 깨진 토큰은 거부한다', () => {
    expect(verifyEmailProofToken('', EMAIL)).toBe(false);
    expect(verifyEmailProofToken('nodot', EMAIL)).toBe(false);
  });

  it('시크릿이 없으면 검증은 무조건 거부한다', () => {
    const token = issueEmailProofToken(EMAIL);
    process.env.V1_SESSION_SECRET = '';
    process.env.V1_JWT_SECRET = '';
    process.env.JWT_SECRET = '';
    expect(verifyEmailProofToken(token, EMAIL)).toBe(false);
  });

  /**
   * 이 기능의 보안 핵심. 두 채널은 같은 시크릿으로 서명되므로, 페이로드가 갈려 있지 않으면
   * "가입하려고 받은 휴대폰 증명"으로 남의 비밀번호를 이메일 경로에서 재설정할 수 있다.
   */
  describe('채널 교차 사용 차단', () => {
    it('휴대폰 증명(가입용·재설정용 모두)은 이메일 검증을 통과하지 못한다', () => {
      const signupToken = issuePhoneProofToken(PHONE);
      const resetToken = issuePhoneProofToken(PHONE, 'password_reset');

      // 증명에 묶인 값을 그대로 이메일 자리에 넣어 봐도(최악의 시나리오) 통하지 않아야 한다.
      expect(verifyEmailProofToken(signupToken, PHONE)).toBe(false);
      expect(verifyEmailProofToken(resetToken, PHONE)).toBe(false);
      expect(verifyEmailProofToken(resetToken, EMAIL)).toBe(false);
    });

    it('이메일 증명은 휴대폰 검증을 통과하지 못한다', () => {
      const emailToken = issueEmailProofToken(EMAIL);

      expect(verifyPhoneProofToken(emailToken, EMAIL, 'password_reset')).toBe(false);
      expect(verifyPhoneProofToken(emailToken, EMAIL, 'signup')).toBe(false);
      expect(verifyPhoneProofToken(emailToken, PHONE, 'password_reset')).toBe(false);
    });

    it('페이로드 맨 앞의 채널 라벨이 두 계열을 가른다', () => {
      const payload = Buffer.from(issueEmailProofToken(EMAIL).split('.')[0], 'base64url').toString('utf8');
      expect(payload).toBe(`email:password_reset:${EMAIL}:${payload.split(':').at(-1)}`);
    });
  });
});
