import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { v1Keys } from '@/lib/query-keys';
import type { V1AuthMe, V1AuthSessionResponse } from '@/types/api';
import { useV1EmailLogin } from './use-v1-api';

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
});
