import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn((selector?: (s: { isAuthenticated: boolean }) => unknown) => {
    const state = { isAuthenticated: true };
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

import { useMatches, useApplyTeamMatch } from '../use-api';
import { api } from '@/lib/api';

const mockApi = api as unknown as { post: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };

const mockMatch = {
  id: 'match-1',
  sportType: 'SOCCER',
  status: 'RECRUITING',
  scheduledAt: '2025-06-01T10:00:00.000Z',
  venueName: '서울 풋살장',
  maxParticipants: 10,
  currentParticipants: 5,
  fee: 10000,
};

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useMatches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns paginated match list', async () => {
    mockApi.get.mockResolvedValueOnce({
      status: 'success',
      data: { items: [mockMatch], nextCursor: null },
    });

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useMatches(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.get).toHaveBeenCalledWith('/matches', { params: undefined });
    expect(result.current.data?.items).toHaveLength(1);
    expect(result.current.data?.items[0].sportType).toBe('SOCCER');
  });

  it('passes sportType filter param', async () => {
    mockApi.get.mockResolvedValueOnce({
      status: 'success',
      data: { items: [mockMatch], nextCursor: null },
    });

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useMatches({ sportType: 'SOCCER' }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.get).toHaveBeenCalledWith('/matches', { params: { sportType: 'SOCCER' } });
  });

  it('passes extended discovery params 그대로 to the api client', async () => {
    mockApi.get.mockResolvedValueOnce({
      status: 'success',
      data: { items: [mockMatch], nextCursor: null },
    });

    const wrapper = makeWrapper();
    const params = {
      sportType: 'futsal',
      q: '강남',
      date: '2026-04-08',
      freeOnly: 'true',
      availableOnly: 'true',
      beginnerFriendly: 'true',
      sort: 'deadline',
    };
    const { result } = renderHook(() => useMatches(params), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.get).toHaveBeenCalledWith('/matches', { params });
  });
});

describe('useApplyTeamMatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts to team-matches/:id/apply on mutate', async () => {
    mockApi.post.mockResolvedValueOnce({
      status: 'success',
      data: { id: 'app-1' },
    });
    mockApi.get.mockResolvedValue({
      status: 'success',
      data: {},
    });

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useApplyTeamMatch(), { wrapper });

    result.current.mutate({ id: 'tm-1', data: { teamId: 'team-1', message: '신청합니다' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.post).toHaveBeenCalledWith('/team-matches/tm-1/apply', {
      teamId: 'team-1',
      message: '신청합니다',
    });
  });

  it('returns error state on mutation failure', async () => {
    mockApi.post.mockRejectedValueOnce(new Error('Network error'));

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useApplyTeamMatch(), { wrapper });

    result.current.mutate({ id: 'tm-1', data: { teamId: 'team-1' } });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
