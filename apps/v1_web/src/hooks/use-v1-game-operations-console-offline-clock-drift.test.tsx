import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

/**
 * 백로그 결함 수정 — "캡처 시각이 30초 이상 지난 이벤트의 첫 전송이 항상
 * `game.event.append`로 나가 서버 드리프트 가드에 422 CLOCK_DRIFT로 거부된다".
 *
 * 시나리오: 경기장 Wi-Fi가 끊긴 동안 골을 기록(occurredAt이 서버-정렬 시각
 * 기준으로 그 시점에 얼어붙는다) → 큐에 `attempts: 0`으로 쌓임 → 재연결 후
 * 첫 플러시. 고치기 전에는 `isRetry = item.attempts > 0`만 봐서 이 첫
 * 플러시가 무조건 `game.event.append`로 나갔고, 서버의
 * `assertClockNotDrifted()`(30초 허용)에 걸려 422 CLOCK_DRIFT로 거부됐다 —
 * 기기 시각은 멀쩡한데 "기기 시각이 서버와 많이 달라요"라는 완전히 틀린
 * 진단을 냈다. `game.event.retry`(`GamesService.retryEvent`)에는 애초에
 * 이 가드가 없다(오프라인 복구는 정당하게 과거 시각으로 도착한다는 게
 * 서버 쪽 전제) — 그래서 클라이언트가 "이건 사실상 재시도(=오프라인
 * 복구)다"를 스스로 알아채고 처음부터 그 경로로 보내야 한다.
 *
 * 이 테스트는 `sendQueuedItem`의 `isRetry` 판정이 `attempts > 0` 뿐 아니라
 * `isClockDrifted(occurredAt, serverAlignedNow)`도 보는지를, 실제 훅을 끝까지
 * 구동해 검증한다: 30초를 크게 넘겨 얼어붙은 occurredAt으로 submitEvent →
 * 첫 시도가 `game.event.append`가 아니라 `game.event.retry`로 나가고,
 * 서버의 (여기선 mock의) 무조건 ack로 한 번에 성공(acked)하는지 확인한다.
 * 대조군으로, 방금 캡처된(신선한) occurredAt은 여전히 첫 시도가
 * `game.event.append`로 나가는 기존 계약도 함께 지킨다.
 */

type SocketHandler = (payload: unknown) => void;

function createMockSocket() {
  const handlers = new Map<string, SocketHandler>();
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const socket = {
    connected: true,
    on: vi.fn((event: string, handler: SocketHandler) => {
      handlers.set(event, handler);
    }),
    off: vi.fn(),
    emit: vi.fn((event: string, payload: unknown, cb?: (result: unknown) => void) => {
      emitted.push({ event, payload });
      if (event === 'game.subscribe' && cb) {
        cb({ status: 'subscribed', snapshot: { version: 5, state: 'LIVE', lastSequence: 0, events: [] } });
      } else if (event === 'game.takeover.request' && cb) {
        cb({ status: 'granted', takeoverToken: 'tok-1', expiresAt: new Date(Date.now() + 60_000).toISOString() });
      } else if ((event === 'game.event.append' || event === 'game.event.retry') && cb) {
        const input = payload as { clientEventId: string; expectedVersion?: number; rebasedExpectedVersion?: number };
        const version = (input.rebasedExpectedVersion ?? input.expectedVersion ?? 5) + 1;
        cb({ status: 'ack', clientEventId: input.clientEventId, sequence: 1, version });
      }
    }),
  };
  return { socket, emitted };
}

const mockV1Post = vi.fn(async (..._args: unknown[]) => ({ gameId: 'game-1', state: 'LIVE', version: 6 }));

vi.mock('@/lib/api-client', () => ({
  v1Get: vi.fn(async () => ({ items: [] })),
  v1Post: (...args: unknown[]) => mockV1Post(...args),
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

describe('useV1GameOperationsConsole — 오프라인 큐 첫 전송의 CLOCK_DRIFT 오탐', () => {
  it('30초 넘게 지연된 occurredAt은 첫 시도부터 game.event.retry로 나간다(append 왕복·422 없음)', async () => {
    const { socket, emitted } = createMockSocket();
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
          gameId: 'game-1',
          myUserId: 'user-1',
          initialLastSequence: 0,
        }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.gameSnapshot?.version).toBe(5));
    await waitFor(() => expect(result.current.takeover.status).toBe('held'));

    // 오프라인 상태에서 45초 전에 캡처됐다고 가정 — CLOCK_DRIFT_TOLERANCE_MS(30s)를 넘는다.
    const staleOccurredAt = new Date(Date.now() - 45_000).toISOString();

    await act(async () => {
      await result.current.submitEvent({
        type: 'GOAL',
        sideId: 'side-1',
        participantId: 'p-1',
        period: 1,
        clockMs: 60_000,
        occurredAt: staleOccurredAt,
        payload: {},
      });
    });

    await waitFor(() => expect(result.current.queue.items[0]?.status).toBe('acked'));

    // 첫 시도가 곧바로 retry로 나갔다 — append로 갔다가 거부되고 나서
    // 사용자가 수동으로 "다시 시도"를 눌러야 성공하는 게 아니다.
    const gameEventEmits = emitted.filter((e) => e.event.startsWith('game.event.'));
    expect(gameEventEmits).toHaveLength(1);
    expect(gameEventEmits[0]!.event).toBe('game.event.retry');
    expect(result.current.queue.items[0]?.attempts).toBe(0);

    unmount();
  });

  it('대조군 — 방금 캡처된(신선한) occurredAt은 여전히 첫 시도가 game.event.append로 나간다', async () => {
    const { socket, emitted } = createMockSocket();
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
          gameId: 'game-1',
          myUserId: 'user-1',
          initialLastSequence: 0,
        }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.gameSnapshot?.version).toBe(5));
    await waitFor(() => expect(result.current.takeover.status).toBe('held'));

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

    await waitFor(() => expect(result.current.queue.items[0]?.status).toBe('acked'));

    const gameEventEmits = emitted.filter((e) => e.event.startsWith('game.event.'));
    expect(gameEventEmits).toHaveLength(1);
    expect(gameEventEmits[0]!.event).toBe('game.event.append');

    unmount();
  });
});
