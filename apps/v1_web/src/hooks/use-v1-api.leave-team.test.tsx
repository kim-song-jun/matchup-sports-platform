import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { v1Post } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';
import { useV1LeaveTeam } from './use-v1-api';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, v1Post: vi.fn() };
});

const v1PostMock = vi.mocked(v1Post);

function createWrapper(queryClient: QueryClient) {
  return function TestQueryProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useV1LeaveTeam', () => {
  afterEach(() => vi.clearAllMocks());

  it('resets the active team-match detail and league caches before fresh viewer data arrives', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const oldMatch = { teamMatchId: 'match-1', viewer: { participantMember: true } };
    const outsiderMatch = { teamMatchId: 'match-1', viewer: { participantMember: false } };
    queryClient.setQueryData(v1Keys.teamMatch('match-1'), oldMatch);
    queryClient.setQueryData(v1Keys.myLeagues(), { items: [{ leagueId: 'league-1', myTeams: [] }] });
    let resolveMatch!: (value: typeof outsiderMatch) => void;
    const freshMatch = new Promise<typeof outsiderMatch>((resolve) => {
      resolveMatch = resolve;
    });
    v1PostMock.mockResolvedValue({ id: 'membership-1' } as never);

    const detail = renderHook(
      () => useQuery({ queryKey: v1Keys.teamMatch('match-1'), queryFn: () => freshMatch }),
      { wrapper: createWrapper(queryClient) },
    );
    const leave = renderHook(() => useV1LeaveTeam('team-1'), { wrapper: createWrapper(queryClient) });
    leave.result.current.mutate();

    await waitFor(() => {
      expect(detail.result.current.data).toBeUndefined();
      expect(detail.result.current.isPending).toBe(true);
    });
    expect(queryClient.getQueryData(v1Keys.teamMatch('match-1'))).toBeUndefined();
    expect(queryClient.getQueryData(v1Keys.myLeagues())).toBeUndefined();

    resolveMatch(outsiderMatch);
    await waitFor(() => expect(detail.result.current.data).toEqual(outsiderMatch));
    await waitFor(() => expect(leave.result.current.isSuccess).toBe(true));
  });

  it('keeps viewer-scoped caches when leaving fails', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const matches = [{ teamMatchId: 'match-1', viewer: { participantMember: true } }];
    const leagues = [{ leagueId: 'league-1' }];
    queryClient.setQueryData(v1Keys.teamMatch('match-1'), matches[0]);
    queryClient.setQueryData(v1Keys.myLeagues(), { items: leagues });
    v1PostMock.mockRejectedValue(new Error('leave failed'));

    const { result } = renderHook(() => useV1LeaveTeam('team-1'), { wrapper: createWrapper(queryClient) });
    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData(v1Keys.teamMatch('match-1'))).toEqual(matches[0]);
    expect(queryClient.getQueryData(v1Keys.myLeagues())).toEqual({ items: leagues });
  });
});
