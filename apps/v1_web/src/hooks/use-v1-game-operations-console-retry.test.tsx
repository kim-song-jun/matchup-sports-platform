import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

/**
 * Regression coverage for the live-QA incident (2026-08): 2 of 6 recorded
 * events failed with the console's generic "다시 시도해주세요" banner, and
 * hitting the queue's "다시 시도" button re-emitted `game.event.append` with
 * the SAME stale `expectedVersion` the first attempt already failed with —
 * structurally guaranteed to fail again the exact same way. The backend
 * already had a dedicated rebase path (`game.event.retry` →
 * `GamesService.retryEvent`, which re-validates against the CURRENT game
 * version) that the frontend never called.
 *
 * This drives the real hook end to end: submit → server rejects with
 * VERSION_CONFLICT → another operator's broadcast advances the known
 * version → `retryFailedEvent` → assert the retry goes out over
 * `game.event.retry` carrying the FRESH version, not the original one.
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
    } else if (event === 'game.event.append' && cb) {
      // First attempt: the operator's own append is stale by the time it
      // reaches the server (another operator already advanced the version).
      cb({ status: 'error', code: 'VERSION_CONFLICT' });
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

afterEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  window.localStorage.clear();
});

describe('useV1GameOperationsConsole — 실패한 큐 항목의 재시도는 game.event.retry로 리베이스한다', () => {
  it('원래 expectedVersion이 아니라 최신 버전으로 재전송한다', async () => {
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

    await waitFor(() => expect(result.current.queue.items[0]?.status).toBe('failed'));
    expect(result.current.queue.items[0]?.lastError?.code).toBe('VERSION_CONFLICT');
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'game.event.append',
      expect.objectContaining({ expectedVersion: 5 }),
      expect.anything(),
    );

    // 다른 운영자의 커밋 브로드캐스트로 이 기기가 아는 버전이 6으로 올라간다.
    act(() => {
      handlers.get('game.event.committed')?.({
        gameId: 'game-1',
        sequence: 1,
        version: 6,
        event: { id: 'other-event', type: 'FOUL' },
      });
    });
    await waitFor(() => expect(result.current.gameSnapshot?.version).toBe(6));

    const clientEventId = result.current.queue.items[0]!.clientEventId;
    act(() => {
      result.current.retryFailedEvent(clientEventId);
    });

    await waitFor(() => expect(result.current.queue.items[0]?.status).toBe('acked'));

    // 재시도는 game.event.append이 아니라 game.event.retry로 나가고, 원래의
    // 낡은 버전(5)이 아니라 그 사이 갱신된 최신 버전(6)을 실어 보낸다.
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'game.event.retry',
      expect.objectContaining({ rebasedExpectedVersion: 6, clientEventId }),
      expect.anything(),
    );

    unmount();
  });
});
