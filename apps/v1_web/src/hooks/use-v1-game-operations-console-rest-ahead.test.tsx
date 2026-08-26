import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { GameEventRecord, GameState } from '@/types/game-operations';

/**
 * "REST가 앞서면 그 이벤트는 영구 유실된다" 회귀 테스트.
 *
 * 콘솔은 `dispatchSync({ type: 'SNAPSHOT', lastSequence: initialLastSequence })`를
 * **조건 없이** 디스패치한다 — `initialLastSequence`는 페이지가 REST(`useV1Game`)로
 * 읽어온 값이고, `providers.tsx`가 `refetchOnWindowFocus: true`라 창 포커스가
 * 돌아올 때마다 갱신된다.
 *
 * 그래서 REST가 소켓보다 앞선 시퀀스를 먼저 알려주면 `lastSequenceRef`가 그 값으로
 * 점프하고, 정작 **뒤늦게 도착한 그 이벤트의 브로드캐스트**는
 * `committed.sequence <= lastSequenceRef.current` 분기에 걸려 "이미 아는 중복"으로
 * 조용히 버려진다. 클라이언트는 그 이벤트 본문을 단 한 번도 받은 적이 없는데도.
 * 결과적으로 그 이벤트는 재구독 전까지 화면(`liveEvents`)에 영영 나타나지 않는다 —
 * 스코어·파울·교체 파생값도 같이 어긋난다.
 *
 * 숫자(`lastSequence`)를 아는 것과 이벤트 본문을 받은 것은 다르다는, 이 훅이
 * `initialLastSequence` 주석에서 이미 명시하고 있는 원칙 그대로다.
 */

const GAME_ID = 'game-1';

/** 소켓 구독 시점에는 서버에 아직 이벤트가 없다 — 첫 골이 그 직후에 커밋된다. */
const SNAPSHOT_LAST_SEQUENCE = 0;

function goalEvent(sequence: number): GameEventRecord {
  return {
    id: `event-${sequence}`,
    gameId: GAME_ID,
    sequence,
    clientEventId: `client-${sequence}`,
    payloadHash: `hash-${sequence}`,
    type: 'GOAL',
    sideId: 'side-home',
    participantId: 'p-1',
    assistParticipantId: null,
    period: 1,
    clockMs: 60_000 * sequence,
    occurredAt: '2026-08-16T00:01:00.000Z',
    receivedAt: '2026-08-16T00:01:00.000Z',
    actorUserId: 'actor-2',
    reversesEventId: null,
    payload: {},
  };
}

type SubscribeInput = { gameId: string; afterSequence: number };

function createMockSocket() {
  const handlers = new Map<string, Set<(...args: never[]) => void>>();
  const subscribeCalls: SubscribeInput[] = [];

  const socket = {
    connected: true,
    on(event: string, handler: (...args: never[]) => void) {
      const set = handlers.get(event) ?? new Set();
      set.add(handler);
      handlers.set(event, set);
    },
    off(event: string, handler: (...args: never[]) => void) {
      handlers.get(event)?.delete(handler);
    },
    emit(event: string, payload: unknown, cb?: (result: unknown) => void) {
      if (event === 'game.subscribe' && cb) {
        subscribeCalls.push(payload as SubscribeInput);
        cb({
          status: 'subscribed',
          snapshot: {
            version: 3,
            state: 'LIVE' as GameState,
            lastSequence: SNAPSHOT_LAST_SEQUENCE,
            events: [],
          },
        });
      }
    },
  };

  function fire(event: string, ...args: unknown[]) {
    for (const handler of [...(handlers.get(event) ?? [])]) {
      (handler as (...a: unknown[]) => void)(...args);
    }
  }

  return { socket, subscribeCalls, fire };
}

vi.mock('@/lib/api-client', () => ({
  v1Get: vi.fn(async () => ({ items: [] })),
  v1Post: vi.fn(async () => ({})),
}));

function createWrapper(queryClient: QueryClient) {
  return function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  window.localStorage.clear();
});

describe('useV1GameOperationsConsole — REST가 앞서도 뒤늦은 브로드캐스트를 버리지 않는다', () => {
  it('REST lastSequence가 먼저 1로 올라간 뒤 도착한 sequence:1 브로드캐스트가 liveEvents에 들어온다', async () => {
    const { socket, subscribeCalls, fire } = createMockSocket();
    vi.doMock('@/lib/v1-game-operations-socket', () => ({
      getV1GameOperationsSocket: () => socket,
      setGameOperationsAuthorizationSubjectVersion: vi.fn(),
    }));

    const { useV1GameOperationsConsole } = await import('./use-v1-game-operations-console');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result, rerender, unmount } = renderHook(
      ({ initialLastSequence }: { initialLastSequence: number }) =>
        useV1GameOperationsConsole({
          tournamentId: null,
          gameId: GAME_ID,
          myUserId: 'user-1',
          initialLastSequence,
        }),
      {
        wrapper: createWrapper(queryClient),
        initialProps: { initialLastSequence: SNAPSHOT_LAST_SEQUENCE },
      },
    );

    await waitFor(() => expect(subscribeCalls).toHaveLength(1));
    expect(result.current.liveEvents).toHaveLength(0);

    // 창 포커스 복귀 → React Query가 `GET /games/:id`를 재요청 → 페이지가 새
    // lastSequence(1)를 훅에 내려준다. 이 시점의 클라이언트는 그 이벤트 본문을
    // 아직 받은 적이 없다 — 숫자만 앞서 있다.
    rerender({ initialLastSequence: 1 });
    await waitFor(() => expect(result.current.sync.lastSequence).toBe(1));

    // 그리고 나서 그 이벤트의 브로드캐스트가 도착한다(다른 운영자가 기록한 골).
    act(() =>
      fire('game.event.committed', {
        gameId: GAME_ID,
        sequence: 1,
        version: 4,
        event: goalEvent(1),
      }),
    );

    // 화면에 반드시 보여야 한다 — 지금은 "이미 아는 중복"으로 버려진다.
    expect(result.current.liveEvents.map((event) => event.id)).toEqual(['event-1']);

    unmount();
  });

  /**
   * 위 테스트의 대조군 — REST가 앞서지 않을 때 **똑같은 mock·똑같은 fire 경로**로
   * 같은 브로드캐스트를 쏘면 이벤트는 정상적으로 들어온다. 위 실패가 "핸들러가
   * 등록되지 않았다"거나 "fire가 동작하지 않는다" 같은 테스트 배선 문제가 아니라
   * 오직 REST가 밀어올린 `lastSequenceRef` 때문임을 고정한다.
   *
   * 동시에 픽스의 가드레일이기도 하다: 결함 1을 고치면서 정상 연속 append 경로를
   * 깨뜨리면 이 테스트가 먼저 깨진다.
   */
  it('대조군 — REST가 앞서지 않으면 같은 브로드캐스트가 정상적으로 liveEvents에 들어온다', async () => {
    const { socket, subscribeCalls, fire } = createMockSocket();
    vi.doMock('@/lib/v1-game-operations-socket', () => ({
      getV1GameOperationsSocket: () => socket,
      setGameOperationsAuthorizationSubjectVersion: vi.fn(),
    }));

    const { useV1GameOperationsConsole } = await import('./use-v1-game-operations-console');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result, unmount } = renderHook(
      () =>
        useV1GameOperationsConsole({
          tournamentId: null,
          gameId: GAME_ID,
          myUserId: 'user-1',
          initialLastSequence: SNAPSHOT_LAST_SEQUENCE,
        }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(subscribeCalls).toHaveLength(1));
    expect(result.current.liveEvents).toHaveLength(0);

    act(() =>
      fire('game.event.committed', {
        gameId: GAME_ID,
        sequence: 1,
        version: 4,
        event: goalEvent(1),
      }),
    );

    expect(result.current.liveEvents.map((event) => event.id)).toEqual(['event-1']);
    expect(result.current.sync.lastSequence).toBe(1);

    unmount();
  });
});
