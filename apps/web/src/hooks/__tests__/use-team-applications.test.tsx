import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { mockTeamApplication1, mockTeamApplication2 } from '@/test/fixtures/teams';

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn((selector?: (s: { isAuthenticated: boolean }) => unknown) => {
    const state = { isAuthenticated: true };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('@/lib/api', () => {
  const mockApi = {
    get: vi.fn(),
    patch: vi.fn(),
  };
  return { api: mockApi };
});

import { useTeamApplications, useAcceptTeamApplication, useRejectTeamApplication } from '../use-api';
import { api } from '@/lib/api';

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
};

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useTeamApplications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches pending applications for a team', async () => {
    mockApi.get.mockResolvedValueOnce({
      status: 'success',
      data: [mockTeamApplication1, mockTeamApplication2],
    });

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useTeamApplications('team-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.get).toHaveBeenCalledWith('/teams/team-1/applications');
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].userId).toBe('user-3');
    expect(result.current.data?.[1].userId).toBe('user-4');
  });

  it('is disabled when teamId is empty', () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useTeamApplications(''), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockApi.get).not.toHaveBeenCalled();
  });

  it('is disabled when opts.enabled is false even with a valid teamId', () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(
      () => useTeamApplications('team-1', { enabled: false }),
      { wrapper },
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockApi.get).not.toHaveBeenCalled();
  });
});

describe('useAcceptTeamApplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls PATCH accept endpoint and invalidates queries on success', async () => {
    mockApi.patch.mockResolvedValueOnce({
      status: 'success',
      data: { teamId: 'team-1', userId: 'user-3', status: 'active' },
    });

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useAcceptTeamApplication(), { wrapper });

    result.current.mutate({ teamId: 'team-1', applicantUserId: 'user-3' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.patch).toHaveBeenCalledWith(
      '/teams/team-1/applications/user-3/accept',
    );
  });
});

describe('useRejectTeamApplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls PATCH reject endpoint and invalidates queries on success', async () => {
    mockApi.patch.mockResolvedValueOnce({
      status: 'success',
      data: { teamId: 'team-1', userId: 'user-3', status: 'left' },
    });

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useRejectTeamApplication(), { wrapper });

    result.current.mutate({ teamId: 'team-1', applicantUserId: 'user-3' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.patch).toHaveBeenCalledWith(
      '/teams/team-1/applications/user-3/reject',
    );
  });
});
