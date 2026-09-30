/**
 * Task 179 경기 명단 훅 — 실제 api-client 가 MSW 서버에 보내는 요청(경로·바디)과, 쓰기 뒤 어떤 화면
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
import {
  useV1ConfirmSideArrival,
  useV1FixtureLineup,
  useV1GameOperationsLineup,
  useV1SetParticipantArrival,
} from './use-v1-game-operations';
import { usePublicLeagueFixtureRecord, usePublicMatch } from '@/components/public-game-records/use-public-game-records';
import { OPERATIONS_BOARD_POLL_INTERVAL_MS } from '@/lib/operations-board-polling';
import {
  useV1AdminRegistrationGameRosterList,
  useV1AdminRegistrationGameRosters,
  useV1ApplyGameRosterBatch,
  useV1CreateMemberUnavailability,
  useV1MemberUnavailability,
  useV1RevokeMemberUnavailability,
  useV1TeamGameRoster,
  useV1TeamGameRosters,
  useV1TeamUnavailability,
} from './use-v1-game-roster';

const { teamId } = GAME_ROSTER_MSW;
const [G1, G2] = GAME_ROSTER_MSW.games;
const ROSTER_1 = `/api/v1/teams/${teamId}/games/${G1.gameId}/roster`;
const ROSTER_2 = `/api/v1/teams/${teamId}/games/${G2.gameId}/roster`;
const HISTORY_1 = `/api/v1/games/${G1.gameId}/sides/${G1.sideId}/roster-adjustments`;
const MATRIX = `/api/v1/teams/${teamId}/game-rosters`;

let mock: ReturnType<typeof createV1GameRosterMswHandlers>;
let server: ReturnType<typeof setupServer>;
let upcomingFetches = 0;
/** 명단을 읽는 다른 화면의 GET — 경로별 횟수. */
let readerFetches: Record<string, number>;
let arrivalFailure: { status: number; code: string } | null;
/** "전원 도착" 일괄 검인 요청 경로 기록 + 실패 주입. */
let confirmAllRequests: string[];
let confirmAllFailure: { status: number; code: string } | null;

const T_ID = GAME_ROSTER_MSW.tournamentId;
const READERS = {
  fixtureLineup: `/api/v1/tournament-ops/tournaments/${T_ID}/fixtures/fixture-1/lineup`,
  opsLineup1: `/api/v1/games/${G1.gameId}/operations-lineup`,
  opsLineup2: `/api/v1/games/${G2.gameId}/operations-lineup`,
  publicMatch: `/api/v1/tournaments/${T_ID}/matches/fixture-1`,
  leagueRecord: '/api/v1/league-matches/league-1/fixtures/tm-1/record',
};

const fetched = (path: string) => readerFetches[path] ?? 0;

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
  readerFetches = {};
  arrivalFailure = null;
  confirmAllRequests = [];
  confirmAllFailure = null;
  const countedReader = (data: unknown) => ({ request }: { request: Request }) => {
    const path = new URL(request.url).pathname;
    readerFetches[path] = (readerFetches[path] ?? 0) + 1;
    return HttpResponse.json({ status: 'success', data, timestamp: '2026-10-01T00:00:00.000Z' });
  };
  server = setupServer(
    ...mock.handlers,
    http.get('*/api/v1/teams/:teamId/upcoming-games', () => {
      upcomingFetches += 1;
      return HttpResponse.json({ status: 'success', data: { items: [] }, timestamp: '2026-10-01T00:00:00.000Z' });
    }),
    http.get('*/api/v1/tournament-ops/tournaments/:t/fixtures/:f/lineup', countedReader({ gameId: G1.gameId, lineups: [] })),
    http.get('*/api/v1/games/:gameId/operations-lineup', countedReader([])),
    http.get('*/api/v1/tournaments/:t/matches/:f', countedReader({ status: 'scheduled' })),
    http.get('*/api/v1/league-matches/:l/fixtures/:tm/record', countedReader({ status: 'scheduled' })),
    http.patch('*/api/v1/games/:gameId/participants/:participantId/arrival', () =>
      arrivalFailure === null
        ? HttpResponse.json({ status: 'success', data: { id: 'p-1', sideId: G1.sideId, arrivedAt: null }, timestamp: 'x' })
        : HttpResponse.json(
            { status: 'error', statusCode: arrivalFailure.status, code: arrivalFailure.code, message: '명단이 방금 바뀌었어요.', timestamp: 'x' },
            { status: arrivalFailure.status },
          ),
    ),
    http.post('*/api/v1/games/:gameId/sides/:sideId/arrival/confirm-all', ({ request }) => {
      confirmAllRequests.push(new URL(request.url).pathname);
      return confirmAllFailure === null
        ? HttpResponse.json({
            status: 'success',
            data: { sideId: G1.sideId, participantCount: 3, newlyArrivedCount: 2 },
            timestamp: 'x',
          })
        : HttpResponse.json(
            { status: 'error', statusCode: confirmAllFailure.status, code: confirmAllFailure.code, message: '권한이 없어요.', timestamp: 'x' },
            { status: confirmAllFailure.status },
          );
    }),
    http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
  );
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.close();
  vi.unstubAllEnvs();
});

describe('팀 B 일괄 저장', () => {
  it('변경 목록을 한 번에 보내고, 바뀐 두 경기 명단과 팀 표를 다시 받는다', async () => {
    const { result } = renderHook(
      () => ({
        r1: useV1TeamGameRoster(teamId, G1.gameId),
        r2: useV1TeamGameRoster(teamId, G2.gameId),
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

  it('참가 명단 밖 선수가 섞이면 422 코드 문구로 안내한다', async () => {
    const { result } = renderHook(() => useV1ApplyGameRosterBatch(teamId), { wrapper: wrapper() });
    const error = await result.current
      .mutateAsync([{ gameId: G1.gameId, userId: 'stranger', op: 'EXCLUDE' }])
      .catch((e: unknown) => e);
    expect(gameRosterErrorMessage(error, '저장하지 못했어요.')).toBe('참가 명단에 없는 선수예요. 명단을 새로 불러와 주세요.');
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

describe('명단이 바뀌면 그 명단을 읽는 다른 화면도 다시 받는다', () => {
  function useReaders() {
    return {
      fixtureLineup: useV1FixtureLineup(T_ID, 'fixture-1'),
      ops1: useV1GameOperationsLineup(G1.gameId),
      ops2: useV1GameOperationsLineup(G2.gameId),
      publicMatch: usePublicMatch(T_ID, 'fixture-1'),
      leagueRecord: usePublicLeagueFixtureRecord('league-1', 'tm-1'),
    };
  }
  async function readersLoaded(result: { current: ReturnType<typeof useReaders> }) {
    await waitFor(() =>
      expect(Object.fromEntries(Object.entries(result.current).map(([k, q]) => [k, q.status]))).toMatchObject({
        fixtureLineup: 'success',
        ops1: 'success',
        ops2: 'success',
        publicMatch: 'success',
        leagueRecord: 'success',
      }),
    );
  }

  it('일괄 저장 — 운영 콘솔 라인업·팀매치 콘솔(바뀐 경기만)·경기 상세 공개 기록', async () => {
    const { result } = renderHook(() => ({ ...useReaders(), batch: useV1ApplyGameRosterBatch(teamId) }), { wrapper: wrapper() });
    await readersLoaded(result);

    await act(() => result.current.batch.mutateAsync([{ gameId: G1.gameId, userId: 'player-2', op: 'EXCLUDE' }]));

    for (const path of [READERS.fixtureLineup, READERS.opsLineup1, READERS.publicMatch, READERS.leagueRecord]) {
      await waitFor(() => expect(fetched(path), path).toBe(2));
    }
    // 대조군: 명단이 바뀌지 않은 경기의 팀매치 콘솔 라인업은 그대로 둔다.
    expect(fetched(READERS.opsLineup2)).toBe(1);
  });

  it('결장 기간은 어느 경기가 바뀌는지 몰라 떠 있는 라인업을 모두 다시 받는다', async () => {
    const { result } = renderHook(
      () => ({ ...useReaders(), create: useV1CreateMemberUnavailability(teamId, 'player-3') }),
      { wrapper: wrapper() },
    );
    await readersLoaded(result);
    await act(() => result.current.create.mutateAsync({ startsAt: '2026-10-03T15:00:00.000Z', endsAt: '2026-10-05T15:00:00.000Z' }));
    for (const path of Object.values(READERS)) {
      await waitFor(() => expect(fetched(path), path).toBe(2));
    }
  });
});

describe('운영 콘솔 검인', () => {
  it.each(['GAME_PARTICIPANT_SUPERSEDED', 'GAME_PARTICIPANT_NOT_FOUND'])(
    '%s 면 명단이 다시 계산된 것이다 — 콘솔 라인업을 다시 받는다',
    async (code) => {
      arrivalFailure = { status: code === 'GAME_PARTICIPANT_NOT_FOUND' ? 404 : 409, code };
      const { result } = renderHook(
        () => ({
          fixtureLineup: useV1FixtureLineup(T_ID, 'fixture-1'),
          ops: useV1GameOperationsLineup(G1.gameId),
          arrival: useV1SetParticipantArrival(G1.gameId, { tournamentId: T_ID, fixtureId: 'fixture-1' }),
        }),
        { wrapper: wrapper() },
      );
      await waitFor(() => expect(result.current.fixtureLineup.isSuccess && result.current.ops.isSuccess).toBe(true));

      await act(() => result.current.arrival.mutateAsync({ participantId: 'p-old', arrived: true }).catch(() => undefined));

      await waitFor(() => expect(fetched(READERS.fixtureLineup)).toBe(2));
      await waitFor(() => expect(fetched(READERS.opsLineup1)).toBe(2));
    },
  );

  it('다른 실패(권한 등)는 명단을 다시 받지 않는다', async () => {
    arrivalFailure = { status: 403, code: 'PERMISSION_DENIED' };
    const { result } = renderHook(
      () => ({
        fixtureLineup: useV1FixtureLineup(T_ID, 'fixture-1'),
        arrival: useV1SetParticipantArrival(G1.gameId, { tournamentId: T_ID, fixtureId: 'fixture-1' }),
      }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.fixtureLineup.isSuccess).toBe(true));
    await act(() => result.current.arrival.mutateAsync({ participantId: 'p-1', arrived: true }).catch(() => undefined));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetched(READERS.fixtureLineup)).toBe(1);
  });
});

describe('운영 콘솔 전원 도착(일괄 검인)', () => {
  function renderConfirmAll() {
    return renderHook(
      () => ({
        fixtureLineup: useV1FixtureLineup(T_ID, 'fixture-1'),
        ops: useV1GameOperationsLineup(G1.gameId),
        confirmAll: useV1ConfirmSideArrival(G1.gameId, { tournamentId: T_ID, fixtureId: 'fixture-1' }),
      }),
      { wrapper: wrapper() },
    );
  }

  it('사이드 하나를 지목한 요청 한 번만 보내고, 콘솔이 읽는 두 라인업을 다시 받는다', async () => {
    const { result } = renderConfirmAll();
    await waitFor(() => expect(result.current.fixtureLineup.isSuccess && result.current.ops.isSuccess).toBe(true));

    await act(() => result.current.confirmAll.mutateAsync(G1.sideId));

    expect(confirmAllRequests).toEqual([`/api/v1/games/${G1.gameId}/sides/${G1.sideId}/arrival/confirm-all`]);
    await waitFor(() => expect(fetched(READERS.fixtureLineup)).toBe(2));
    await waitFor(() => expect(fetched(READERS.opsLineup1)).toBe(2));
  });

  it('실패해도 화면이 옛 명단에 머물지 않게 다시 받는다', async () => {
    confirmAllFailure = { status: 403, code: 'PERMISSION_DENIED' };
    const { result } = renderConfirmAll();
    await waitFor(() => expect(result.current.fixtureLineup.isSuccess && result.current.ops.isSuccess).toBe(true));

    await act(() => result.current.confirmAll.mutateAsync(G1.sideId).catch(() => undefined));

    await waitFor(() => expect(fetched(READERS.fixtureLineup)).toBe(2));
    await waitFor(() => expect(fetched(READERS.opsLineup1)).toBe(2));
  });
});

describe('운영 보드 명단 요약', () => {
  afterEach(() => vi.useRealTimers());

  it('보드 본체와 같은 주기로 다시 받는다', async () => {
    // 주기 타이머만 가짜로 — waitFor 도 setInterval 로 재시도하므로 여기선 setTimeout 으로 기다린다.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const until = async (check: () => boolean) => {
      for (let i = 0; i < 100 && !check(); i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
      expect(check()).toBe(true);
    };
    const { tournamentId, registrationId } = GAME_ROSTER_MSW;
    const path = `/api/v1/admin/tournaments/${tournamentId}/registrations/${registrationId}/game-rosters`;
    const { result } = renderHook(() => useV1AdminRegistrationGameRosterList(tournamentId, [registrationId]), {
      wrapper: wrapper(),
    });
    await until(() => result.current[0]?.isSuccess === true);
    vi.advanceTimersByTime(OPERATIONS_BOARD_POLL_INTERVAL_MS - 1);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(gets(path)).toBe(1);

    vi.advanceTimersByTime(1);
    await until(() => gets(path) === 2);
  });
});

describe('팀 C 결장 기간', () => {
  it('등록하면 기간 안 경기 명단만 결장으로 바뀌고 결장 목록을 다시 받는다', async () => {
    const { result } = renderHook(
      () => ({
        r1: useV1TeamGameRoster(teamId, G1.gameId),
        r2: useV1TeamGameRoster(teamId, G2.gameId),
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

describe('팀 결장 조회 — 친선 참석명단의 결장 표시', () => {
  const UNAVAILABILITY = `/api/v1/teams/${teamId}/unavailability`;
  const unavailabilityGets = () =>
    mock.requests.filter((r) => r.method === 'GET' && r.path.startsWith(UNAVAILABILITY)).map((r) => r.path);

  it('경기 시각을 activeAt 으로 보내 그 시각에 결장 중인 팀원을 받는다', async () => {
    mock.markUnavailable('player-1', '2026-10-03T15:00:00.000Z', '2026-10-05T15:00:00.000Z', 'INJURY');
    mock.markUnavailable('player-2', '2026-10-10T15:00:00.000Z', '2026-10-12T15:00:00.000Z', null);
    const { result } = renderHook(() => useV1TeamUnavailability(teamId, G1.startAt), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(unavailabilityGets()).toEqual([`${UNAVAILABILITY}?${new URLSearchParams({ activeAt: G1.startAt })}`]);
    expect(result.current.data?.items.map((item) => [item.userId, item.reason])).toEqual([['player-1', 'INJURY']]);
  });

  it('경기 시각을 모르면 조회하지 않는다', async () => {
    const { result } = renderHook(() => useV1TeamUnavailability(teamId, null), { wrapper: wrapper() });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(unavailabilityGets()).toEqual([]);
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.isError).toBe(false);
  });

  it('결장 기간을 등록·취소하면 다시 받는다', async () => {
    const { result } = renderHook(
      () => ({
        active: useV1TeamUnavailability(teamId, G1.startAt),
        create: useV1CreateMemberUnavailability(teamId, 'player-3'),
        revoke: useV1RevokeMemberUnavailability(teamId, 'player-3'),
      }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.active.data?.items).toEqual([]));

    const created = await act(() =>
      result.current.create.mutateAsync({ startsAt: '2026-10-03T15:00:00.000Z', endsAt: '2026-10-05T15:00:00.000Z' }),
    );
    await waitFor(() => expect(result.current.active.data?.items.map((item) => item.userId)).toEqual(['player-3']));

    await act(() => result.current.revoke.mutateAsync(created.unavailability.id));
    await waitFor(() => expect(result.current.active.data?.items).toEqual([]));
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

  it('id 가 비면 요청하지 않고 에러로 떨어지지도 않는다', async () => {
    const { result } = renderHook(() => useV1AdminRegistrationGameRosters('tournament-1', null), { wrapper: wrapper() });
    // 요청이 나갔다면 MSW 기록까지 한 틱이 걸린다 — 넉넉히 흘린 뒤 본다.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mock.requests).toEqual([]);
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.isError).toBe(false);
  });
});
