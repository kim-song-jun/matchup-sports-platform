import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { mockTeam1, mockTeam2, mockMyTeamMemberships } from '@/test/fixtures/teams';

// Mock auth store
let mockIsAuthenticated = true;

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn((selector?: (s: { isAuthenticated: boolean }) => unknown) => {
    const state = { isAuthenticated: mockIsAuthenticated };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('@/lib/api', () => {
  const mockApi = {
    post: vi.fn(),
    get: vi.fn(),
  };
  return { api: mockApi };
});

import { useMyTeams, useTeams } from '../use-api';
import { api } from '@/lib/api';

const mockApi = api as unknown as { post: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useMyTeams', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = true;
  });

  it('returns my team list when authenticated', async () => {
    // Mock returns membership-wrapped shape (backend listUserTeams() contract)
    mockApi.get.mockResolvedValueOnce({
      status: 'success',
      data: mockMyTeamMemberships,
    });

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useMyTeams(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.get).toHaveBeenCalledWith('/teams/me');
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].name).toBe('서울 FC');
    expect(result.current.data?.[0].role).toBe('owner');
    expect(result.current.data?.[1].role).toBe('member');
  });

  it('is disabled when not authenticated', () => {
    mockIsAuthenticated = false;

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useMyTeams(), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockApi.get).not.toHaveBeenCalled();
  });
});

describe('useTeams', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = true;
  });

  it('returns paginated team list', async () => {
    mockApi.get.mockResolvedValueOnce({
      status: 'success',
      data: { items: [mockTeam1, mockTeam2], nextCursor: null },
    });

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useTeams(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.get).toHaveBeenCalledWith('/teams', { params: undefined });
    expect(result.current.data?.items).toHaveLength(2);
  });

  it('passes filter params to the API', async () => {
    mockApi.get.mockResolvedValueOnce({
      status: 'success',
      data: { items: [mockTeam1], nextCursor: null },
    });

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useTeams({ sportType: 'soccer' }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.get).toHaveBeenCalledWith('/teams', { params: { sportType: 'soccer' } });
    expect(result.current.data?.items).toHaveLength(1);
  });
});
