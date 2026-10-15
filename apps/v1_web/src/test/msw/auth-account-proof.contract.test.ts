import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { V1ApiError, v1Post } from '@/lib/api-client';
import type { V1AuthSessionResponse, V1FoundAccount } from '@/types/api';
import { v1MswHandlers } from './handlers';
import { v1UserFixture } from './fixtures';

const phone = '01012345678';
const newPassword = 'synthetic-new-password';
type PhoneProofPurpose = 'signup' | 'password_reset' | 'social_link';

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
  it.each(['/auth/social-link/preview', '/auth/social-link'])('%s rejects current-number proof instead of returning holder data or a session', async (path) => {
    // The proof must come from the same public producer as a browser consumer uses.
    const { proofToken } = await verifyPhone('social_link');
    // When: the production API client submits it through the shared MSW handlers.
    const result = v1Post<unknown>(path, { phone, proofToken });
    // Then: both API routes retain the new explicit independent-account-proof boundary.
    await expect(result).rejects.toMatchObject({
      statusCode: 409, code: 'SOCIAL_LINK_REQUIRES_ACCOUNT_PROOF',
      displayableMessage: true,
    } satisfies Partial<V1ApiError>);
  });

  it('phone password reset requires independent email proof', async () => {
    const { proofToken } = await verifyPhone('password_reset');
    const body = { phone, proofToken, newPassword };
    const result = v1Post<unknown>('/auth/recovery/reset-password', body);
    await expect(result).rejects.toMatchObject({
      statusCode: 409, code: 'ACCOUNT_RECOVERY_REQUIRES_EMAIL',
    } satisfies Partial<V1ApiError>);
  });

  it('preserves the masked account lookup after purpose-bound phone verification', async () => {
    const { proofToken } = await verifyPhone('password_reset');
    await expect(v1Post<V1FoundAccount>('/auth/recovery/find-account', { phone, proofToken }))
      .resolves.toEqual({ maskedEmail: 'so***@example.com', providers: ['email'], hasPassword: true });
  });

  it.each(['/auth/recovery/find-account', '/auth/recovery/reset-password'])('%s rejects a social-link proof', async (path) => {
    const { proofToken } = await verifyPhone('social_link');
    await expect(v1Post(path, { phone, proofToken, ...(path.endsWith('reset-password') ? { newPassword } : {}) }))
      .rejects.toMatchObject({ statusCode: 400, code: 'PHONE_NOT_VERIFIED' } satisfies Partial<V1ApiError>);
  });

  it.each(['/auth/social-link/preview', '/auth/social-link'])('%s rejects a recovery-purpose proof', async (path) => {
    const { proofToken } = await verifyPhone('password_reset');
    await expect(v1Post(path, { phone, proofToken }))
      .rejects.toMatchObject({ statusCode: 400, code: 'PHONE_NOT_VERIFIED' } satisfies Partial<V1ApiError>);
  });

  it.each(['/auth/recovery/find-account', '/auth/recovery/reset-password', '/auth/social-link'])('%s rejects the default signup-purpose proof', async (path) => {
    const { proofToken } = await verifyPhone();
    await expect(v1Post(path, { phone, proofToken, ...(path.endsWith('reset-password') ? { newPassword } : {}) }))
      .rejects.toMatchObject({ statusCode: 400, code: 'PHONE_NOT_VERIFIED' } satisfies Partial<V1ApiError>);
  });

  it.each(['/auth/recovery/find-account', '/auth/recovery/reset-password', '/auth/social-link'])('%s binds the proof to the verified phone', async (path) => {
    const purpose = path.includes('social-link') ? 'social_link' : 'password_reset';
    const { proofToken } = await verifyPhone(purpose, '01098765432');
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

  it('does not accept the social-link phone proof as an email reset proof', async () => {
    const { proofToken } = await verifyPhone('social_link');
    const result = v1Post<unknown>('/auth/recovery/email/reset-password', {
      email: v1UserFixture.email, proofToken, newPassword,
    });
    await expect(result).rejects.toMatchObject({
      statusCode: 400, code: 'EMAIL_NOT_VERIFIED',
    } satisfies Partial<V1ApiError>);
  });

  it.each(['/auth/recovery/find-account', '/auth/recovery/reset-password', '/auth/social-link'])('%s rejects an email-channel proof', async (path) => {
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
    await expect(v1Post('/auth/phone/verify', { phone, code: '123456', purpose: 'social_link' }))
      .resolves.toMatchObject({ verified: true, proofToken: expect.any(String) });
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

  it('rejects an unsupported phone proof purpose at the DTO boundary', async () => {
    await v1Post('/auth/phone/issue', { phone });
    await expect(v1Post('/auth/phone/verify', { phone, code: '123456', purpose: 'login' }))
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
    { elapsed: 6 * 60 * 1000, statusCode: 409, code: 'SOCIAL_LINK_REQUIRES_ACCOUNT_PROOF' },
    { elapsed: 10 * 60 * 1000 + 1, statusCode: 400, code: 'PHONE_NOT_VERIFIED' },
  ])('social-link proof retains its own lifetime at $elapsed ms', async ({ elapsed, statusCode, code }) => {
    const verifiedAt = Date.now();
    const mockNow = vi.spyOn(Date, 'now').mockReturnValue(verifiedAt);
    const { proofToken } = await verifyPhone('social_link');
    mockNow.mockReturnValue(verifiedAt + elapsed);
    await expect(v1Post('/auth/social-link', { phone, proofToken }))
      .rejects.toMatchObject({ statusCode, code } satisfies Partial<V1ApiError>);
  });
});
