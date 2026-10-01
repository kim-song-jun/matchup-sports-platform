/**
 * W7-V2 — 경기 명단에서 [참가 명단에서 선수 추가·빼기]로 가서 선수를 빼고 뒤로 돌아오면, 새로고침 전까지
 * 옛 출전 화면과 "…출전에 들어갔어요." 안내가 남았다. 안내는 서버 응답(`joinedAfterFixtureCreated`)에서
 * 나오므로 원인은 하나다 — 경기 명단 캐시가 60초 동안 신선해 다시 마운트돼도 조회하지 않았다.
 *
 * 앱의 실제 기본값(`createV1QueryClient`, staleTime 60초)으로 "떠남 → 참가 명단 변경 → 돌아옴"을 밟고
 * 경기 명단을 다시 받는지 본다. 기본값을 0으로 두면 고치기 전에도 늘 다시 받아 이 결함을 못 잡는다.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { v1Get, v1Post, v1Patch, v1Api } = vi.hoisted(() => ({
  v1Get: vi.fn(),
  v1Post: vi.fn(),
  v1Patch: vi.fn(),
  v1Api: vi.fn(),
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, v1Get, v1Post, v1Patch, v1Api };
});

import { createV1QueryClient } from '@/lib/query-client';
import { useV1AddPlayer, useV1RemovePlayer, useV1TeamUpcomingGames, useV1UpdatePlayerJersey } from './use-v1-api';
import { useV1TeamGameRoster } from './use-v1-game-roster';

const TOURNAMENT_ID = 'tournament-1';
const REGISTRATION_ID = 'registration-1';
const TEAM_ID = 'team-1';
const GAME_ID = 'game-1';
const GAME_ROSTER_PATH = `/teams/${TEAM_ID}/games/${GAME_ID}/roster`;
const UPCOMING_PATH = `/teams/${TEAM_ID}/upcoming-games`;

function fetchCount(path: string) {
  return v1Get.mock.calls.filter(([calledPath]) => calledPath === path).length;
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

type RosterChange = (client: QueryClient) => Promise<void>;

const removePlayer: RosterChange = async (client) => {
  const { result, unmount } = renderHook(() => useV1RemovePlayer(TOURNAMENT_ID, REGISTRATION_ID), {
    wrapper: wrapperFor(client),
  });
  await act(() => result.current.mutateAsync('player-1'));
  unmount();
};

const addPlayer: RosterChange = async (client) => {
  const { result, unmount } = renderHook(() => useV1AddPlayer(TOURNAMENT_ID, REGISTRATION_ID), {
    wrapper: wrapperFor(client),
  });
  await act(() => result.current.mutateAsync({ userId: 'user-9', realName: '초대1' }));
  unmount();
};

const changeJersey: RosterChange = async (client) => {
  const { result, unmount } = renderHook(() => useV1UpdatePlayerJersey(TOURNAMENT_ID, REGISTRATION_ID), {
    wrapper: wrapperFor(client),
  });
  await act(() => result.current.mutateAsync({ playerId: 'player-1', jerseyNumber: 19 }));
  unmount();
};

describe('참가 명단을 바꾸면 그 팀의 경기 명단 캐시가 낡는다', () => {
  beforeEach(() => {
    v1Get.mockReset();
    v1Post.mockReset();
    v1Patch.mockReset();
    v1Api.mockReset();
    v1Get.mockResolvedValue({ items: [] });
    v1Post.mockResolvedValue({ id: 'player-9' });
    v1Patch.mockResolvedValue({ id: 'player-1' });
    v1Api.mockResolvedValue({ id: 'player-1' });
  });

  /** 경기 명단을 열었다가 떠나고(change), 뒤로가기로 다시 연다. */
  async function leaveChangeAndReturn(change: RosterChange | null) {
    const client = createV1QueryClient();
    const first = renderHook(() => useV1TeamGameRoster(TEAM_ID, GAME_ID), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();
    if (change) await change(client);
    const back = renderHook(() => useV1TeamGameRoster(TEAM_ID, GAME_ID), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(back.result.current.isFetching).toBe(false));
  }

  it.each([
    ['선수 삭제', removePlayer],
    ['선수 추가', addPlayer],
    ['등번호 변경', changeJersey],
  ] as const)('%s 뒤 돌아오면 경기 명단을 다시 받는다', async (_label, change) => {
    await leaveChangeAndReturn(change);

    await waitFor(() => expect(fetchCount(GAME_ROSTER_PATH)).toBe(2));
  });

  it('대조군: 참가 명단을 안 바꾸고 돌아오면 60초 안에는 다시 받지 않는다 — 위 단언이 공허하지 않다', async () => {
    await leaveChangeAndReturn(null);

    expect(fetchCount(GAME_ROSTER_PATH)).toBe(1);
  });

  it('열려 있는 다가오는 경기 요약(출전 인원)도 다시 받는다', async () => {
    const client = createV1QueryClient();
    const upcoming = renderHook(() => useV1TeamUpcomingGames(TEAM_ID), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(upcoming.result.current.isSuccess).toBe(true));

    await removePlayer(client);

    await waitFor(() => expect(fetchCount(UPCOMING_PATH)).toBe(2));
  });
});
