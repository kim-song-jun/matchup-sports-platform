import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

let mockIsAuthenticated = true;

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn(
    (selector?: (s: { isAuthenticated: boolean }) => unknown) => {
      const state = { isAuthenticated: mockIsAuthenticated };
      return selector ? selector(state) : state;
    },
  ),
}));

vi.mock('@/lib/api', () => {
  const mockApi = {
    get: vi.fn(),
    patch: vi.fn(),
  };
  return { api: mockApi };
});

import {
  queryKeys,
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '../use-api';
import { api } from '@/lib/api';
import type { NotificationPreference } from '@/types/api';

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
};

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return { Wrapper, queryClient };
}

const basePreference: NotificationPreference = {
  id: 'pref-1',
  matchEnabled: true,
  teamEnabled: true,
  chatEnabled: true,
  paymentEnabled: true,
};

describe('notification preference hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = true;
  });

  it('fetches notification preferences when authenticated', async () => {
    mockApi.get.mockResolvedValueOnce({
      status: 'success',
      data: basePreference,
    });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useNotificationPreferences(), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.get).toHaveBeenCalledWith('/notifications/preferences');
    expect(result.current.data).toEqual(basePreference);
  });

  it('does not fetch notification preferences when unauthenticated', () => {
    mockIsAuthenticated = false;

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useNotificationPreferences(), {
      wrapper: Wrapper,
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockApi.get).not.toHaveBeenCalled();
  });

  it('updates preferences with partial payload and keeps cache in sync', async () => {
    const { Wrapper, queryClient } = makeWrapper();

    queryClient.setQueryData(queryKeys.notifications.preferences, basePreference);
    mockApi.patch.mockResolvedValueOnce({
      status: 'success',
      data: { ...basePreference, chatEnabled: false },
    });

    const { result } = renderHook(() => useUpdateNotificationPreferences(), {
      wrapper: Wrapper,
    });

    result.current.mutate({ chatEnabled: false });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.patch).toHaveBeenCalledWith('/notifications/preferences', {
      chatEnabled: false,
    });

    const cached = queryClient.getQueryData<NotificationPreference>(
      queryKeys.notifications.preferences,
    );
    expect(cached?.chatEnabled).toBe(false);
  });

  it('rolls back cached preferences when update fails', async () => {
    const { Wrapper, queryClient } = makeWrapper();

    queryClient.setQueryData(queryKeys.notifications.preferences, basePreference);
    mockApi.patch.mockRejectedValueOnce(new Error('update failed'));

    const { result } = renderHook(() => useUpdateNotificationPreferences(), {
      wrapper: Wrapper,
    });

    result.current.mutate({ paymentEnabled: false });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const cached = queryClient.getQueryData<NotificationPreference>(
      queryKeys.notifications.preferences,
    );
    expect(cached).toEqual(basePreference);
  });
});
