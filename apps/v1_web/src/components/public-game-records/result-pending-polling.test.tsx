import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useV1LeagueMatch, useV1LeagueMatchStandings } from '@/hooks/use-v1-api';
import { usePublicLeagueFixtureRecord } from './use-public-game-records';

const { v1Get } = vi.hoisted(() => ({ v1Get: vi.fn() }));
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/api-client')>(), v1Get,
}));

afterEach(() => {
  vi.useRealTimers();
  v1Get.mockReset();
});

function setup<T>(useSurface: () => T) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  const rendered = renderHook(useSurface, { wrapper });
  return { ...rendered, client };
}

async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

describe('결과 대기에서 공식 확정까지 열어 둔 화면이 스스로 갱신된다', () => {
  it('경기 상세(MD-QA #150): 끝났지만 확정 전이면 계속 묻고, 확정을 받으면 멈춘다', async () => {
    vi.useFakeTimers();
    let confirmed = false;
    v1Get.mockImplementation(async () => ({
      id: 'fixture-1', status: 'ended', scheduledAt: null, resultState: confirmed ? 'official' : 'pending',
    }));
    const { result, unmount, client } = setup(() => usePublicLeagueFixtureRecord('league-1', 'fixture-1'));
    try {
      await advance(0);
      expect(result.current.data?.resultState).toBe('pending');
      confirmed = true;
      await advance(10_000);
      await advance(1);
      expect(result.current.data?.resultState).toBe('official');
      const calls = v1Get.mock.calls.length;
      await advance(60_000);
      expect(v1Get.mock.calls.length).toBe(calls);
    } finally {
      unmount();
      client.clear();
    }
  });

  it('리그 상세(MD-QA #149): 결과 대기 경기를 계속 묻고, 확정되면 순위도 다시 받는다', async () => {
    vi.useFakeTimers();
    let confirmed = false;
    let standingsRequests = 0;
    v1Get.mockImplementation(async (path: string) => {
      if (path === '/league-matches/league-1/standings') {
        standingsRequests += 1;
        return { items: [], confirmed };
      }
      return {
        leagueId: 'league-1',
        fixtures: [{
          teamMatchId: 'fixture-1', status: 'matched', startAt: '2026-10-01T10:00:00.000Z', gameState: 'ENDED',
          homeScore: confirmed ? 1 : null, awayScore: confirmed ? 0 : null,
        }],
      };
    });
    const { result, unmount, client } = setup(() => ({
      league: useV1LeagueMatch('league-1'),
      standings: useV1LeagueMatchStandings('league-1'),
    }));
    try {
      await advance(0);
      expect(result.current.league.data?.fixtures[0]?.homeScore).toBeNull();
      expect(standingsRequests).toBe(1);
      confirmed = true;
      await advance(10_000);
      await advance(1);
      expect(result.current.league.data?.fixtures[0]?.homeScore).toBe(1);
      expect(standingsRequests).toBe(2);
      await advance(1);
      expect((result.current.standings.data as unknown as { confirmed: boolean }).confirmed).toBe(true);
      // 확정 뒤엔 둘 다 멈춘다.
      await advance(60_000);
      expect(standingsRequests).toBe(2);
    } finally {
      unmount();
      client.clear();
    }
  });
});
