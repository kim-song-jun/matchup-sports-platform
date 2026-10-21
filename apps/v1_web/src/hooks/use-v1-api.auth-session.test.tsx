import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { v1Keys } from '@/lib/query-keys';
import type { V1AuthMe, V1AuthSessionResponse } from '@/types/api';
import { useV1EmailLogin, useV1LoginStepUpVerify } from './use-v1-api';

describe('useV1EmailLogin', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('replaces a cached auth error with the authoritative login snapshot', async () => {
    const session: V1AuthSessionResponse = {
      session: { userId: 'user-1', userEmail: 'user@example.com' },
      user: {
        id: 'user-1',
        email: 'user@example.com',
        onboardingStatus: 'completed',
      },
      profile: {
        displayName: '테스트 사용자',
      },
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ status: 'success', data: session, timestamp: new Date().toISOString() }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    queryClient.setQueryData(v1Keys.authMe(), undefined);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useV1EmailLogin(), { wrapper });

    await act(() => result.current.mutateAsync({ email: 'user@example.com', password: 'password123' }));

    expect(queryClient.getQueryData<V1AuthMe>(v1Keys.authMe())).toEqual(session);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not cache a step-up challenge as the signed-in user', async () => {
    const stepUp = {
      challengeToken: 'opaque-token',
      maskedEmail: 'us***@example.com',
      expiresAt: '2026-10-21T00:05:00.000Z',
      resendAvailableAt: '2026-10-21T00:00:30.000Z',
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ status: 'success', data: { stepUp }, timestamp: new Date().toISOString() }),
    }));
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useV1EmailLogin(), { wrapper });

    const response = await act(() => result.current.mutateAsync({ email: 'user@example.com', password: 'wrong-guess' }));

    expect(response).toEqual({ stepUp });
    expect(queryClient.getQueryData(v1Keys.authMe())).toBeUndefined();
  });
});

describe('useV1LoginStepUpVerify', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the challenge token and code, and caches the verified session as the auth snapshot', async () => {
    const session: V1AuthSessionResponse = {
      session: { userId: 'user-1', userEmail: 'user@example.com' },
      user: { id: 'user-1', email: 'user@example.com', onboardingStatus: 'completed' },
      profile: { displayName: '테스트 사용자' },
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ status: 'success', data: session, timestamp: new Date().toISOString() }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useV1LoginStepUpVerify(), { wrapper });

    await act(() => result.current.mutateAsync({ challengeToken: 'opaque-token', code: '123456' }));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/auth\/login\/step-up\/verify$/);
    expect(JSON.parse(String(init.body))).toEqual({ challengeToken: 'opaque-token', code: '123456' });
    expect(queryClient.getQueryData<V1AuthMe>(v1Keys.authMe())).toEqual(session);
  });
});
