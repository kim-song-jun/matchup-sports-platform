import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

/**
 * Root-cause regression coverage (2026-08 alpha 실사고): 골을 기록하면
 * "기록된 이벤트"는 즉시 갱신되는데 상단 스코어보드만 이전 값에 멈춰
 * 있었다. `operate-console.tsx`의 `scoreBySideId`는 이 훅이 돌려주는
 * `liveEvents`에서만 파생되므로(별도 소스가 없다), 이 파일은 그
 * `liveEvents` 계약을 이 훅 수준에서 직접 검증한다:
 *
 * 1) GOAL append 성공 → 서버가 자기 자신에게 쏘는 `game.event.committed`
 *    브로드캐스트(수정된 백엔드 계약대로 실제 저장 행: 진짜 id +
 *    reversesEventId: null)를 받으면 `liveEvents`에 정확히 반영된다.
 * 2) 골 취소(reverseEvent, REST 전용·오프라인 큐 미사용)는 실시간
 *    브로드캐스트 대응이 없으므로, 성공 직후 전체 재동기화를 강제해
 *    `liveEvents`가 새로고침 없이도 되돌림을 반영한다.
 *
 * 둘 다 구현을 그대로 되읊는 게 아니라 "무엇이 관찰 가능해야 하는가"
 * (liveEvents의 최종 내용)를 검증한다 — 이 계약이 깨지면 실제로
 * 스코어보드가 멈추거나, 취소해도 점수가 안 돌아온다.
 */

type SocketHandler = (payload: unknown) => void;
const handlers = new Map<string, SocketHandler>();

const GOAL_EVENT = {
  id: 'event-1',
  gameId: 'game-1',
  sequence: 1,
  clientEventId: 'client-1',
  payloadHash: 'hash-1',
  type: 'GOAL',
  sideId: 'side-1',
  participantId: 'p-1',
  assistParticipantId: null,
  period: 1,
  clockMs: 60_000,
  occurredAt: '2026-08-11T00:00:00.000Z',
  receivedAt: '2026-08-11T00:00:00.100Z',
  actorUserId: 'user-1',
  reversesEventId: null,
  payload: {},
};

const CORRECTION_EVENT = {
  id: 'event-2',
  gameId: 'game-1',
  sequence: 2,
  clientEventId: 'client-2',
  payloadHash: 'hash-2',
  type: 'CORRECTION',
  sideId: 'side-1',
  participantId: 'p-1',
  assistParticipantId: null,
  period: 1,
  clockMs: 65_000,
  occurredAt: '2026-08-11T00:05:00.000Z',
  receivedAt: '2026-08-11T00:05:00.100Z',
  actorUserId: 'user-1',
  reversesEventId: 'event-1',
  payload: { reason: '오심 정정' },
};

let subscribeCallCount = 0;
let subscribeSnapshots: Array<{ version: number; state: string; lastSequence: number; events: unknown[] }> = [];

const mockSocket = {
  connected: true,
  on: vi.fn((event: string, handler: SocketHandler) => {
    handlers.set(event, handler);
  }),
  off: vi.fn(),
  emit: vi.fn((event: string, payload: unknown, cb?: (result: unknown) => void) => {
    if (event === 'game.subscribe' && cb) {
      const snapshot = subscribeSnapshots[subscribeCallCount] ?? subscribeSnapshots[subscribeSnapshots.length - 1];
      subscribeCallCount += 1;
      cb({ status: 'subscribed', snapshot });
    } else if (event === 'game.takeover.request' && cb) {
      cb({ status: 'granted', takeoverToken: 'tok-1', expiresAt: new Date(Date.now() + 60_000).toISOString() });
    } else if (event === 'game.event.append' && cb) {
      // 실제 백엔드 순서(acknowledgeGameEvent): self-broadcast 먼저, ack는
      // 그 뒤에(같은 소켓 write 큐 안에서 emit들이 먼저 나가고, ack는 핸들러의
      // 반환 Promise가 resolve된 뒤 프레임워크가 보낸다) — 실측 확인됨
      // (probe-order.mjs, 이 세션에서 socket.io/socket.io-client로 직접 검증).
      handlers.get('game.event.committed')?.({
        gameId: 'game-1',
        sequence: GOAL_EVENT.sequence,
        version: 2,
        event: GOAL_EVENT,
      });
      cb({ status: 'ack', sequence: GOAL_EVENT.sequence, version: 2 });
    }
  }),
};

const mockV1Post = vi.fn(async (..._args: unknown[]) => ({ gameId: 'game-1', state: 'LIVE', version: 3 }));

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
  subscribeCallCount = 0;
  subscribeSnapshots = [];
});

describe('useV1GameOperationsConsole — GOAL append committed broadcast reaches liveEvents', () => {
  it('자기 자신이 기록한 골이 실제 저장 행(진짜 id, reversesEventId: null)으로 liveEvents에 반영된다', async () => {
    subscribeSnapshots = [{ version: 1, state: 'LIVE', lastSequence: 0, events: [] }];
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

    await waitFor(() => expect(result.current.takeover.status).toBe('held'));

    await act(async () => {
      await result.current.submitEvent({
        type: 'GOAL',
        sideId: 'side-1',
        participantId: 'p-1',
        period: 1,
        clockMs: 60_000,
        // 고정된 과거 날짜가 아니라 "지금"이어야 한다 — 오프라인 큐 첫 전송의
        // CLOCK_DRIFT 오탐 수정(sendQueuedItem의 isClockDrifted 게이트) 이후,
        // 30초 넘게 지난 occurredAt은 첫 시도부터 game.event.retry로 나가고
        // 이 mock 소켓은 'game.event.retry'를 처리하지 않는다(append만 흉내).
        occurredAt: new Date().toISOString(),
        payload: {},
      });
    });

    await waitFor(() => expect(result.current.queue.items[0]?.status).toBe('acked'));

    // 이 계약이 깨지면(예: 자기-브로드캐스트가 다시 원본 요청 payload로
    // 되돌아가면) id/reversesEventId가 없어져 operate-console.tsx의
    // scoreBySideId가 이 골을 "이미 되돌려짐"으로 오판한다.
    expect(result.current.liveEvents).toHaveLength(1);
    expect(result.current.liveEvents[0]).toMatchObject({
      id: 'event-1',
      type: 'GOAL',
      sideId: 'side-1',
      reversesEventId: null,
    });

    unmount();
  });
});

describe('useV1GameOperationsConsole — reverseEvent forces a resync so liveEvents reflects the reversal without a reload', () => {
  it('REST 되돌리기가 성공하면 liveEvents가 원래 골 + 정정(CORRECTION) 이벤트로 즉시 갱신된다', async () => {
    subscribeSnapshots = [
      // 최초 구독: 이미 골 1개가 기록된 상태로 콘솔을 연다.
      { version: 2, state: 'LIVE', lastSequence: 1, events: [GOAL_EVENT] },
      // reverseEvent 성공 후 강제 재동기화(afterSequence: 0)가 돌려주는
      // 전체 이력 — 원래 골 + 방금 만들어진 CORRECTION.
      { version: 3, state: 'LIVE', lastSequence: 2, events: [GOAL_EVENT, CORRECTION_EVENT] },
    ];
    const { useV1GameOperationsConsole } = await import('./use-v1-game-operations-console');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, unmount } = renderHook(
      () =>
        useV1GameOperationsConsole({
          tournamentId: null,
          gameId: 'game-1',
          myUserId: 'user-1',
          initialLastSequence: 1,
        }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.takeover.status).toBe('held'));
    await waitFor(() => expect(result.current.liveEvents).toHaveLength(1));

    await act(async () => {
      await result.current.reverseEvent({ eventId: 'event-1', reason: '오심 정정' });
    });

    // REST 요청 자체는 그대로.
    expect(mockV1Post).toHaveBeenCalledWith(
      '/games/game-1/events/event-1/reverse',
      expect.objectContaining({ expectedVersion: 2, reason: '오심 정정' }),
      expect.anything(),
    );
    // 재동기화가 실제로 두 번째 game.subscribe 호출을 만든다 — 없으면 이
    // 테스트는 첫 스냅숏(골 1개)에 멈춰 아래 length 검증에서 실패한다.
    await waitFor(() =>
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'game.subscribe',
        expect.objectContaining({ gameId: 'game-1', afterSequence: 0 }),
        expect.anything(),
      ),
    );

    // 새로고침 없이, 같은 세션 안에서 되돌림이 liveEvents에 반영된다 —
    // operate-console.tsx의 scoreBySideId는 reversesEventId: 'event-1'을
    // 보고 GOAL_EVENT를 점수에서 뺀다.
    await waitFor(() => expect(result.current.liveEvents).toHaveLength(2));
    expect(result.current.liveEvents.map((event) => event.id)).toEqual(['event-1', 'event-2']);
    expect(result.current.liveEvents[1]).toMatchObject({ type: 'CORRECTION', reversesEventId: 'event-1' });

    unmount();
  });
});
