import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

/**
 * UX 감사 CRITICAL (2026-08): 이벤트 전송이 'sending' 상태에서 고착되면
 * 새로고침 전까지 영원히 그 상태로 남고 재시도 버튼도 없었다 — 경기 중 골
 * 기록이 "전송 중"으로 박제되면 운영자는 기록됐는지조차 알 수 없었다.
 *
 * 원인: `sendQueuedItem`이 소켓 ack 콜백에만 의존했다 — 소켓이 응답 없이
 * 끊기면(디스커넥트) socket.io는 그 emit의 콜백을 다시 부르지 않는다. 이
 * 테스트는 ack가 영원히 오지 않는 소켓을 흉내 내, SEND_ACK_TIMEOUT_MS 이후
 * 항목이 'failed'로 전환되고(재시도 노출), 실제 재시도가 game.event.retry로
 * 나가 성공하는 전체 복구 경로를 검증한다.
 */

type SocketHandler = (payload: unknown) => void;
const handlers = new Map<string, SocketHandler>();

const mockSocket = {
  connected: true,
  on: vi.fn((event: string, handler: SocketHandler) => {
    handlers.set(event, handler);
  }),
  off: vi.fn(),
  emit: vi.fn((event: string, payload: unknown, cb?: (result: unknown) => void) => {
    if (event === 'game.subscribe' && cb) {
      cb({ status: 'subscribed', snapshot: { version: 5, state: 'LIVE', lastSequence: 0, events: [] } });
    } else if (event === 'game.takeover.request' && cb) {
      cb({ status: 'granted', takeoverToken: 'tok-1', expiresAt: new Date(Date.now() + 60_000).toISOString() });
    } else if (event === 'game.event.append') {
      // 의도적으로 cb를 절대 호출하지 않는다 — 소켓이 응답 없이 끊긴 상황을
      // 흉내 낸다(디스커넥트 시 socket.io는 그 emit의 ack 콜백을 다시 부르지
      // 않는다).
    } else if (event === 'game.event.retry' && cb) {
      const input = payload as { clientEventId: string; rebasedExpectedVersion: number };
      cb({ status: 'ack', clientEventId: input.clientEventId, sequence: 1, version: input.rebasedExpectedVersion + 1 });
    }
  }),
};

const mockV1Post = vi.fn(async (..._args: unknown[]) => ({ gameId: 'game-1', state: 'LIVE', version: 6 }));

vi.mock('@/lib/v1-game-operations-socket', () => ({
  getV1GameOperationsSocket: () => mockSocket,
  setGameOperationsAuthorizationSubjectVersion: vi.fn(),
}));
vi.mock('@/lib/api-client', () => ({
  v1Get: vi.fn(async () => ({ items: [] })),
  v1Post: (...args: unknown[]) => mockV1Post(...args),
}));

function createWrapper(queryClient: QueryClient) {
  return function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  window.localStorage.clear();
  vi.useRealTimers();
});

describe('useV1GameOperationsConsole — ack가 영원히 오지 않아도 sending에 고착되지 않는다', () => {
  it('타임아웃 후 failed로 전환되어 재시도할 수 있고, 재시도는 game.event.retry로 복구된다', async () => {
    const { useV1GameOperationsConsole, SEND_ACK_TIMEOUT_MS } = await import('./use-v1-game-operations-console');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, unmount } = renderHook(
      () =>
        useV1GameOperationsConsole({
          tournamentId: null,
          gameId: 'game-1',
          myUserId: 'user-1',
          initialLastSequence: 0,
        }),
      { wrapper: createWrapper(queryClient) },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.gameSnapshot?.version).toBe(5);
    expect(result.current.takeover.status).toBe('held');

    await act(async () => {
      await result.current.submitEvent({
        type: 'GOAL',
        sideId: 'side-1',
        participantId: 'p-1',
        period: 1,
        clockMs: 60_000,
        occurredAt: new Date().toISOString(),
        payload: {},
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.queue.items[0]?.status).toBe('sending');
    expect(mockSocket.emit).toHaveBeenCalledWith('game.event.append', expect.anything(), expect.anything());

    // 타임아웃 문턱 직전 — 서버가 여전히 응답이 없어도 아직은 'sending' 그대로다.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SEND_ACK_TIMEOUT_MS - 1);
    });
    expect(result.current.queue.items[0]?.status).toBe('sending');

    // 타임아웃을 넘기면 더 이상 고착되지 않고 failed로 전환된다.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(result.current.queue.items[0]?.status).toBe('failed');
    expect(result.current.queue.items[0]?.lastError?.code).toBe('SEND_TIMEOUT');

    const clientEventId = result.current.queue.items[0]!.clientEventId;
    // Copilot 리뷰: retryFailedEvent는 async(clockMs 보정을 위해 await가 낄
    // 수 있다) — act() 밖에서 그 Promise가 settle되면 state update가
    // act 경고/플레이키의 원인이 된다. 반환된 Promise를 반드시 await한다.
    await act(async () => {
      await result.current.retryFailedEvent(clientEventId);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.queue.items[0]?.status).toBe('acked');
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'game.event.retry',
      expect.objectContaining({ rebasedExpectedVersion: 5, clientEventId }),
      expect.anything(),
    );

    unmount();
  });
});
