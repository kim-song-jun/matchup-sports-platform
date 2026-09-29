/**
 * Task 178 경기 명단 훅 — 실제 api-client 가 MSW 서버에 보내는 요청(경로·바디)과, 쓰기 뒤 어떤 화면
 * 데이터가 **다시 불려 오는지**를 본다. 무효화 호출 수가 아니라 GET 이 실제로 다시 나갔는지를 세야
 * 키를 틀리게 넘긴 경우를 잡는다.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createV1GameRosterMswHandlers, GAME_ROSTER_MSW } from '@/test/msw/game-roster-handlers';
import { gameRosterErrorMessage } from '@/lib/game-roster-errors';
import { useV1TeamUpcomingGames } from './use-v1-api';
import {
  useV1AdminRegistrationGameRosters,
  useV1ApplyGameRosterBatch,
  useV1CreateMemberUnavailability,
  useV1ExcludeGameRosterPlayer,
  useV1GameRoster,
  useV1GameRosterAdjustments,
  useV1MemberUnavailability,
  useV1RevokeGameRosterAdjustment,
  useV1TeamGameRosters,
} from './use-v1-game-roster';

const { teamId } = GAME_ROSTER_MSW;
const [G1, G2] = GAME_ROSTER_MSW.games;
const ROSTER_1 = `/api/v1/games/${G1.gameId}/sides/${G1.sideId}/roster`;
const ROSTER_2 = `/api/v1/games/${G2.gameId}/sides/${G2.sideId}/roster`;
const HISTORY_1 = `/api/v1/games/${G1.gameId}/sides/${G1.sideId}/roster-adjustments`;
const MATRIX = `/api/v1/teams/${teamId}/game-rosters`;

let mock: ReturnType<typeof createV1GameRosterMswHandlers>;
let server: ReturnType<typeof setupServer>;
let upcomingFetches = 0;

function gets(path: string) {
  return mock.requests.filter((r) => r.method === 'GET' && r.path === path).length;
}

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  mock = createV1GameRosterMswHandlers();
  upcomingFetches = 0;
  server = setupServer(
    ...mock.handlers,
    http.get('*/api/v1/teams/:teamId/upcoming-games', () => {
      upcomingFetches += 1;
      return HttpResponse.json({ status: 'success', data: { items: [] }, timestamp: '2026-10-01T00:00:00.000Z' });
    }),
    http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
  );
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.close();
  vi.unstubAllEnvs();
});

function useSideScreen() {
  return {
    roster: useV1GameRoster(G1.gameId, G1.sideId),
    history: useV1GameRosterAdjustments(G1.gameId, G1.sideId),
    matrix: useV1TeamGameRosters(teamId),
    upcoming: useV1TeamUpcomingGames(teamId),
    exclude: useV1ExcludeGameRosterPlayer(G1.gameId, G1.sideId),
    revoke: useV1RevokeGameRosterAdjustment(G1.gameId, G1.sideId),
  };
}

describe('경기 한 사이드 조정', () => {
  it('빼기는 사유를 실어 보내고, 명단은 응답으로 바로 바뀌며 기록·팀 표·다가오는 경기를 다시 받는다', async () => {
    const { result } = renderHook(useSideScreen, { wrapper: wrapper() });
    await waitFor(() => expect(result.current.roster.data?.counts.participating).toBe(3));
    await waitFor(() => expect(result.current.matrix.isSuccess && result.current.history.isSuccess).toBe(true));
    await waitFor(() => expect(upcomingFetches).toBe(1));

    await act(() => result.current.exclude.mutateAsync({ userId: 'player-2', reason: 'INJURY' }));

    expect(mock.requests.find((r) => r.method === 'POST')).toEqual({
      method: 'POST',
      path: HISTORY_1,
      body: { userId: 'player-2', reason: 'INJURY' },
    });
    await waitFor(() => expect(result.current.roster.data?.counts).toMatchObject({ participating: 2, excluded: 1 }));
    expect(result.current.roster.data?.excluded[0]).toMatchObject({ userId: 'player-2', reason: 'INJURY' });
    await waitFor(() => expect(gets(HISTORY_1)).toBe(2));
    await waitFor(() => expect(gets(MATRIX)).toBe(2));
    await waitFor(() => expect(upcomingFetches).toBe(2));
    await waitFor(() => expect(result.current.history.data?.events.map((e) => e.type)).toEqual(['EXCLUDE']));
    // 응답이 새 명단을 실어 오므로 명단 GET 은 다시 나가지 않는다.
    expect(gets(ROSTER_1)).toBe(1);
  });

  it('되돌리기는 사용자 경로로 DELETE 하고 선수가 출전으로 돌아온다', async () => {
    const { result } = renderHook(useSideScreen, { wrapper: wrapper() });
    await waitFor(() => expect(result.current.roster.isSuccess).toBe(true));
    await act(() => result.current.exclude.mutateAsync({ userId: 'player-1' }));
    expect(mock.requests.find((r) => r.method === 'POST')?.body).toEqual({ userId: 'player-1' });

    await act(() => result.current.revoke.mutateAsync('player-1'));

    expect(mock.requests.filter((r) => r.method === 'DELETE').map((r) => r.path)).toEqual([`${HISTORY_1}/player-1`]);
    await waitFor(() => expect(result.current.roster.data?.counts).toMatchObject({ participating: 3, excluded: 0 }));
    await waitFor(() => expect(result.current.history.data?.events.map((e) => e.type)).toEqual(['EXCLUDE', 'REVOKE']));
  });

  it('경기가 시작되면 409 를 해요체 안내로 바꿔 보여 준다', async () => {
    mock.setGameState(G1.gameId, 'LIVE');
    const { result } = renderHook(useSideScreen, { wrapper: wrapper() });
    await waitFor(() => expect(result.current.roster.data?.editable).toBe(false));

    const error = await result.current.exclude.mutateAsync({ userId: 'player-1' }).catch((e: unknown) => e);

    expect(gameRosterErrorMessage(error, '명단을 바꾸지 못했어요.')).toBe(
      '경기가 시작돼서 명단을 바꿀 수 없어요. 바꿀 게 있으면 운영진에게 알려 주세요.',
    );
    expect(gets(MATRIX)).toBe(1);
  });

  it('명단 밖 선수는 422 코드 문구로 안내한다', async () => {
    const { result } = renderHook(useSideScreen, { wrapper: wrapper() });
    await waitFor(() => expect(result.current.roster.isSuccess).toBe(true));
    const error = await result.current.exclude.mutateAsync({ userId: 'stranger' }).catch((e: unknown) => e);
    expect(gameRosterErrorMessage(error, '명단을 바꾸지 못했어요.')).toBe(
      '참가 명단에 없는 선수예요. 명단을 새로 불러와 주세요.',
    );
  });
});

describe('팀 B 일괄 저장', () => {
  it('변경 목록을 한 번에 보내고, 바뀐 두 경기 명단과 팀 표를 다시 받는다', async () => {
    const { result } = renderHook(
      () => ({
        r1: useV1GameRoster(G1.gameId, G1.sideId),
        r2: useV1GameRoster(G2.gameId, G2.sideId),
        matrix: useV1TeamGameRosters(teamId),
        batch: useV1ApplyGameRosterBatch(teamId),
      }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.r1.isSuccess && result.current.r2.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.matrix.isSuccess).toBe(true));
    const changes = [
      { gameId: G1.gameId, userId: 'player-2', op: 'EXCLUDE' as const, reason: 'PERSONAL' as const },
      { gameId: G2.gameId, userId: 'player-2', op: 'EXCLUDE' as const },
    ];

    await act(() => result.current.batch.mutateAsync(changes));

    expect(mock.requests.find((r) => r.method === 'POST')).toEqual({
      method: 'POST',
      path: `/api/v1/teams/${teamId}/game-rosters/batch`,
      body: { changes },
    });
    await waitFor(() => expect(result.current.r1.data?.counts.excluded).toBe(1));
    await waitFor(() => expect(result.current.r2.data?.counts.excluded).toBe(1));
    await waitFor(() =>
      expect(result.current.matrix.data?.players.find((p) => p.userId === 'player-2')?.cells.map((c) => c.status)).toEqual([
        'EXCLUDED',
        'EXCLUDED',
      ]),
    );
  });

  it('시작된 경기가 섞이면 409 로 아무것도 쓰지 않는다', async () => {
    mock.setGameState(G2.gameId, 'LIVE');
    const { result } = renderHook(() => useV1ApplyGameRosterBatch(teamId), { wrapper: wrapper() });
    const error = await result.current
      .mutateAsync([
        { gameId: G1.gameId, userId: 'player-1', op: 'EXCLUDE' },
        { gameId: G2.gameId, userId: 'player-1', op: 'EXCLUDE' },
      ])
      .catch((e: unknown) => e);
    expect(gameRosterErrorMessage(error, '저장하지 못했어요.')).toMatch(/경기가 시작돼서/);
    expect(gets(ROSTER_1)).toBe(0);
  });
});

describe('팀 C 결장 기간', () => {
  it('등록하면 기간 안 경기 명단만 결장으로 바뀌고 결장 목록을 다시 받는다', async () => {
    const { result } = renderHook(
      () => ({
        r1: useV1GameRoster(G1.gameId, G1.sideId),
        r2: useV1GameRoster(G2.gameId, G2.sideId),
        list: useV1MemberUnavailability(teamId, 'player-3'),
        create: useV1CreateMemberUnavailability(teamId, 'player-3'),
      }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.list.data?.items).toEqual([]));
    await waitFor(() => expect(result.current.r1.isSuccess && result.current.r2.isSuccess).toBe(true));
    // 1경기(10/4)만 덮는 기간 — 2경기(10/11)는 그대로여야 한다.
    const payload = { startsAt: '2026-10-03T15:00:00.000Z', endsAt: '2026-10-05T15:00:00.000Z', reason: 'INJURY' as const };

    const created = await act(() => result.current.create.mutateAsync(payload));

    expect(created.unavailability).toMatchObject({ userId: 'player-3', reason: 'INJURY', revokedAt: null });
    expect(mock.requests.find((r) => r.method === 'POST')).toEqual({
      method: 'POST',
      path: `/api/v1/teams/${teamId}/members/player-3/unavailability`,
      body: payload,
    });
    await waitFor(() => expect(result.current.r1.data?.unavailable.map((u) => u.userId)).toEqual(['player-3']));
    await waitFor(() => expect(gets(ROSTER_2)).toBe(2));
    expect(result.current.r2.data?.counts.unavailable).toBe(0);
    await waitFor(() => expect(result.current.list.data?.items).toHaveLength(1));
  });
});

describe('어드민 참가 신청 펼침', () => {
  it('대회·신청 id 로 선수 × 경기 표를 받는다', async () => {
    const { tournamentId, registrationId } = GAME_ROSTER_MSW;
    const { result } = renderHook(() => useV1AdminRegistrationGameRosters(tournamentId, registrationId), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.data?.games.map((g) => g.gameId)).toEqual([G1.gameId, G2.gameId]));
    expect(mock.requests.map((r) => r.path)).toEqual([
      `/api/v1/admin/tournaments/${tournamentId}/registrations/${registrationId}/game-rosters`,
    ]);
  });

  it('id 가 비면 요청하지 않는다', () => {
    renderHook(() => useV1AdminRegistrationGameRosters('tournament-1', null), { wrapper: wrapper() });
    expect(mock.requests).toEqual([]);
  });
});
