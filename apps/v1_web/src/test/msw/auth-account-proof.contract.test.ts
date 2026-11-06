import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { V1ApiError, v1Post } from '@/lib/api-client';
import type { V1AuthSessionResponse, V1FoundAccount } from '@/types/api';
import { v1MswHandlers } from './handlers';
import { v1UserFixture } from './fixtures';
import { WITHDRAWAL_PENDING_RECOVERY_MSW } from './auth-link-handlers';

const phone = '01012345678';
const newPassword = 'synthetic-new-password';
type PhoneProofPurpose = 'signup' | 'password_reset';

async function verifyPhone(purpose?: PhoneProofPurpose, targetPhone = phone) {
  await v1Post('/auth/phone/issue', { phone: targetPhone });
  return v1Post<{ verified: true; proofToken: string }>('/auth/phone/verify', {
    phone: targetPhone, code: '123456', ...(purpose ? { purpose } : {}),
  });
}

const server = setupServer(
  ...v1MswHandlers,
  // A missing shared handler must fail at the HTTP boundary, without contacting a local API.
  // This sentinel never returns a successful recovery result or the expected security error.
  http.all('*/api/v1/auth/recovery/*', () => HttpResponse.json({
    status: 'error', statusCode: 404, code: 'MSW_CONTRACT_MISSING',
    message: '공유 계정 복구 핸들러가 없어요.',
    timestamp: '2026-10-13T00:00:00.000Z',
  }, { status: 404 })),
  http.post('*/api/v1/logs/client-error', () => HttpResponse.json({ status: 'success', data: {} })),
);

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => { server.close(); vi.unstubAllEnvs(); });
afterEach(() => { server.resetHandlers(); vi.restoreAllMocks(); });

describe('MD-QA #133 shared MSW account-proof HTTP contract', () => {
  it('phone password reset requires independent email proof', async () => {
    const { proofToken } = await verifyPhone('password_reset');
    const body = { phone, proofToken, newPassword };
    const result = v1Post<unknown>('/auth/recovery/reset-password', body);
    await expect(result).rejects.toMatchObject({
      statusCode: 409, code: 'ACCOUNT_RECOVERY_REQUIRES_EMAIL',
    } satisfies Partial<V1ApiError>);
  });

  it('answers a purpose-bound phone lookup with the login methods only', async () => {
    const { proofToken } = await verifyPhone('password_reset');
    await expect(v1Post<V1FoundAccount>('/auth/recovery/find-account', { phone, proofToken }))
      .resolves.toEqual({ maskedEmail: null, providers: ['email'], hasPassword: true, withdrawalPending: false, withdrawalPendingUntil: null });
  });

  it.each(['/auth/recovery/find-account', '/auth/recovery/reset-password'])('%s rejects the default signup-purpose proof', async (path) => {
    const { proofToken } = await verifyPhone();
    await expect(v1Post(path, { phone, proofToken, ...(path.endsWith('reset-password') ? { newPassword } : {}) }))
      .rejects.toMatchObject({ statusCode: 400, code: 'PHONE_NOT_VERIFIED' } satisfies Partial<V1ApiError>);
  });

  it.each(['/auth/recovery/find-account', '/auth/recovery/reset-password'])('%s binds the proof to the verified phone', async (path) => {
    const { proofToken } = await verifyPhone('password_reset', '01098765432');
    await expect(v1Post(path, { phone, proofToken, ...(path.endsWith('reset-password') ? { newPassword } : {}) }))
      .rejects.toMatchObject({ statusCode: 400, code: 'PHONE_NOT_VERIFIED' } satisfies Partial<V1ApiError>);
  });

  it('returns account-not-found only after verifying the absent account phone', async () => {
    const absentPhone = '01098765432';
    const { proofToken } = await verifyPhone('password_reset', absentPhone);
    await expect(v1Post('/auth/recovery/find-account', { phone: absentPhone, proofToken }))
      .rejects.toMatchObject({ statusCode: 404, code: 'ACCOUNT_NOT_FOUND' } satisfies Partial<V1ApiError>);
  });

  it('preserves real email request, confirmation and password-reset HTTP consumers', async () => {
    const email = v1UserFixture.email;
    const issued = await v1Post<{ sent: true; expiresAt: string }>('/auth/recovery/email/request', { email });
    expect(issued.sent).toBe(true);
    expect(Number.isNaN(Date.parse(issued.expiresAt))).toBe(false);

    const confirmed = await v1Post<{ verified: true; proofToken: string }>('/auth/recovery/email/confirm', { email, code: '123456' });
    expect(confirmed.verified).toBe(true);
    expect(confirmed.proofToken).toEqual(expect.any(String));
    await expect(v1Post('/auth/recovery/email/reset-password', {
      email, proofToken: confirmed.proofToken, newPassword: 'synthetic-new-password',
    })).resolves.toEqual({ ok: true });
  });

  it('only reveals email account login methods after matching email proof', async () => {
    const email = v1UserFixture.email;
    await expect(v1Post('/auth/recovery/email/find-account', { email, proofToken: 'wrong' }))
      .rejects.toMatchObject({ statusCode: 400, code: 'EMAIL_NOT_VERIFIED' });
    await v1Post('/auth/recovery/email/request', { email });
    const { proofToken } = await v1Post<{ proofToken: string }>('/auth/recovery/email/confirm', { email, code: '123456' });
    await expect(v1Post<V1FoundAccount>('/auth/recovery/email/find-account', { email, proofToken }))
      .resolves.toEqual({ maskedEmail: 'so***@example.com', providers: ['email'], hasPassword: true, withdrawalPending: false, withdrawalPendingUntil: null });
    await expect(v1Post('/auth/recovery/email/find-account', { email: 'other@example.com', proofToken }))
      .rejects.toMatchObject({ statusCode: 400, code: 'EMAIL_NOT_VERIFIED' });
  });

  it('does not accept a phone proof as an email reset proof', async () => {
    const { proofToken } = await verifyPhone('password_reset');
    const result = v1Post<unknown>('/auth/recovery/email/reset-password', {
      email: v1UserFixture.email, proofToken, newPassword,
    });
    await expect(result).rejects.toMatchObject({
      statusCode: 400, code: 'EMAIL_NOT_VERIFIED',
    } satisfies Partial<V1ApiError>);
  });

  it.each(['/auth/recovery/find-account', '/auth/recovery/reset-password'])('%s rejects an email-channel proof', async (path) => {
    const email = v1UserFixture.email;
    await v1Post('/auth/recovery/email/request', { email });
    const { proofToken } = await v1Post<{ proofToken: string }>('/auth/recovery/email/confirm', { email, code: '123456' });
    await expect(v1Post(path, { phone, proofToken, ...(path.endsWith('reset-password') ? { newPassword } : {}) }))
      .rejects.toMatchObject({ statusCode: 400, code: 'PHONE_NOT_VERIFIED' } satisfies Partial<V1ApiError>);
  });

  it('email confirmation rejects a wrong code instead of minting an account proof', async () => {
    const email = v1UserFixture.email;
    await v1Post('/auth/recovery/email/request', { email });
    await expect(v1Post('/auth/recovery/email/confirm', { email, code: '000000' })).rejects.toMatchObject({
      statusCode: 400, code: 'VERIFICATION_CODE_MISMATCH',
    } satisfies Partial<V1ApiError>);
  });

  it('preserves existing password login without invoking a phone-link route', async () => {
    const result = await v1Post<Pick<V1AuthSessionResponse, 'session'>>('/auth/login', {
      email: v1UserFixture.email, password: 'synthetic-existing-password',
    });
    expect(result.session).toEqual({ userId: v1UserFixture.id, userEmail: v1UserFixture.email });
  });

  it('keeps phone verification available without granting account access', async () => {
    const issued = await v1Post<{ expiresAt: string }>('/auth/phone/issue', { phone });
    expect(Number.isNaN(Date.parse(issued.expiresAt))).toBe(false);
    await expect(v1Post('/auth/phone/verify', { phone, code: '123456', purpose: 'password_reset' }))
      .resolves.toMatchObject({ verified: true, proofToken: expect.any(String) });
  });

  it('tells the verifier whether the number already has an account only after the code proved ownership', async () => {
    const issued = await v1Post<Record<string, unknown>>('/auth/phone/issue', { phone });
    expect(issued).not.toHaveProperty('registered');
    await expect(v1Post('/auth/phone/verify', { phone, code: '000000' })).rejects.toMatchObject({ code: 'VERIFICATION_CODE_MISMATCH' });
    await expect(v1Post('/auth/phone/verify', { phone, code: '123456' })).resolves.toMatchObject({ verified: true, registered: true, withdrawalPendingUntil: null });

    const freePhone = '01077778888';
    await v1Post('/auth/phone/issue', { phone: freePhone });
    await expect(v1Post('/auth/phone/verify', { phone: freePhone, code: '123456' })).resolves.toMatchObject({ verified: true, registered: false });
  });

  it('does not mint a phone proof for a wrong verification code', async () => {
    await v1Post('/auth/phone/issue', { phone });
    await expect(v1Post('/auth/phone/verify', { phone, code: '000000', purpose: 'password_reset' }))
      .rejects.toMatchObject({ statusCode: 400, code: 'VERIFICATION_CODE_MISMATCH' } satisfies Partial<V1ApiError>);
  });

  it('does not mint a phone proof without an issued challenge', async () => {
    await expect(v1Post('/auth/phone/verify', { phone: '01045678901', code: '123456', purpose: 'password_reset' }))
      .rejects.toMatchObject({ statusCode: 400, code: 'VERIFICATION_NO_PENDING' } satisfies Partial<V1ApiError>);
  });

  it.each(['login', 'social_link'])('rejects the unsupported phone proof purpose %s at the DTO boundary', async (purpose) => {
    await v1Post('/auth/phone/issue', { phone });
    await expect(v1Post('/auth/phone/verify', { phone, code: '123456', purpose }))
      .rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' } satisfies Partial<V1ApiError>);
  });

  it('rejects the code after its five-minute challenge expires', async () => {
    const issuedAt = Date.now();
    const mockNow = vi.spyOn(Date, 'now').mockReturnValue(issuedAt);
    await v1Post('/auth/phone/issue', { phone });
    mockNow.mockReturnValue(issuedAt + 5 * 60 * 1000 + 1);
    await expect(v1Post('/auth/phone/verify', { phone, code: '123456', purpose: 'password_reset' }))
      .rejects.toMatchObject({ statusCode: 400, code: 'VERIFICATION_NO_PENDING' } satisfies Partial<V1ApiError>);
  });

  it.each([
    { elapsed: 6 * 60 * 1000, outcome: 'accepted' },
    { elapsed: 10 * 60 * 1000 + 1, outcome: 'expired' },
  ])('a phone proof is $outcome at $elapsed ms', async ({ elapsed, outcome }) => {
    const verifiedAt = Date.now();
    const mockNow = vi.spyOn(Date, 'now').mockReturnValue(verifiedAt);
    const { proofToken } = await verifyPhone('password_reset');
    mockNow.mockReturnValue(verifiedAt + elapsed);
    const lookup = v1Post('/auth/recovery/find-account', { phone, proofToken });
    if (outcome === 'accepted') await expect(lookup).resolves.toMatchObject({ providers: ['email'] });
    else await expect(lookup).rejects.toMatchObject({ statusCode: 400, code: 'PHONE_NOT_VERIFIED' } satisfies Partial<V1ApiError>);
  });
});

function fixtureEmail(): string {
  if (!v1UserFixture.email) throw new Error('the MSW user fixture has no email');
  return v1UserFixture.email;
}

async function proveMailbox(email: string) {
  await v1Post('/auth/recovery/email/request', { email });
  const { proofToken } = await v1Post<{ proofToken: string }>('/auth/recovery/email/confirm', { email, code: '123456' });
  return proofToken;
}

describe('phone lookup reveals the masked email and withdrawal date only with the same account\'s mailbox proof', () => {
  const lookup = async (body: Record<string, unknown>, targetPhone = phone) => {
    const { proofToken } = await verifyPhone('password_reset', targetPhone);
    return v1Post<V1FoundAccount>('/auth/recovery/find-account', { phone: targetPhone, proofToken, ...body });
  };

  it('adds the masked email when the mailbox proof is for this account', async () => {
    const email = fixtureEmail();
    await expect(lookup({ email, emailProofToken: await proveMailbox(email) }))
      .resolves.toEqual({ maskedEmail: 'so***@example.com', providers: ['email'], hasPassword: true, withdrawalPending: false, withdrawalPendingUntil: null });
  });

  it('answers a proof for another account\'s mailbox exactly like no proof', async () => {
    const other = 'someone-else@example.com';
    const withOtherMailbox = await lookup({ email: other, emailProofToken: await proveMailbox(other) });
    expect(withOtherMailbox).toEqual(await lookup({}));
    expect(withOtherMailbox.maskedEmail).toBeNull();
  });

  it('refuses a mailbox proof that was never issued, and a proof sent without its address', async () => {
    await expect(lookup({ email: fixtureEmail(), emailProofToken: 'forged' }))
      .rejects.toMatchObject({ statusCode: 400, code: 'EMAIL_NOT_VERIFIED' } satisfies Partial<V1ApiError>);
    await expect(lookup({ emailProofToken: await proveMailbox(fixtureEmail()) }))
      .rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' } satisfies Partial<V1ApiError>);
    await expect(lookup({ email: fixtureEmail() }))
      .rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' } satisfies Partial<V1ApiError>);
  });

  it('tells a withdrawal-pending account\'s number holder only that it is pending, until the mailbox is proven', async () => {
    const { email, phone: pendingPhone, withdrawalPendingUntil } = WITHDRAWAL_PENDING_RECOVERY_MSW;
    await expect(lookup({}, pendingPhone))
      .resolves.toEqual({ maskedEmail: null, providers: ['email'], hasPassword: true, withdrawalPending: true, withdrawalPendingUntil: null });
    await expect(lookup({ email, emailProofToken: await proveMailbox(email) }, pendingPhone))
      .resolves.toMatchObject({ withdrawalPending: true, maskedEmail: 'wi***@example.com', withdrawalPendingUntil });
  });
});

describe('email lookup also finds an account waiting out its withdrawal grace', () => {
  it('carries the pending flag and the end date after the mailbox proof', async () => {
    const { email, withdrawalPendingUntil } = WITHDRAWAL_PENDING_RECOVERY_MSW;
    await expect(v1Post<V1FoundAccount>('/auth/recovery/email/find-account', { email, proofToken: await proveMailbox(email) }))
      .resolves.toEqual({ maskedEmail: 'wi***@example.com', providers: ['email'], hasPassword: true, withdrawalPending: true, withdrawalPendingUntil });
  });

  it('still refuses to reset the password of such an account', async () => {
    const { email } = WITHDRAWAL_PENDING_RECOVERY_MSW;
    await expect(v1Post('/auth/recovery/email/reset-password', { email, proofToken: await proveMailbox(email), newPassword }))
      .rejects.toMatchObject({ statusCode: 404, code: 'ACCOUNT_NOT_FOUND' } satisfies Partial<V1ApiError>);
  });
});

describe('common passwords are refused wherever a login password is set', () => {
  const COMMON = 'Qwer1234';

  it('on an email password reset, with its own code, and a short one stays a plain validation error', async () => {
    const email = fixtureEmail();
    const proofToken = await proveMailbox(email);
    await expect(v1Post('/auth/recovery/email/reset-password', { email, proofToken, newPassword: COMMON }))
      .rejects.toMatchObject({ statusCode: 400, code: 'PASSWORD_TOO_COMMON', message: '너무 흔한 비밀번호예요. 다른 비밀번호를 정해 주세요.' } satisfies Partial<V1ApiError>);
    await expect(v1Post('/auth/recovery/email/reset-password', { email, proofToken, newPassword: 'short12' }))
      .rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' } satisfies Partial<V1ApiError>);
  });

  it('on signup', async () => {
    const body = {
      nickname: '테스트닉', email: 'signup@example.com', password: COMMON, displayName: '홍길동', phone,
      birthDate: '20000229', gender: 'male', requiredTermsAccepted: true,
    };
    await expect(v1Post('/auth/register', body))
      .rejects.toMatchObject({ statusCode: 400, code: 'PASSWORD_TOO_COMMON' } satisfies Partial<V1ApiError>);
  });
});
