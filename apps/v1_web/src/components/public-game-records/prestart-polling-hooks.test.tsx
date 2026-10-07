import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useV1Tournament } from '@/hooks/use-v1-api';
import { usePublicLeagueFixtureRecord, usePublicMatch } from './use-public-game-records';

const { v1Get } = vi.hoisted(() => ({ v1Get: vi.fn() }));
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/api-client')>(), v1Get,
}));

afterEach(() => {
  vi.useRealTimers();
  v1Get.mockReset();
});

function useMatchSurface() { return usePublicMatch('tournament-1', 'fixture-1'); }
function useLeagueSurface() { return usePublicLeagueFixtureRecord('league-1', 'fixture-1'); }
function useBracketSurface() { return useV1Tournament('tournament-1', { livePolling: true }); }

describe('공개 경기 훅의 시작 전 자동 갱신', () => {
  it.each(['match', 'league-record', 'bracket'] as const)('%s는 새로고침 없이 예정 경기의 시작을 조회한다', async (surface) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T09:46:00.000Z'));
    const scheduledAt = '2026-10-10T10:00:00.000Z';
    const path = surface === 'match' ? '/tournaments/tournament-1/matches/fixture-1'
      : surface === 'league-record' ? '/league-matches/league-1/fixtures/fixture-1/record'
        : '/tournaments/tournament-1';
    let requests = 0;
    v1Get.mockImplementation(async (requestedPath: string) => {
      if (requestedPath !== path) throw new Error(`Unexpected public route: ${requestedPath}`);
      const status = ++requests === 1 ? 'scheduled' : 'live';
      return surface === 'bracket'
        ? { id: 'tournament-1', status: 'in_progress', fixtures: [{ id: 'fixture-1', liveStatus: status, scheduledAt }] }
        : { id: 'fixture-1', status, scheduledAt };
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const useSurface = surface === 'match' ? useMatchSurface
      : surface === 'league-record' ? useLeagueSurface : useBracketSurface;
    const { result, unmount } = renderHook(() => useSurface(), { wrapper });
    const status = () => {
      const data = result.current.data as { status?: string; fixtures?: { liveStatus: string }[] } | undefined;
      return surface === 'bracket' ? data?.fixtures?.[0]?.liveStatus : data?.status;
    };
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(status()).toBe('scheduled');
      expect(v1Get).toHaveBeenCalledWith(path);
      await act(async () => { await vi.advanceTimersByTimeAsync(9_999); });
      expect(requests).toBe(1);
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      expect(requests).toBe(2);
      // Query observer의 비동기 React 알림도 진행시킨다. 요청 횟수는 앞에서 별도로 확인한다.
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      expect(status()).toBe('live');
    } finally {
      unmount();
      client.clear();
    }
  });
});
