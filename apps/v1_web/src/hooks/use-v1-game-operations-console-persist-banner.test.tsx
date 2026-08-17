import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { GameState } from '@/types/game-operations';

/**
 * localStorage 저장 실패(대부분 `QuotaExceededError`) 처리 회귀 테스트.
 *
 * 예전에는 `persistQueue`에 try/catch가 아예 없어서 이 예외가 effect에서 그대로
 * 튀어 올라 **콘솔 컴포넌트 트리 전체가 언마운트**됐다(경기 도중 화면이 통째로
 * 사라진다). 그렇다고 조용히 삼키면 안 된다 — 저장 실패는 "새로고침하면 아직 못
 * 보낸 기록이 사라진다"는 뜻이라 운영자가 알아야 한다.
 *
 * 다만 배너 슬롯은 하나뿐이라(`operate-console.tsx`) 통지를 큐가 바뀔 때마다 다시
 * 세우면 '운영 권한이 해제됐어요' 같은 더 급한 공지를 덮어쓴다. 그래서 세우는 것도
 * 지우는 것도 **상태가 바뀌는 순간에만** 한다.
 */

const GAME_ID = 'game-1';

function createMockSocket() {
  const handlers = new Map<string, Set<(...args: never[]) => void>>();
  let sequence = 0;

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
    emit(event: string, _payload: unknown, cb?: (result: unknown) => void) {
      if (event === 'game.subscribe' && cb) {
        cb({
          status: 'subscribed',
          snapshot: { version: 3, state: 'LIVE' as GameState, lastSequence: 0, events: [] },
        });
        return;
      }
      if ((event === 'game.takeover.request' || event === 'game.takeover.renew') && cb) {
        cb({
          status: 'granted',
          takeoverToken: 'token-1',
          expiresAt: new Date(Date.now() + 90_000).toISOString(),
        });
        return;
      }
      if (event === 'game.event.append' && cb) {
        sequence += 1;
        cb({ status: 'ack', sequence, version: 3 + sequence });
      }
    },
  };

  function fire(event: string, ...args: unknown[]) {
    for (const handler of [...(handlers.get(event) ?? [])]) {
      (handler as (...a: unknown[]) => void)(...args);
    }
  }

  return { socket, fire };
}

vi.mock('@/lib/api-client', () => ({
  v1Get: vi.fn(async () => ({ items: [] })),
  v1Post: vi.fn(async () => ({})),
}));
vi.mock('@/lib/client-error-reporter', () => ({ reportClientError: vi.fn() }));

function createWrapper(queryClient: QueryClient) {
  return function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

/** jsdom의 `localStorage.setItem`은 `Storage.prototype`에 있다 — 인스턴스 프로퍼티를
 * 덮어써도 훅의 호출에는 반영되지 않으므로 프로토타입을 스파이한다. */
function failSetItem() {
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('quota', 'QuotaExceededError');
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.resetModules();
  window.localStorage.clear();
});

async function mountConsole() {
  const mock = createMockSocket();
  vi.doMock('@/lib/v1-game-operations-socket', () => ({
    getV1GameOperationsSocket: () => mock.socket,
    setGameOperationsAuthorizationSubjectVersion: vi.fn(),
  }));

  const { useV1GameOperationsConsole } = await import('./use-v1-game-operations-console');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rendered = renderHook(
    () =>
      useV1GameOperationsConsole({
        tournamentId: null,
        gameId: GAME_ID,
        myUserId: 'user-1',
        initialLastSequence: 0,
      }),
    { wrapper: createWrapper(queryClient) },
  );
  await waitFor(() => expect(rendered.result.current.gameSnapshot).not.toBeNull());
  return { ...mock, ...rendered };
}

async function recordGoal(submit: (input: never) => Promise<void>, clockMs: number) {
  await act(async () => {
    await (submit as unknown as (input: Record<string, unknown>) => Promise<void>)({
      type: 'GOAL',
      sideId: 'side-home',
      participantId: 'p-1',
      period: 1,
      clockMs,
      occurredAt: '2026-08-16T00:01:00.000Z',
      payload: {},
    });
  });
}

describe('useV1GameOperationsConsole — 로컬 저장 실패 통지', () => {
  it('저장이 실패하면 배너를 띄우되, 이후 큐가 바뀌어도 더 급한 배너를 덮어쓰지 않는다', async () => {
    const { fire, result, unmount } = await mountConsole();

    failSetItem();

    // 저장 실패를 유발하는 첫 큐 변경.
    await recordGoal(result.current.submitEvent as never, 60_000);
    await waitFor(() => expect(result.current.bannerMessage).toContain('임시 저장하지 못했어요'));

    // 다른 운영자가 인계 — 이쪽이 훨씬 급한 공지다.
    act(() => fire('game.permission.revoked'));
    expect(result.current.bannerMessage).toBe('운영 권한이 해제됐어요. 다른 운영자가 이 경기를 담당하고 있어요.');

    // 저장이 계속 실패하는 기기에서 큐가 한 번 더 바뀌어도 그 공지를 지우면 안 된다.
    await recordGoal(result.current.submitEvent as never, 120_000);
    expect(result.current.bannerMessage).toBe('운영 권한이 해제됐어요. 다른 운영자가 이 경기를 담당하고 있어요.');

    unmount();
  });

  it('저장이 다시 성공하면 저장 실패 배너를 걷는다', async () => {
    const { result, unmount } = await mountConsole();

    const spy = failSetItem();
    await recordGoal(result.current.submitEvent as never, 60_000);
    await waitFor(() => expect(result.current.bannerMessage).toContain('임시 저장하지 못했어요'));

    spy.mockRestore();
    await recordGoal(result.current.submitEvent as never, 120_000);

    await waitFor(() => expect(result.current.bannerMessage).toBeNull());

    unmount();
  });

  it('확정(acked)된 항목은 localStorage에 저장하지 않는다', async () => {
    const { result, unmount } = await mountConsole();

    await recordGoal(result.current.submitEvent as never, 60_000);
    // 화면(`QueueStatusPanel`)에는 세션 동안 그대로 남는다 — 줄이는 건 저장분뿐이다.
    await waitFor(() => expect(result.current.queue.items[0]?.status).toBe('acked'));

    const stored = window.localStorage.getItem(`teameet.v1.gameOps.queue.${GAME_ID}`);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored as string).items).toEqual([]);

    unmount();
  });
});
