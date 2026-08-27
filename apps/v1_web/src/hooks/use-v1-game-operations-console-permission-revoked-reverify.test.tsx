import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

/**
 * 백로그 결함 수정 — "한 대회에 배정이 둘 이상인 스태프의 배정 하나만
 * 해제해도, 그 대회의 모든 경기 콘솔에서 쫓겨나 남은 담당 경기를 새로고침
 * 전까지 기록할 수 없다".
 *
 * 서버 `evictUserFromScopedGameRooms`는 **대회 단위**로 축출한다(명세·스펙에
 * 박제된 의도적 동작 — 배정 단위로 좁히면 realtime.gateway.task8-protocol.spec.ts
 * 가 red 가 된다). 그래서 배정을 둘 이상 가진 스태프가 그중 하나만 해제돼도,
 * 나머지 배정으로 정상 운영 중인 다른 게임의 콘솔까지 `game.permission.revoked`
 * 를 받는다.
 *
 * 이 결함 수정은 그 통지를 곧바로 "영구 박탈"로 취급하지 않고 **재검증
 * 트리거**로 다룬다: 이 게임을 다시 구독해 본다. 서버 `subscribeToGame`은
 * 구독마다 이 특정 fixture/field에 대한 스태프 스코프를 처음부터 다시
 * 검사하므로, 해제된 게 다른 배정이면 재구독이 그대로 통과해 조용히
 * 복구되고(오탐), 이 게임에 대한 접근이 실제로 없다면 재구독도 거부돼
 * 그때 비로소 revoked로 전환된다(진양성).
 */

type SocketHandler = (payload: unknown) => void;

function createMockSocket(subscribeAckQueue: Array<{ status: string; snapshot?: unknown }>) {
  const handlers = new Map<string, SocketHandler>();
  const subscribeCalls: unknown[] = [];
  const socket = {
    connected: true,
    on: vi.fn((event: string, handler: SocketHandler) => {
      handlers.set(event, handler);
    }),
    off: vi.fn(),
    emit: vi.fn((event: string, payload: unknown, cb?: (result: unknown) => void) => {
      if (event === 'game.subscribe' && cb) {
        subscribeCalls.push(payload);
        const next = subscribeAckQueue.shift() ?? { status: 'subscribed', snapshot: { version: 1, state: 'LIVE', lastSequence: 0, events: [] } };
        cb(next);
        return;
      }
      if (event === 'game.takeover.request' && cb) {
        cb({ status: 'granted', takeoverToken: 'tok-1', expiresAt: new Date(Date.now() + 60_000).toISOString() });
      }
    }),
  };
  function fire(event: string, ...args: unknown[]) {
    handlers.get(event)?.(...(args as [unknown]));
  }
  return { socket, fire, subscribeCalls };
}

const mockV1Post = vi.fn(async (..._args: unknown[]) => ({}));

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

describe('useV1GameOperationsConsole — game.permission.revoked는 즉시 영구 박탈이 아니라 재검증 트리거다', () => {
  it('재구독이 성공하면(다른 배정만 해제된 오탐) 조용히 복구된다 — revoked로 떨어지지 않고 배너도 없다', async () => {
    // 최초 구독 1회 + 재검증용 재구독 1회, 둘 다 성공.
    const { socket, fire, subscribeCalls } = createMockSocket([
      { status: 'subscribed', snapshot: { version: 1, state: 'LIVE', lastSequence: 0, events: [] } },
      { status: 'subscribed', snapshot: { version: 1, state: 'LIVE', lastSequence: 2, events: [] } },
    ]);
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

    await waitFor(() => expect(result.current.gameSnapshot).not.toBeNull());
    await waitFor(() => expect(result.current.takeover.status).toBe('held'));

    act(() => fire('game.permission.revoked', { gameId: 'game-1', assignmentVersion: 3 }));

    // 재구독이 실제로 일어났고(재검증 시도), 그 결과 새 스냅숏(lastSequence:2)이
    // 반영됐다 — takeover는 여전히 'held'이고 revoked로 떨어지지 않았다.
    await waitFor(() => expect(subscribeCalls.length).toBe(2));
    await waitFor(() => expect(result.current.gameSnapshot?.version).toBe(1));
    expect(result.current.takeover.status).toBe('held');
    expect(result.current.bannerMessage).toBeNull();

    unmount();
  });

  it('재구독마저 거부되면(실제로 이 게임 접근이 없음) 그때 revoked로 전환되고, 문구는 "다른 운영자가 담당"을 단정하지 않는다', async () => {
    const { socket, fire, subscribeCalls } = createMockSocket([
      { status: 'subscribed', snapshot: { version: 1, state: 'LIVE', lastSequence: 0, events: [] } },
      { status: 'denied' },
    ]);
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

    await waitFor(() => expect(result.current.gameSnapshot).not.toBeNull());
    await waitFor(() => expect(result.current.takeover.status).toBe('held'));

    act(() => fire('game.permission.revoked', { gameId: 'game-1', assignmentVersion: 3 }));

    await waitFor(() => expect(subscribeCalls.length).toBe(2));
    await waitFor(() => expect(result.current.takeover.status).toBe('revoked'));
    // 서버 리스(GameTakeoverService)는 이 축출 경로에서 건드려지지 않으므로
    // 아무도 실제로 인수하지 않았다 — "다른 운영자가 담당하고 있어요"라고
    // 근거 없이 단정하지 않는다.
    expect(result.current.bannerMessage).toBe('이 경기의 운영 권한을 다시 확인하지 못했어요. 새로고침 후 다시 시도해주세요.');

    unmount();
  });
});
