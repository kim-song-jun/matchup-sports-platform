import { issueEmailProofToken, verifyEmailProofToken } from '../verification/email-proof-token';
import { issuePhoneProofToken, verifyPhoneProofToken } from '../verification/phone-proof-token';
import {
  issueWithdrawalCancelToken,
  readWithdrawalCancelToken,
  withdrawalPendingException,
} from './withdrawal-cancel-token';

describe('withdrawal cancel token', () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.V1_SESSION_SECRET;
    process.env.V1_SESSION_SECRET = 'x'.repeat(48);
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.V1_SESSION_SECRET;
    else process.env.V1_SESSION_SECRET = saved;
  });

  it('reads back the account and epoch it was issued for', () => {
    const token = issueWithdrawalCancelToken('user-1', 7);
    expect(readWithdrawalCancelToken(token)).toEqual({ userId: 'user-1', sessionEpoch: 7 });
  });

  it('expires after ten minutes', () => {
    const issuedAt = Date.parse('2026-10-31T00:00:00Z');
    const token = issueWithdrawalCancelToken('user-1', 7, issuedAt);
    expect(readWithdrawalCancelToken(token, issuedAt + 9 * 60_000)).not.toBeNull();
    expect(readWithdrawalCancelToken(token, issuedAt + 10 * 60_000 + 1)).toBeNull();
  });

  it('refuses a token whose account or epoch was rewritten under the original signature', () => {
    const token = issueWithdrawalCancelToken('user-1', 7);
    const [encoded, signature] = token.split('.');
    const payload = Buffer.from(encoded, 'base64url').toString('utf8');
    const forge = (changed: string) => `${Buffer.from(changed).toString('base64url')}.${signature}`;

    expect(readWithdrawalCancelToken(forge(payload.replace('user-1', 'user-2')))).toBeNull();
    expect(readWithdrawalCancelToken(forge(payload.replace(':7:', ':8:')))).toBeNull();
    expect(readWithdrawalCancelToken(`${encoded}.${signature.slice(0, -2)}AA`)).toBeNull();
  });

  it.each(['', 'abc', 'a.b', 'a.b.c', '!!!.???'])('refuses malformed input %p', (input) => {
    expect(readWithdrawalCancelToken(input)).toBeNull();
  });

  // 같은 시크릿으로 서명되는 다른 계열이 철회 페이로드(`withdrawal_cancel:{user}:{epoch}:{exp}`)를 글자 그대로 만들어 낼 수 있는지.
  it('cannot be minted through the phone or email proof issuers, even with an input spelled like its payload', () => {
    // 가입 증명은 `{phone}:{exp}` 맨몸 형식이라 번호 자리에 'withdrawal_cancel:u:1' 을 넣으면 철회 토큰과 같은 서명 대상이 된다 — 발급기가 막는다.
    expect(() => issuePhoneProofToken('withdrawal_cancel:u:1')).toThrow();
    // 나머지 용도·이메일은 고정 라벨이 맨 앞에 붙어 입력이 무엇이든 'withdrawal_cancel' 로 시작할 수 없다.
    for (const token of [
      issuePhoneProofToken('withdrawal_cancel:u:1', 'password_reset'),
      issueEmailProofToken('withdrawal_cancel:u:1'),
    ]) {
      expect(readWithdrawalCancelToken(token)).toBeNull();
    }
    // 반대 방향: 철회 토큰이 같은 글자의 가짜 '번호' 에 대한 가입 증명으로 통하지 않는다.
    expect(verifyPhoneProofToken(issueWithdrawalCancelToken('u', 1), 'withdrawal_cancel:u:1')).toBe(false);
  });

  it('does not stand in for, and is not satisfied by, phone or email proofs signed with the same secret', () => {
    const token = issueWithdrawalCancelToken('01012345678', 0);
    expect(verifyPhoneProofToken(token, '01012345678', 'signup')).toBe(false);
    expect(verifyPhoneProofToken(token, '01012345678', 'password_reset')).toBe(false);
    expect(verifyEmailProofToken(token, 'a@example.com')).toBe(false);

    expect(readWithdrawalCancelToken(issuePhoneProofToken('01012345678'))).toBeNull();
    expect(readWithdrawalCancelToken(issuePhoneProofToken('01012345678', 'password_reset'))).toBeNull();
    expect(readWithdrawalCancelToken(issueEmailProofToken('a@example.com'))).toBeNull();
  });
});

describe('withdrawalPendingException', () => {
  beforeEach(() => {
    process.env.V1_SESSION_SECRET = 'x'.repeat(48);
  });

  it('gives an unproven caller the bare refusal: no details, nothing to cancel with', () => {
    const body = withdrawalPendingException().getResponse() as Record<string, unknown>;
    expect(body.code).toBe('ACCOUNT_WITHDRAWAL_PENDING');
    expect(body).not.toHaveProperty('details');
  });

  it('gives a caller who proved the credentials a token for exactly that account and epoch', () => {
    const exception = withdrawalPendingException({ id: 'user-1', sessionEpoch: 3 });
    const body = exception.getResponse() as { code: string; details: { withdrawalCancelToken: string; expiresInSeconds: number } };

    expect(exception.getStatus()).toBe(403);
    expect(body.code).toBe('ACCOUNT_WITHDRAWAL_PENDING');
    expect(body.details.expiresInSeconds).toBe(600);
    expect(readWithdrawalCancelToken(body.details.withdrawalCancelToken)).toEqual({ userId: 'user-1', sessionEpoch: 3 });
  });
});
