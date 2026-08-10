import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

/**
 * 레인 A #3 회귀 테스트 — alpha 실측(2026-08): "운영 권한 토큰이 만료됐어요.
 * 다시 가져오는 중이에요. (TAKEOVER_TOKEN_EXPIRED)" 배너가 뜬 채 모든 버튼이
 * 비활성이고, 8초를 기다려도 회복되지 않았다(새로고침해야 풀림).
 *
 * 근본 원인: 주기적 renew(`game.takeover.renew`)가 실패하면 `'denied'`
 * 상태로 떨어지는데(게이트웨이는 PERMISSION_DENIED가 아닌 모든 실패를
 * `TAKEOVER_TOKEN_EXPIRED`로 매핑한다 — `renewGameTakeover`), 자동
 * 재요청 effect는 `'expired'`(자연 만료, `CHECK_EXPIRY`)만 지켜봐서
 * 이 경로는 아무것도 다시 시도하지 않았다. 이 테스트가 다시 깨지면 그
 * 회귀다.
 */

const TAKEOVER_RENEW_INTERVAL_MS = 20_000;

const mockSocket = {
  connected: true,
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
};

vi.mock('@/lib/v1-game-operations-socket', () => ({
  getV1GameOperationsSocket: () => mockSocket,
  setGameOperationsAuthorizationSubjectVersion: vi.fn(),
}));
vi.mock('@/lib/api-client', () => ({
  v1Get: vi.fn(async () => ({ items: [] })),
  v1Post: vi.fn(async () => ({})),
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
  window.localStorage.clear();
  vi.useRealTimers();
});

describe('useV1GameOperationsConsole — renew가 TAKEOVER_TOKEN_EXPIRED로 실패해도 자동으로 재획득한다', () => {
  it('renew 실패 → denied(TAKEOVER_TOKEN_EXPIRED) → 자동 재요청 → 다시 held', async () => {
    let takeoverRequestCount = 0;
    mockSocket.emit.mockImplementation(
      (event: string, _payload: unknown, cb?: (result: unknown) => void) => {
        if (event === 'game.subscribe' && cb) {
          cb({ status: 'subscribed', snapshot: { version: 5, state: 'LIVE', lastSequence: 0, events: [] } });
        } else if (event === 'game.takeover.request' && cb) {
          takeoverRequestCount += 1;
          cb({
            status: 'granted',
            takeoverToken: `tok-${takeoverRequestCount}`,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          });
        } else if (event === 'game.takeover.renew' && cb) {
          // 서버가 renew를 TAKEOVER_TOKEN_EXPIRED로 거부하는 상황을
          // 재현한다 — 진짜 스코프 거부(STAFF_SCOPE_DENIED)가 아니다.
          cb({ status: 'denied', code: 'TAKEOVER_TOKEN_EXPIRED' });
        }
      },
    );

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

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.takeover.status).toBe('held');
    expect(takeoverRequestCount).toBe(1);

    // 20초 뒤 주기적 renew가 발사되고, mock은 TAKEOVER_TOKEN_EXPIRED로
    // 거부한다.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TAKEOVER_RENEW_INTERVAL_MS);
    });

    // 예전 버그: 여기서 상태가 'denied'에 영원히 머물렀다. 고친 뒤에는
    // 자동으로 game.takeover.request가 다시 나가 'held'로 복귀한다 — 새로고침
    // 없이.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(takeoverRequestCount).toBe(2);
    expect(result.current.takeover.status).toBe('held');
    if (result.current.takeover.status === 'held') {
      expect(result.current.takeover.token).toBe('tok-2');
    }

    unmount();
  });
});
