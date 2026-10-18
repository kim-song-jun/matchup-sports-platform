import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createV1QueryClient } from '@/lib/query-client';
import type { PublicTeamRecordsResponse } from './types';

const { v1Get } = vi.hoisted(() => ({ v1Get: vi.fn() }));
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/api-client')>(),
  v1Get,
}));

import { usePublicTeamRecords } from './use-public-game-records';

function response(teamName: string): PublicTeamRecordsResponse {
  return {
    teamId: 'team-1',
    teamName,
    teamLogoUrl: null,
    summary: {
      played: 1,
      won: 1,
      drawn: 0,
      lost: 0,
      goalsFor: 2,
      goalsAgainst: 1,
      byType: {
        tournament: { played: 1, won: 1, drawn: 0, lost: 0, goalsFor: 2, goalsAgainst: 1 },
        league: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
        friendly: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
      },
    },
    availableSeasons: ['2026'],
    items: [{
      gameId: 'game-1',
      teamMatchId: null,
      tournamentId: 'tournament-1',
      tournamentTitle: '봄 대회',
      leagueId: null,
      leagueTitle: null,
      type: 'tournament',
      opponentTeamId: 'opponent-1',
      opponentTeamName: '상대 팀',
      opponentTeamLogoUrl: null,
      result: 'WON',
      goalsFor: 2,
      goalsAgainst: 1,
      playedAt: '2026-04-01T10:00:00.000Z',
      penalties: null,
      isForfeit: false,
      events: [],
    }],
    nextCursor: null,
  };
}

function createWrapper(client: ReturnType<typeof createV1QueryClient>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

afterEach(() => {
  v1Get.mockReset();
});

describe('usePublicTeamRecords server seed freshness', () => {
  it('shows the server seed immediately, requests the same team on mount, then replaces it with the fresh API response', async () => {
    let resolveFresh!: (value: PublicTeamRecordsResponse) => void;
    const freshResponse = new Promise<PublicTeamRecordsResponse>((resolve) => {
      resolveFresh = resolve;
    });
    v1Get.mockReturnValue(freshResponse);

    const client = createV1QueryClient();
    const { result, unmount } = renderHook(
      () => usePublicTeamRecords('team-1', undefined, undefined, { seed: response('서버 시드 팀') }),
      { wrapper: createWrapper(client) },
    );

    try {
      expect(result.current.data?.pages[0]?.teamName).toBe('서버 시드 팀');
      expect(result.current.isPlaceholderData).toBe(true);
      await waitFor(() => expect(v1Get).toHaveBeenCalledWith('/teams/team-1/records', {}));

      await act(async () => {
        resolveFresh(response('API 최신 팀'));
        await freshResponse;
      });

      await waitFor(() => expect(result.current.data?.pages[0]?.teamName).toBe('API 최신 팀'));
      expect(result.current.isPlaceholderData).toBe(false);
    } finally {
      unmount();
      client.clear();
    }
  });
});
