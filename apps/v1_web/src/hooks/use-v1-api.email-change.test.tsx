import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { V1ApiError, v1Post } from '@/lib/api-client';
import { EMAIL_CHANGE_PROOF_REQUIRED_CODE, EMAIL_CONFLICT_CODE, EMAIL_UNCHANGED_CODE } from '@/lib/auth-error-codes';
import { getRecentLoginRequired, isEmailSendUnavailable } from '@/lib/auth-link-errors';
import { v1Keys } from '@/lib/query-keys';
import { EMAIL_CHANGE_MSW } from '@/test/msw/profile-email-change-handlers';
import { v1MswHandlers } from '@/test/msw/handlers';
import { v1ProfileFixture } from '@/test/msw/fixtures';
import type { V1AuthMe, V1Profile } from '@/types/api';
import { useV1EmailChangeRequest, useV1EmailChangeVerify, useV1UpdateProfile } from './use-v1-api';

const server = setupServer(
  ...v1MswHandlers,
  http.post('*/api/v1/logs/client-error', () => HttpResponse.json({ status: 'success', data: {} })),
);

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});
afterEach(() => server.resetHandlers());

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  queryClient.setQueryData<V1Profile>(v1Keys.profile(), { ...v1ProfileFixture, email: EMAIL_CHANGE_MSW.currentEmail });
  queryClient.setQueryData(v1Keys.authMe(), { seeded: true, user: { id: 'user-1', email: EMAIL_CHANGE_MSW.currentEmail, phone: '01011112222', onboardingStatus: 'completed' } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  const authMeIsStale = () => queryClient.getQueryState(v1Keys.authMe())?.isInvalidated === true;
  const cachedEmails = () => ({
    profile: queryClient.getQueryData<V1Profile>(v1Keys.profile())?.email,
    authMe: queryClient.getQueryData<V1AuthMe>(v1Keys.authMe())?.user.email,
  });
  return { queryClient, wrapper, authMeIsStale, cachedEmails };
}

// Mutations settle outside React's batching unless awaited inside act.
async function settle<T>(run: () => Promise<T>): Promise<{ value: T } | { error: unknown }> {
  let settled: { value: T } | { error: unknown } | undefined;
  await act(async () => {
    settled = await run().then((value) => ({ value }), (error: unknown) => ({ error }));
  });
  if (!settled) throw new Error('the mutation never settled');
  return settled;
}

async function succeeds<T>(run: () => Promise<T>): Promise<T> {
  const settled = await settle(run);
  if ('error' in settled) throw settled.error;
  return settled.value;
}

async function fails(run: () => Promise<unknown>): Promise<unknown> {
  const settled = await settle(run);
  if ('value' in settled) throw new Error('expected the request to be rejected');
  return settled.error;
}

const PROFILE_BODY = { nickname: '러너01', gender: 'male' as const };

describe('changing the account email', () => {
  it('request: asks the server to mail a code to the new address and leaves the account caches alone', async () => {
    const { wrapper, authMeIsStale } = setup();
    const { result } = renderHook(() => useV1EmailChangeRequest(), { wrapper });

    const sent = await succeeds(() => result.current.mutateAsync({ email: EMAIL_CHANGE_MSW.emails.ok }));

    expect(sent).toEqual({
      sent: true,
      maskedTarget: 'ne***@example.com',
      expiresInSeconds: EMAIL_CHANGE_MSW.codeExpiresInSeconds,
      resendAvailableInSeconds: EMAIL_CHANGE_MSW.resendAvailableInSeconds,
      devCode: EMAIL_CHANGE_MSW.codes.ok,
    });
    expect(authMeIsStale()).toBe(false);
  });

  it.each([
    [EMAIL_CHANGE_MSW.currentEmail, 400, EMAIL_UNCHANGED_CODE],
    [EMAIL_CHANGE_MSW.emails.taken, 409, EMAIL_CONFLICT_CODE],
    [EMAIL_CHANGE_MSW.emails.cooldown, 400, 'VERIFICATION_RESEND_COOLDOWN'],
    [EMAIL_CHANGE_MSW.emails.recentLoginRequired, 403, 'RECENT_LOGIN_REQUIRED'],
    [EMAIL_CHANGE_MSW.emails.mailUnavailable, 503, 'EMAIL_SEND_UNAVAILABLE'],
  ])('request: surfaces %s as %i %s', async (email, statusCode, code) => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useV1EmailChangeRequest(), { wrapper });

    const error = await fails(() => result.current.mutateAsync({ email }));

    expect(error).toBeInstanceOf(V1ApiError);
    expect(error).toMatchObject({ statusCode, code });
  });

  it('request: a stale session says how recent the sign-in must be, and a server without mail says so', async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useV1EmailChangeRequest(), { wrapper });

    const stale = await fails(() => result.current.mutateAsync({ email: EMAIL_CHANGE_MSW.emails.recentLoginRequired }));
    const noMail = await fails(() => result.current.mutateAsync({ email: EMAIL_CHANGE_MSW.emails.mailUnavailable }));

    expect(getRecentLoginRequired(stale)).toEqual({ maxAgeSeconds: EMAIL_CHANGE_MSW.maxAgeSeconds });
    expect(isEmailSendUnavailable(noMail)).toBe(true);
  });

  it('request: a body outside the contract is a 400 before any mail', async () => {
    const extra = await fails(() => v1Post('/me/email-change/request', { email: EMAIL_CHANGE_MSW.emails.ok, userId: 'someone-else' }));
    const malformed = await fails(() => v1Post('/me/email-change/request', { email: 'not-an-address' }));

    expect(extra).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    expect(malformed).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
  });

  it('verify: trades the right code for a token and leaves the account caches alone', async () => {
    const { wrapper, authMeIsStale } = setup();
    const { result } = renderHook(() => useV1EmailChangeVerify(), { wrapper });

    const verified = await succeeds(() => result.current.mutateAsync({ code: EMAIL_CHANGE_MSW.codes.ok }));

    expect(verified).toEqual({ emailChangeToken: EMAIL_CHANGE_MSW.tokens.ok, expiresInSeconds: EMAIL_CHANGE_MSW.tokenExpiresInSeconds });
    expect(authMeIsStale()).toBe(false);
  });

  it.each([
    [EMAIL_CHANGE_MSW.codes.wrong, 'VERIFICATION_CODE_MISMATCH'],
    [EMAIL_CHANGE_MSW.codes.expired, 'VERIFICATION_NO_PENDING'],
    [EMAIL_CHANGE_MSW.codes.exhausted, 'VERIFICATION_TOO_MANY_ATTEMPTS'],
    ['12345', 'VALIDATION_ERROR'],
  ])('verify: surfaces code %s as 400 %s', async (code, errorCode) => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useV1EmailChangeVerify(), { wrapper });

    expect(await fails(() => result.current.mutateAsync({ code }))).toMatchObject({ statusCode: 400, code: errorCode });
  });

  describe('saving the profile with the token', () => {
    it('refuses a new address without a token, and with a token that proves another address', async () => {
      const { wrapper } = setup();
      const { result } = renderHook(() => useV1UpdateProfile(), { wrapper });

      const bare = await fails(() => result.current.mutateAsync({ ...PROFILE_BODY, email: EMAIL_CHANGE_MSW.emails.ok }));
      const other = await fails(() =>
        result.current.mutateAsync({ ...PROFILE_BODY, email: EMAIL_CHANGE_MSW.emails.ok, emailChangeToken: EMAIL_CHANGE_MSW.tokens.taken }),
      );

      expect(bare).toMatchObject({ statusCode: 400, code: EMAIL_CHANGE_PROOF_REQUIRED_CODE });
      expect(other).toMatchObject({ statusCode: 400, code: EMAIL_CHANGE_PROOF_REQUIRED_CODE });
    });

    it('request -> verify -> save changes the address and refreshes the account caches', async () => {
      const { wrapper, authMeIsStale, cachedEmails } = setup();
      const request = renderHook(() => useV1EmailChangeRequest(), { wrapper });
      const verify = renderHook(() => useV1EmailChangeVerify(), { wrapper });
      const save = renderHook(() => useV1UpdateProfile(), { wrapper });

      await succeeds(() => request.result.current.mutateAsync({ email: EMAIL_CHANGE_MSW.emails.ok }));
      const { emailChangeToken } = await succeeds(() => verify.result.current.mutateAsync({ code: EMAIL_CHANGE_MSW.codes.ok }));
      const saved = await succeeds(() =>
        save.result.current.mutateAsync({ ...PROFILE_BODY, email: EMAIL_CHANGE_MSW.emails.ok, emailChangeToken }),
      );

      expect(saved.profile.nickname).toBe('러너01');
      expect(authMeIsStale()).toBe(true);
      // Every later save reads the account email from these caches, so they must hold the stored address at once.
      expect(cachedEmails()).toEqual({ profile: EMAIL_CHANGE_MSW.emails.ok, authMe: EMAIL_CHANGE_MSW.emails.ok });
    });

    it('keeps the cached address when a save leaves the email out, and drops it when the account clears it', async () => {
      const { wrapper, cachedEmails } = setup();
      const { result } = renderHook(() => useV1UpdateProfile(), { wrapper });

      await succeeds(() => result.current.mutateAsync({ ...PROFILE_BODY }));
      expect(cachedEmails()).toEqual({ profile: EMAIL_CHANGE_MSW.currentEmail, authMe: EMAIL_CHANGE_MSW.currentEmail });

      await succeeds(() => result.current.mutateAsync({ ...PROFILE_BODY, email: null }));
      expect(cachedEmails()).toEqual({ profile: null, authMe: null });
    });

    it('leaves the caches unchanged when the server refuses the new address', async () => {
      const { wrapper, cachedEmails } = setup();
      const { result } = renderHook(() => useV1UpdateProfile(), { wrapper });

      await fails(() => result.current.mutateAsync({ ...PROFILE_BODY, email: EMAIL_CHANGE_MSW.emails.ok }));

      expect(cachedEmails()).toEqual({ profile: EMAIL_CHANGE_MSW.currentEmail, authMe: EMAIL_CHANGE_MSW.currentEmail });
    });

    it('answers an address another account took after the code was checked with EMAIL_CONFLICT', async () => {
      const { wrapper } = setup();
      const { result } = renderHook(() => useV1UpdateProfile(), { wrapper });

      const error = await fails(() =>
        result.current.mutateAsync({ ...PROFILE_BODY, email: EMAIL_CHANGE_MSW.emails.taken, emailChangeToken: EMAIL_CHANGE_MSW.tokens.taken }),
      );

      expect(error).toMatchObject({ statusCode: 409, code: EMAIL_CONFLICT_CODE });
    });

    it('needs no token when the address does not change, or when a social account clears it', async () => {
      const { wrapper } = setup();
      const { result } = renderHook(() => useV1UpdateProfile(), { wrapper });

      await succeeds(() => result.current.mutateAsync({ ...PROFILE_BODY, email: EMAIL_CHANGE_MSW.currentEmail }));
      await succeeds(() => result.current.mutateAsync({ ...PROFILE_BODY }));
      await succeeds(() => result.current.mutateAsync({ ...PROFILE_BODY, email: null }));
    });
  });
});
