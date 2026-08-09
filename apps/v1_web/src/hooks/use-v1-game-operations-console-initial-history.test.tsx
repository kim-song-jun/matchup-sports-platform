import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { GameEventRecord } from '@/types/game-operations';

/**
 * 레인 A #1 (CRITICAL) 회귀 테스트 — alpha 실사고(2026-08).
 *
 * `operate-console.tsx`는 REST로 미리 읽어온 `gameDetail.data.lastSequence`를
 * `initialLastSequence`로 넘긴다. 이전 구현은 이 값을 그대로 소켓 최초 구독의
 * `afterSequence`로 써서 "이미 그 지점까지 안다"고 서버에 알렸고, 서버는
 * 실제로는 클라이언트가 한 번도 받은 적 없는 이벤트들을 빈 배열로
 * 돌려줬다(콘솔이 "아직 기록된 이벤트가 없어요"를 보여주고 스코어가 0:0으로
 * 고정됨 — DB엔 이벤트 5건이 실재했다). 이 테스트가 다시 깨지면 이 버그가
 * 재발한 것이다.
 */

function goalEvent(sequence: number): GameEventRecord {
  return {
    id: `event-${sequence}`,
    gameId: 'game-1',
    sequence,
    clientEventId: `client-${sequence}`,
    payloadHash: 'hash',
    type: 'GOAL',
    sideId: 'side-home',
    participantId: 'p-1',
    assistParticipantId: null,
    period: 1,
    clockMs: 60_000,
    occurredAt: '2026-08-07T00:01:00.000Z',
    receivedAt: '2026-08-07T00:01:00.000Z',
    actorUserId: 'actor-1',
    reversesEventId: null,
    payload: {},
  };
}

const EXISTING_EVENTS = [goalEvent(1), goalEvent(2)];

function createMockSocket() {
  const subscribeCalls: Array<{ gameId: string; afterSequence: number }> = [];
  const socket = {
    connected: true,
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn((event: string, payload: unknown, cb?: (result: unknown) => void) => {
      if (event === 'game.subscribe' && cb) {
        const input = payload as { gameId: string; afterSequence: number };
        subscribeCalls.push(input);
        cb({
          status: 'subscribed',
          // 서버는 afterSequence:0으로 요청됐을 때만 실제로 존재하는 두 건을
          // 돌려준다 — afterSequence:5(구버전 버그가 보냈던 값)로 요청됐다면
          // "이미 다 안다"고 보고 빈 배열을 돌려주는 서버 동작까지 mock으로
          // 재현한다.
          snapshot:
            input.afterSequence === 0
              ? { version: 5, state: 'LIVE', lastSequence: 2, events: EXISTING_EVENTS }
              : { version: 5, state: 'LIVE', lastSequence: 5, events: [] },
        });
      } else if (event === 'game.takeover.request' && cb) {
        cb({
          status: 'granted',
          takeoverToken: 'tok-1',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        });
      }
    }),
  };
  return { socket, subscribeCalls };
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

describe('useV1GameOperationsConsole — 최초 구독은 전체 이력을 받는다', () => {
  it('initialLastSequence가 0이 아니어도 최초 game.subscribe는 afterSequence:0으로 나가고, 기존 이벤트가 liveEvents에 채워진다', async () => {
    const { socket, subscribeCalls } = createMockSocket();
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
          // REST로 이미 lastSequence=5까지 안다고 알려주는 상황 — 이게 바로
          // 이전 버그를 유발하던 입력이다.
          initialLastSequence: 5,
        }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.liveEvents.length).toBe(2));

    expect(subscribeCalls[0]).toEqual({ gameId: 'game-1', afterSequence: 0 });
    expect(result.current.liveEvents.map((event) => event.id)).toEqual(['event-1', 'event-2']);
    expect(result.current.sync.lastSequence).toBe(2);

    unmount();
  });
});
