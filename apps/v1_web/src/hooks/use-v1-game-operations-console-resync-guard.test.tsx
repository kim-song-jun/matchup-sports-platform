import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { GameEventRecord, GameState } from '@/types/game-operations';

/**
 * "재연결도 항상 전체 리싱크" 로 바꾸면서 새로 생긴 **동시성 코드**를 겨냥한
 * 회귀 테스트다. 기존 reconnect/rest-ahead 스위트의 mock 소켓은 `game.subscribe`
 * ack을 **동기로** 돌려주기 때문에, 아래 세 경로가 단 한 줄도 실행되지 않는다:
 *
 *  1. ack이 끝내 오지 않을 때의 재진입 가드 해제
 *     (게이트웨이 `subscribeToGame`은 `ForbiddenException`만 ack로 거부하고
 *      나머지는 rethrow한다 → NestJS WS 예외 경로는 ack 콜백을 부르지 않는다.
 *      소켓은 끊기지 않으므로 `disconnect` 리셋도 발화하지 않는다.)
 *  2. in-flight 중 겹쳐 들어온 트리거의 coalescing
 *  3. 서버가 매 구독마다 같은 갭을 돌려줄 때의 재구독 종료
 *     (모든 구독이 `afterSequence: 0`이 된 지금, 같은 요청은 같은 결과를 받는다 —
 *      조건 없이 재구독하면 끝나지 않는다.)
 *
 * 그리고 늦게 도착한 오래된 스냅숏이 그 사이 append된 이벤트를 덮어쓰지 않는지도
 * 함께 본다(전체 스냅숏이 한 라운드에 push+ack 두 번씩 배달되므로 순서 보장이 없다).
 */

const GAME_ID = 'game-1';

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
    actorUserId: 'actor-1',
    reversesEventId: null,
    payload: {},
  };
}

type SubscribeInput = { gameId: string; afterSequence: number };

/**
 * 게이트웨이 `subscribeToGame`을 그대로 흉내낸다: 구독 처리 중 `game.snapshot`을
 * push하고, `GamesService.listEvents`가 갭을 계산했으면 `game.gap`도 push한 뒤,
 * 같은 스냅숏을 ack으로 돌려준다. `deferAcks`를 켜면 그 응답 전체를 보류해
 * "ack이 오지 않는" 상황(서버 rethrow)을 재현한다.
 */
function createMockSocket(server: { events: readonly GameEventRecord[]; lastSequence: number }) {
  const handlers = new Map<string, Set<(...args: never[]) => void>>();
  const subscribeCalls: SubscribeInput[] = [];
  const pendingResponses: (() => void)[] = [];
  let deferAcks = false;

  function fire(event: string, ...args: unknown[]) {
    for (const handler of [...(handlers.get(event) ?? [])]) {
      (handler as (...a: unknown[]) => void)(...args);
    }
  }

  function firstHole(events: readonly GameEventRecord[]) {
    let expected = 1;
    for (const event of events) {
      if (event.sequence > expected) return { expectedSequence: expected, availableFrom: event.sequence };
      expected = event.sequence + 1;
    }
    return null;
  }

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
      if (event !== 'game.subscribe' || !cb) return;
      subscribeCalls.push(payload as SubscribeInput);
      const snapshot = {
        version: 7,
        state: 'LIVE' as GameState,
        lastSequence: server.lastSequence,
        events: [...server.events],
      };
      const respond = () => {
        fire('game.snapshot', snapshot);
        const hole = firstHole(snapshot.events);
        if (hole !== null) fire('game.gap', hole);
        cb({ status: 'subscribed', snapshot });
      };
      if (deferAcks) {
        pendingResponses.push(respond);
        return;
      }
      respond();
    },
  };

  return {
    socket,
    subscribeCalls,
    fire,
    setDeferAcks(value: boolean) {
      deferAcks = value;
    },
    flushPending() {
      const queued = pendingResponses.splice(0, pendingResponses.length);
      for (const respond of queued) respond();
    },
    /** 가장 오래 보류된 응답 하나만 흘린다 — "늦게 도착한 옛 시도의 ack" 재현용. */
    flushOldest() {
      const respond = pendingResponses.shift();
      respond?.();
    },
    pendingCount() {
      return pendingResponses.length;
    },
  };
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
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.resetModules();
  window.localStorage.clear();
});

async function mountConsole(server: { events: readonly GameEventRecord[]; lastSequence: number }) {
  const mock = createMockSocket(server);
  vi.doMock('@/lib/v1-game-operations-socket', () => ({
    getV1GameOperationsSocket: () => mock.socket,
    setGameOperationsAuthorizationSubjectVersion: vi.fn(),
  }));

  const hookModule = await import('./use-v1-game-operations-console');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rendered = renderHook(
    () =>
      hookModule.useV1GameOperationsConsole({
        tournamentId: null,
        gameId: GAME_ID,
        myUserId: 'user-1',
        initialLastSequence: server.lastSequence,
      }),
    { wrapper: createWrapper(queryClient) },
  );

  await waitFor(() => expect(mock.subscribeCalls.length).toBeGreaterThan(0));

  return { ...mock, ...rendered, subscribeAckTimeoutMs: hookModule.SUBSCRIBE_ACK_TIMEOUT_MS };
}

describe('useV1GameOperationsConsole — 전체 리싱크 재진입 가드', () => {
  it('ack이 끝내 오지 않아도 가드가 래치되지 않아 다음 트리거가 다시 구독한다', async () => {
    const contiguous = { events: [goalEvent(1), goalEvent(2)], lastSequence: 2 };
    const { fire, subscribeCalls, setDeferAcks, result, unmount, subscribeAckTimeoutMs } =
      await mountConsole(contiguous);
    await waitFor(() => expect(result.current.liveEvents).toHaveLength(2));
    expect(subscribeCalls).toHaveLength(1);

    // 서버가 rethrow해 ack이 영영 오지 않는 재구독 — 소켓은 연결된 채다.
    setDeferAcks(true);
    vi.useFakeTimers();
    act(() => fire('connect'));
    expect(subscribeCalls).toHaveLength(2);

    // 가드가 풀리기 전에는 (설계대로) 추가 emit이 나가지 않는다.
    act(() => fire('connect'));
    expect(subscribeCalls).toHaveLength(2);

    act(() => {
      vi.advanceTimersByTime(subscribeAckTimeoutMs);
    });

    // 타임아웃 탈출구가 없으면 이 트리거는 영원히 무음 no-op이 된다.
    act(() => fire('connect'));
    expect(subscribeCalls).toHaveLength(3);

    vi.useRealTimers();
    unmount();
  });

  it('타임아웃으로 재발사한 뒤 도착한 옛 시도의 ack은 최신 시도의 가드를 풀지 못한다', async () => {
    const contiguous = { events: [goalEvent(1), goalEvent(2)], lastSequence: 2 };
    const { fire, subscribeCalls, setDeferAcks, flushOldest, result, unmount, subscribeAckTimeoutMs } =
      await mountConsole(contiguous);
    await waitFor(() => expect(result.current.liveEvents).toHaveLength(2));
    expect(subscribeCalls).toHaveLength(1);

    setDeferAcks(true);
    vi.useFakeTimers();

    // 시도 A — ack이 오지 않아 타임아웃 탈출구가 가드를 푼다.
    act(() => fire('connect'));
    expect(subscribeCalls).toHaveLength(2);
    act(() => {
      vi.advanceTimersByTime(subscribeAckTimeoutMs);
    });

    // 시도 B — 새 가드와 새 타임아웃을 세운 채 in-flight 다.
    act(() => fire('connect'));
    expect(subscribeCalls).toHaveLength(3);

    // 이제 시도 A 의 ack 이 뒤늦게 도착한다. 시도별 식별이 없으면 이 ack 이
    // 시도 B 의 타임아웃을 지우고 `resyncInFlight` 를 풀어 가드를 무력화한다.
    act(() => flushOldest());

    // 시도 B 가 아직 응답을 기다리는 중이므로 추가 구독이 나가면 안 된다.
    act(() => fire('connect'));
    expect(subscribeCalls).toHaveLength(3);

    vi.useRealTimers();
    unmount();
  });

  it('in-flight 중 겹친 트리거는 버려지지 않고 한 번으로 합쳐 뒤이어 재발사된다', async () => {
    const contiguous = { events: [goalEvent(1), goalEvent(2)], lastSequence: 2 };
    const { fire, subscribeCalls, setDeferAcks, flushPending, result, unmount } =
      await mountConsole(contiguous);
    await waitFor(() => expect(result.current.liveEvents).toHaveLength(2));

    setDeferAcks(true);
    act(() => fire('connect'));
    expect(subscribeCalls).toHaveLength(2);

    // in-flight 중 도착한 갭 — 지금 emit하면 스냅숏 두 개가 순서 없이 경쟁한다.
    act(() => fire('game.gap', { expectedSequence: 3, availableFrom: 5 }));
    expect(subscribeCalls).toHaveLength(2);
    expect(result.current.sync.status).toBe('gap');

    // 보류된 응답이 도착하면 합쳐 둔 요청이 한 번 재발사된다(버려지지 않는다).
    setDeferAcks(false);
    act(() => flushPending());
    expect(subscribeCalls).toHaveLength(3);
    await waitFor(() => expect(result.current.sync.status).toBe('synced'));

    unmount();
  });

  it('서버가 매 구독마다 같은 갭을 돌려줘도 재구독이 끝난다(무한 루프 없음)', async () => {
    // 시퀀스 2가 없는 이력 — `afterSequence: 0` 구독은 매번 같은 갭을 계산한다.
    const holed = { events: [goalEvent(1), goalEvent(3)], lastSequence: 3 };
    const { subscribeCalls, result, unmount } = await mountConsole(holed);

    await waitFor(() => expect(result.current.liveEvents).toHaveLength(2));

    // 같은 갭에 대한 재구독은 한 번만 — 그 다음부터는 프리즈를 유지한다.
    expect(subscribeCalls.length).toBeLessThanOrEqual(2);
    expect(subscribeCalls.every((call) => call.afterSequence === 0)).toBe(true);
    // 불완전한 타임라인 위에 새 이벤트를 커밋시키지 않는다.
    expect(result.current.sync.status).toBe('gap');

    unmount();
  });

  it('늦게 도착한 오래된 스냅숏이 그 사이 append된 이벤트를 덮어쓰지 않는다', async () => {
    const contiguous = { events: [goalEvent(1), goalEvent(2)], lastSequence: 2 };
    const { fire, setDeferAcks, flushPending, result, unmount } = await mountConsole(contiguous);
    await waitFor(() => expect(result.current.liveEvents).toHaveLength(2));

    setDeferAcks(true);
    act(() => fire('connect'));

    // 리싱크 응답이 오기 전에 다른 운영자의 골(seq 3)이 브로드캐스트된다.
    act(() =>
      fire('game.event.committed', {
        gameId: GAME_ID,
        sequence: 3,
        version: 8,
        event: goalEvent(3),
      }),
    );
    expect(result.current.liveEvents).toHaveLength(3);
    expect(result.current.gameSnapshot?.version).toBe(8);

    // 스냅숏 읽기 시점(lastSequence 2)이 더 과거인 응답이 뒤늦게 도착한다.
    act(() => flushPending());

    expect(result.current.liveEvents.map((event) => event.sequence)).toEqual([1, 2, 3]);
    expect(result.current.gameSnapshot?.version).toBe(8);
    expect(result.current.sync.status).toBe('synced');

    unmount();
  });
});
