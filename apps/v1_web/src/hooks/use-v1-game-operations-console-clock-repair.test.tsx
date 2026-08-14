import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

/**
 * alpha 실사고(2026-08) 근본 원인: `medianOffsetMs()`가 소수(.5) offset을
 * 돌려줄 수 있었고, 그게 `freezeCapture()`의 `clockMs`까지 그대로 전파돼
 * 서버 `parseGameEvent`(`Number.isSafeInteger` 요구, `realtime.gateway.ts`)에
 * `VALIDATION_ERROR`로 거부됐다 — 옐로카드/파울 기록이 원인 불명으로 실패한
 * 정체였다. `game-operations-clock.ts`를 고쳐 새 캡처는 항상 정수를 쓰지만,
 * 이 픽스 이전에 이미 로컬 큐/localStorage에 저장된 항목은 여전히 소수
 * `clockMs`를 가질 수 있다 — 그대로 재시도하면 서버가 매번 같은 이유로
 * 다시 거부해 "다시 시도" 버튼이 무한 루프가 된다.
 *
 * 이 테스트는 그 구제 경로를 실제 훅으로 끝까지 검증한다: 소수 clockMs로
 * submitEvent → 서버가 VALIDATION_ERROR로 거부(실제 게이트웨이를 흉내) →
 * retryFailedEvent → 재전송되는 event.clockMs가 정수로 보정돼 있고
 * payloadHash도 그 보정된 내용에 맞게 다시 계산돼 있는지, 그리고 그 재시도가
 * 성공(acked)하는지까지 확인한다. occurredAt(이벤트가 실제로 벌어진 시각)은
 * 보정 전후로 절대 바뀌지 않아야 한다.
 */

type SocketHandler = (payload: unknown) => void;
const handlers = new Map<string, SocketHandler>();

const OCCURRED_AT = '2026-08-09T00:00:00.000Z';

const retryPayloads: Array<{ clientEventId: string; payloadHash: string; event: Record<string, unknown> }> = [];

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
      // 실제 게이트웨이가 소수 clockMs를 만나면 하는 일 그대로 — 원인 필드
      // 이름까지 실측 사고와 동일하게 흉내 낸다.
      const input = payload as { clientEventId: string; expectedVersion: number };
      cb({
        status: 'error',
        code: 'VALIDATION_ERROR',
        clientEventId: input.clientEventId,
        expectedVersion: input.expectedVersion,
        validation: { missingKeys: [], unknownKeys: [], invalidFields: ['event.clockMs'] },
      });
    } else if (event === 'game.event.retry' && cb) {
      const input = payload as {
        clientEventId: string;
        rebasedExpectedVersion: number;
        payloadHash: string;
        event: Record<string, unknown>;
      };
      retryPayloads.push({ clientEventId: input.clientEventId, payloadHash: input.payloadHash, event: input.event });
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
  retryPayloads.length = 0;
  window.localStorage.clear();
});

describe('useV1GameOperationsConsole — 소수 clockMs로 이미 실패한 항목의 재시도 구제(alpha 실사고)', () => {
  it('재시도 시 clockMs를 정수로 보정하고 payloadHash를 다시 계산해 성공한다', async () => {
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

    // 이 픽스 이전 상태를 흉내 낸다 — medianOffsetMs가 반올림하기 전이라면
    // freezeCapture()가 이런 소수 clockMs를 만들 수 있었다.
    const FRACTIONAL_CLOCK_MS = 26_999_429.5;
    await act(async () => {
      await result.current.submitEvent({
        type: 'CARD',
        sideId: 'side-1',
        participantId: 'p-1',
        period: 2,
        clockMs: FRACTIONAL_CLOCK_MS,
        occurredAt: OCCURRED_AT,
        payload: { card: 'YELLOW' },
      });
    });

    await waitFor(() => expect(result.current.queue.items[0]?.status).toBe('failed'));
    expect(result.current.queue.items[0]?.lastError?.code).toBe('VALIDATION_ERROR');
    // 보정 전이므로 첫 시도는 소수 clockMs를 그대로 실어 보냈다.
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'game.event.append',
      expect.objectContaining({ event: expect.objectContaining({ clockMs: FRACTIONAL_CLOCK_MS }) }),
      expect.anything(),
    );

    const originalPayloadHash = result.current.queue.items[0]!.payloadHash;
    const clientEventId = result.current.queue.items[0]!.clientEventId;

    await act(async () => {
      await result.current.retryFailedEvent(clientEventId);
    });

    await waitFor(() => expect(result.current.queue.items[0]?.status).toBe('acked'));

    // 재시도는 game.event.retry로 나갔고, clockMs는 정수로 보정돼 있다.
    expect(retryPayloads).toHaveLength(1);
    expect(Number.isSafeInteger(retryPayloads[0]!.event.clockMs as number)).toBe(true);
    expect(retryPayloads[0]!.event.clockMs).toBe(Math.round(FRACTIONAL_CLOCK_MS));
    // occurredAt(실제 벌어진 시각)은 절대 바뀌지 않는다.
    expect(retryPayloads[0]!.event.occurredAt).toBe(OCCURRED_AT);
    // clockMs가 바뀌었으니 payloadHash도 그 내용에 맞게 다시 계산돼 원래
    // 해시와 달라야 한다 — 그래야 서버의 OFFLINE_EVENT_REBASE_CONFLICT
    // (payloadHash가 event 내용과 안 맞을 때 던지는 코드)를 피한다.
    expect(retryPayloads[0]!.payloadHash).not.toBe(originalPayloadHash);

    // 큐에 저장된 항목 자체도 보정된 내용으로 교체돼 있다 — 다음 재시도가
    // 또 같은 소수를 재전송하지 않는다.
    expect(result.current.queue.items[0]?.event.clockMs).toBe(Math.round(FRACTIONAL_CLOCK_MS));

    unmount();
  });

  it('이미 정수인 clockMs는 보정 없이 그대로 재시도한다(불필요한 해시 재계산 없음)', async () => {
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
        type: 'FOUL',
        sideId: 'side-1',
        period: 1,
        clockMs: 60_000,
        occurredAt: OCCURRED_AT,
        payload: {},
      });
    });

    await waitFor(() => expect(result.current.queue.items[0]?.status).toBe('failed'));
    const originalPayloadHash = result.current.queue.items[0]!.payloadHash;
    const clientEventId = result.current.queue.items[0]!.clientEventId;

    await act(async () => {
      await result.current.retryFailedEvent(clientEventId);
    });

    await waitFor(() => expect(result.current.queue.items[0]?.status).toBe('acked'));

    expect(retryPayloads[0]!.event.clockMs).toBe(60_000);
    expect(retryPayloads[0]!.payloadHash).toBe(originalPayloadHash);

    unmount();
  });
});
