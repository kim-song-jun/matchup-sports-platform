import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { V1ApiError, v1Post } from '@/lib/api-client';
import {
  getRecentLoginRequired,
  getSignInThenLinkHint,
  getWithdrawalCancelOffer,
} from '@/lib/auth-link-errors';
import { v1Keys } from '@/lib/query-keys';
import { LINK_MSW, WITHDRAWAL_MSW } from '@/test/msw/auth-link-handlers';
import { v1MswHandlers } from '@/test/msw/handlers';
import { v1UserFixture } from '@/test/msw/fixtures';
import type { V1AuthMe } from '@/types/api';
import { useV1CancelWithdrawal, useV1LinkApple, useV1LinkKakao } from './use-v1-api';

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

const LOGIN_METHOD_KEYS = {
  authMe: v1Keys.authMe(),
  settings: v1Keys.settings(),
  profile: v1Keys.profile(),
  notifications: v1Keys.notificationsRoot(),
} as const;

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  for (const key of Object.values(LOGIN_METHOD_KEYS)) queryClient.setQueryData(key, { seeded: true });
  const unrelatedKey = v1Keys.onboarding();
  queryClient.setQueryData(unrelatedKey, { seeded: true });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const isStale = (key: readonly unknown[]) => queryClient.getQueryState(key)?.isInvalidated === true;
  const staleKeys = () => Object.entries(LOGIN_METHOD_KEYS).filter(([, key]) => isStale(key)).map(([name]) => name);
  return { queryClient, wrapper, staleKeys, unrelatedIsStale: () => isStale(unrelatedKey) };
}

// Mutations settle outside React's batching unless awaited inside act, so both helpers run the call in one.
type Settled<T> = { status: 'fulfilled'; value: T } | { status: 'rejected'; error: unknown };

async function settle<T>(run: () => Promise<T>): Promise<Settled<T>> {
  let settled: Settled<T> | undefined;
  await act(async () => {
    settled = await run().then(
      (value): Settled<T> => ({ status: 'fulfilled', value }),
      (error: unknown): Settled<T> => ({ status: 'rejected', error }),
    );
  });
  if (!settled) throw new Error('the mutation never settled');
  return settled;
}

async function succeeds<T>(run: () => Promise<T>): Promise<T> {
  const settled = await settle(run);
  if (settled.status === 'rejected') throw settled.error;
  return settled.value;
}

async function fails(run: () => Promise<unknown>): Promise<unknown> {
  const settled = await settle(run);
  if (settled.status === 'fulfilled') throw new Error('expected the request to be rejected');
  return settled.error;
}

describe('useV1LinkKakao', () => {
  it('links with the web authorization code and refreshes every place that lists login methods', async () => {
    const { wrapper, staleKeys, unrelatedIsStale } = setup();
    const { result } = renderHook(() => useV1LinkKakao(), { wrapper });

    const linked = await succeeds(() => result.current.mutateAsync({
      code: LINK_MSW.credentials.ok,
      redirectUri: 'https://teameet.test/callback/kakao',
    }));

    expect(linked).toEqual({ provider: 'kakao', alreadyLinked: false, mergedPendingAccount: false, authProviders: ['email', 'kakao'] });
    expect(staleKeys()).toEqual(['authMe', 'settings', 'profile', 'notifications']);
    expect(unrelatedIsStale()).toBe(false);
  });

  it('links with the native SDK token', async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useV1LinkKakao(), { wrapper });
    await expect(succeeds(() => result.current.mutateAsync({ accessToken: LINK_MSW.credentials.mergedPending })))
      .resolves.toMatchObject({ provider: 'kakao', mergedPendingAccount: true });
  });

  it('treats an already linked provider as a success and still refreshes', async () => {
    const { wrapper, staleKeys } = setup();
    const { result } = renderHook(() => useV1LinkKakao(), { wrapper });
    await expect(succeeds(() => result.current.mutateAsync({ accessToken: LINK_MSW.credentials.alreadyLinked })))
      .resolves.toMatchObject({ alreadyLinked: true });
    expect(staleKeys()).toContain('authMe');
  });

  it.each([
    [LINK_MSW.credentials.providerExists, 409, 'SOCIAL_LINK_PROVIDER_EXISTS'],
    [LINK_MSW.credentials.providerInUse, 409, 'SOCIAL_LINK_PROVIDER_IN_USE'],
    [LINK_MSW.credentials.signupIncomplete, 403, 'SIGNUP_INCOMPLETE'],
    ['rejected-by-kakao', 401, 'UNAUTHENTICATED'],
  ])('keeps the caches as they were when linking fails (%s)', async (credential, statusCode, code) => {
    const { wrapper, staleKeys } = setup();
    const { result } = renderHook(() => useV1LinkKakao(), { wrapper });

    const error = await fails(() => result.current.mutateAsync({ accessToken: credential }));

    expect(error).toBeInstanceOf(V1ApiError);
    expect(error).toMatchObject({ statusCode, code });
    expect(staleKeys()).toEqual([]);
  });

  it('exposes how recent the login must be when the server asks for a fresh sign-in', async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useV1LinkKakao(), { wrapper });

    const error = await fails(() => result.current.mutateAsync({ accessToken: LINK_MSW.credentials.recentLoginRequired }));

    expect(getRecentLoginRequired(error)).toEqual({ maxAgeSeconds: LINK_MSW.maxAgeSeconds });
    expect(getSignInThenLinkHint(error)).toBeNull();
  });
});

describe('useV1LinkApple', () => {
  it('links with the identity token and the nonce the server issued', async () => {
    const { wrapper, staleKeys } = setup();
    const { result } = renderHook(() => useV1LinkApple(), { wrapper });

    const linked = await succeeds(() => result.current.mutateAsync({ identityToken: LINK_MSW.credentials.ok, nonce: 'server-nonce' }));

    expect(linked).toEqual({ provider: 'apple', alreadyLinked: false, mergedPendingAccount: false, authProviders: ['email', 'apple'] });
    expect(staleKeys()).toEqual(['authMe', 'settings', 'profile', 'notifications']);
  });

  it('surfaces a provider already used by another account without touching the caches', async () => {
    const { wrapper, staleKeys } = setup();
    const { result } = renderHook(() => useV1LinkApple(), { wrapper });
    const error = await fails(() => result.current.mutateAsync({ identityToken: LINK_MSW.credentials.providerInUse, nonce: 'n' }));
    expect(error).toMatchObject({ statusCode: 409, code: 'SOCIAL_LINK_PROVIDER_IN_USE' });
    expect(staleKeys()).toEqual([]);
  });
});

describe('sign-in conflict 409s carry the next action in details', () => {
  it.each([
    ['/auth/kakao', { code: LINK_MSW.loginConflicts.unverifiedEmail, redirectUri: 'https://teameet.test/callback/kakao' }, 'SOCIAL_LINK_REQUIRES_VERIFIED_EMAIL', 'kakao'],
    ['/auth/kakao/token', { accessToken: LINK_MSW.loginConflicts.contactConflict }, 'SOCIAL_LINK_CONTACT_CONFLICT', 'kakao'],
    ['/auth/apple', { identityToken: LINK_MSW.loginConflicts.accountProof, nonce: 'n' }, 'SOCIAL_LINK_REQUIRES_ACCOUNT_PROOF', 'apple'],
  ])('%s', async (path, body, code, provider) => {
    const error = await fails(() => v1Post(path, body));
    expect(error).toMatchObject({ statusCode: 409, code });
    expect(getSignInThenLinkHint(error)).toEqual({ next: 'sign_in_then_link', provider });
  });

  it('a successful sign-in has no hint to read', async () => {
    await expect(v1Post('/auth/kakao/token', { accessToken: 'plain-token' })).resolves.toMatchObject({ session: { userId: v1UserFixture.id } });
  });
});

describe('withdrawal cancel', () => {
  const credentials = { email: WITHDRAWAL_MSW.email, password: WITHDRAWAL_MSW.password };

  it('turns the sign-in 403 into a cancel call that issues the session', async () => {
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useV1CancelWithdrawal(), { wrapper });

    const offer = getWithdrawalCancelOffer(await fails(() => v1Post('/auth/login', credentials)));
    expect(offer).toEqual({ token: WITHDRAWAL_MSW.tokens.valid, expiresInSeconds: WITHDRAWAL_MSW.expiresInSeconds });

    const session = await succeeds(() => result.current.mutateAsync({ token: offer!.token }));

    expect(session.session.userId).toBe(v1UserFixture.id);
    expect(queryClient.getQueryData<V1AuthMe>(v1Keys.authMe())).toEqual(session);
  });

  it('leaves every other email to the regular login handlers', async () => {
    await expect(v1Post('/auth/login', { email: 'someone-else@example.com', password: 'whatever-1234' }))
      .resolves.toMatchObject({ session: { userId: v1UserFixture.id } });
  });

  it('offers nothing when the credentials were wrong, so the account state does not leak', async () => {
    const error = await fails(() => v1Post('/auth/login', { ...credentials, password: 'wrong-password' }));
    expect(error).toMatchObject({ statusCode: 401, code: 'UNAUTHENTICATED' });
    expect(getWithdrawalCancelOffer(error)).toBeNull();
  });

  it.each([
    ['an expired token', 'expired-or-unknown', 400, 'WITHDRAWAL_CANCEL_TOKEN_INVALID'],
    ['an account that was already deleted', WITHDRAWAL_MSW.tokens.processed, 409, 'WITHDRAWAL_ALREADY_PROCESSED'],
  ])('leaves the auth snapshot alone for %s', async (_label, token, statusCode, code) => {
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useV1CancelWithdrawal(), { wrapper });

    const error = await fails(() => result.current.mutateAsync({ token }));

    expect(error).toMatchObject({ statusCode, code });
    expect(queryClient.getQueryData(v1Keys.authMe())).toEqual({ seeded: true });
  });
});
