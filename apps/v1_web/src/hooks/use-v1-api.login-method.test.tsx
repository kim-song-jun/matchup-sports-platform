import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';
import { LOGIN_METHOD_MSW } from '@/test/msw/auth-login-method-handlers';
import { v1MswHandlers } from '@/test/msw/handlers';
import { useV1RevokeOtherSessions, useV1UnlinkLoginMethod } from './use-v1-api';

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
  return { wrapper, staleKeys, unrelatedIsStale: () => isStale(unrelatedKey) };
}

// Mutations settle outside React's batching unless awaited inside act.
async function inAct<T>(run: () => Promise<T>): Promise<{ value?: T; error?: unknown }> {
  let outcome: { value?: T; error?: unknown } = {};
  await act(async () => {
    outcome = await run().then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
  });
  return outcome;
}

describe('useV1UnlinkLoginMethod', () => {
  it('removes the login and refreshes everything that lists login methods, nothing else', async () => {
    const { wrapper, staleKeys, unrelatedIsStale } = setup();
    const { result } = renderHook(() => useV1UnlinkLoginMethod(), { wrapper });

    const { value, error } = await inAct(() => result.current.mutateAsync({ provider: LOGIN_METHOD_MSW.provider.removable }));

    expect(error).toBeUndefined();
    expect(value).toEqual({ provider: 'kakao', authProviders: ['email'] });
    expect(staleKeys()).toEqual(['authMe', 'settings', 'profile', 'notifications']);
    expect(unrelatedIsStale()).toBe(false);
  });

  it('sends the provider as the only body field, to the unlink route', async () => {
    const seen: { url: string; body: unknown }[] = [];
    server.use(
      http.post('*/api/v1/auth/identities/unlink', async ({ request }) => {
        seen.push({ url: new URL(request.url).pathname, body: await request.json() });
        return HttpResponse.json({ status: 'success', data: { provider: 'apple', authProviders: ['email'] }, timestamp: '2026-11-06T00:00:00.000Z' });
      }),
    );
    const { wrapper } = setup();
    const { result } = renderHook(() => useV1UnlinkLoginMethod(), { wrapper });

    await inAct(() => result.current.mutateAsync({ provider: 'apple' }));

    expect(seen).toEqual([{ url: '/api/v1/auth/identities/unlink', body: { provider: 'apple' } }]);
  });

  it.each([
    [LOGIN_METHOD_MSW.provider.last, 409, 'LAST_LOGIN_METHOD'],
    [LOGIN_METHOD_MSW.provider.missing, 404, 'LOGIN_METHOD_NOT_FOUND'],
  ] as const)('keeps what it has read when the server refuses (%s)', async (provider, statusCode, code) => {
    const { wrapper, staleKeys } = setup();
    const { result } = renderHook(() => useV1UnlinkLoginMethod(), { wrapper });

    const { error } = await inAct(() => result.current.mutateAsync({ provider }));

    expect(error).toBeInstanceOf(V1ApiError);
    expect(error).toMatchObject({ statusCode, code });
    expect(staleKeys()).toEqual([]);
  });

  it('surfaces the recent-login requirement with its limit so a screen can ask for a fresh sign-in', async () => {
    server.use(
      http.post('*/api/v1/auth/identities/unlink', () =>
        HttpResponse.json(
          {
            status: 'error', statusCode: 403, code: 'RECENT_LOGIN_REQUIRED', message: '보안을 위해 다시 로그인한 뒤 해제해 주세요.',
            details: { maxAgeSeconds: 1800 }, timestamp: '2026-11-06T00:00:00.000Z',
          },
          { status: 403 },
        ),
      ),
    );
    const { wrapper, staleKeys } = setup();
    const { result } = renderHook(() => useV1UnlinkLoginMethod(), { wrapper });

    const { error } = await inAct(() => result.current.mutateAsync({ provider: 'kakao' }));

    expect(error).toMatchObject({ statusCode: 403, code: 'RECENT_LOGIN_REQUIRED', details: { maxAgeSeconds: 1800 } });
    expect(staleKeys()).toEqual([]);
  });
});

describe('useV1RevokeOtherSessions', () => {
  it('signs the other devices out without refetching anything', async () => {
    const { wrapper, staleKeys } = setup();
    const { result } = renderHook(() => useV1RevokeOtherSessions(), { wrapper });

    const { value, error } = await inAct(() => result.current.mutateAsync());

    expect(error).toBeUndefined();
    expect(value).toEqual({ revoked: true });
    expect(staleKeys()).toEqual([]);
  });
});
