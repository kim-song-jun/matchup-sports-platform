import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return {
    ...actual,
    v1Post: vi.fn().mockResolvedValue({ leagueId: 'series-1', title: '가을 풋살 리그', state: 'draft' }),
    v1Patch: vi.fn().mockResolvedValue({ teamMatchId: 'tm-1', startAt: '2026-09-01T20:00:00.000Z', placeName: '강남 풋살파크', placeAddress: null }),
  };
});

import { v1Patch, v1Post } from '@/lib/api-client';
import { useV1CreateLeagueMatch, useV1UpdateLeagueFixture } from './use-v1-api';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

describe('useV1CreateLeagueMatch', () => {
  it('리그 생성 요청을 POST /admin/league-matches 로 그대로 보낸다', async () => {
    const { result } = renderHook(() => useV1CreateLeagueMatch(), { wrapper });

    result.current.mutate({
      title: '가을 풋살 리그',
      sportId: 'sport-futsal',
      regionId: 'region-1',
      startsOn: '2026-09-01T00:00:00.000Z',
      endsOn: '2026-10-20T00:00:00.000Z',
      teamIds: ['team-a', 'team-b'],
    });

    await waitFor(() => expect(v1Post).toHaveBeenCalled());
    expect(v1Post).toHaveBeenCalledWith('/admin/league-matches', {
      title: '가을 풋살 리그',
      sportId: 'sport-futsal',
      regionId: 'region-1',
      startsOn: '2026-09-01T00:00:00.000Z',
      endsOn: '2026-10-20T00:00:00.000Z',
      teamIds: ['team-a', 'team-b'],
    });
  });
});

describe('useV1UpdateLeagueFixture', () => {
  it('리그ID·팀매치ID를 경로에 넣고 body는 감싸지 않는다', async () => {
    const { result } = renderHook(() => useV1UpdateLeagueFixture('series-1'), { wrapper });

    result.current.mutate({ teamMatchId: 'tm-1', body: { startsAt: '2026-09-01T20:00:00.000Z', placeName: '강남 풋살파크' } });

    await waitFor(() => expect(v1Patch).toHaveBeenCalled());
    expect(v1Patch).toHaveBeenCalledWith('/admin/league-matches/series-1/fixtures/tm-1', {
      startsAt: '2026-09-01T20:00:00.000Z',
      placeName: '강남 풋살파크',
    });
  });
});
