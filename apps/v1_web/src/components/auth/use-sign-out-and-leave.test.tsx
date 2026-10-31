import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reportClientError } from '@/lib/client-error-reporter';
import { readPendingSocialLink, savePendingSocialLink } from '@/lib/pending-social-link';
import { PUSH_REVOKE_TIMEOUT_MS, useSignOutAndLeave } from './use-sign-out-and-leave';

const calls = vi.hoisted(() => ({
  order: [] as string[],
  logout: vi.fn(),
  unsubscribePush: vi.fn(),
  pushOptions: [] as unknown[],
  removeQueries: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ removeQueries: calls.removeQueries }),
}));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1Logout: () => ({ mutateAsync: calls.logout, isPending: false }),
}));
vi.mock('@/hooks/use-v1-push-registration', () => ({
  useV1PushRegistration: (options: unknown) => {
    calls.pushOptions.push(options);
    return { unsubscribe: calls.unsubscribePush };
  },
}));
vi.mock('@/lib/session-storage', () => ({
  clearStoredV1Session: () => calls.order.push('session'),
}));
vi.mock('@/lib/v1-socket', () => ({
  disconnectV1Socket: () => calls.order.push('socket'),
}));
vi.mock('@/lib/client-error-reporter', () => ({ reportClientError: vi.fn() }));

const OPTIONS = { failureMessage: '로그아웃하지 못했어요.' };
const replace = vi.fn(() => calls.order.push('navigate'));

beforeEach(() => {
  vi.mocked(reportClientError).mockClear();
  calls.order = [];
  calls.pushOptions = [];
  calls.logout.mockReset().mockImplementation(async () => { calls.order.push('logout'); return { ok: true }; });
  calls.unsubscribePush.mockReset().mockImplementation(async () => { calls.order.push('push'); return true; });
  calls.removeQueries.mockReset().mockImplementation(() => calls.order.push('cache'));
  replace.mockClear();
  vi.stubGlobal('location', { ...window.location, replace });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useSignOutAndLeave', () => {
  it('해지는 인증된 동안, 정리와 이동은 로그아웃이 끝난 뒤에 한다', async () => {
    const { result } = renderHook(() => useSignOutAndLeave());

    await act(() => result.current.signOutAndLeave('/login', OPTIONS));

    expect(calls.order).toEqual(['push', 'logout', 'session', 'cache', 'socket', 'navigate']);
    expect(calls.unsubscribePush).toHaveBeenCalledWith({ reason: 'sign-out' });
    expect(replace).toHaveBeenCalledWith('/login');
    expect(result.current.error).toBeNull();
  });

  it('revokePush 가 false 면 푸시 훅을 켜지도 해지하지도 않는다', async () => {
    const { result } = renderHook(() => useSignOutAndLeave({ revokePush: false }));

    await act(() => result.current.signOutAndLeave('/login', OPTIONS));

    expect(calls.pushOptions.length).toBeGreaterThan(0);
    expect(calls.pushOptions.every((options) => (options as { enabled: boolean }).enabled === false)).toBe(true);
    expect(calls.unsubscribePush).not.toHaveBeenCalled();
    expect(calls.order).toEqual(['logout', 'session', 'cache', 'socket', 'navigate']);
  });

  it('기본값은 푸시 훅을 켜고 해지한다', async () => {
    const { result } = renderHook(() => useSignOutAndLeave());

    await act(() => result.current.signOutAndLeave('/login', OPTIONS));

    expect(calls.pushOptions.every((options) => (options as { enabled: boolean }).enabled === true)).toBe(true);
    expect(calls.unsubscribePush).toHaveBeenCalledTimes(1);
  });

  it('푸시 해지가 실패(false)해도 로그아웃과 이동은 막히지 않는다', async () => {
    calls.unsubscribePush.mockResolvedValue(false);
    const { result } = renderHook(() => useSignOutAndLeave());

    await act(() => result.current.signOutAndLeave('/login', OPTIONS));

    expect(calls.logout).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/login');
  });

  it('앱 셸이 응답하지 않아도 상한이 지나면 보고하고 로그아웃을 진행한다', async () => {
    vi.useFakeTimers();
    calls.unsubscribePush.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSignOutAndLeave());

    let done!: Promise<void>;
    act(() => { done = result.current.signOutAndLeave('/login', OPTIONS); });
    await act(() => vi.advanceTimersByTimeAsync(PUSH_REVOKE_TIMEOUT_MS - 1));
    expect(calls.logout).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await done;
    });

    expect(reportClientError).toHaveBeenCalledWith(expect.objectContaining({ level: 'warn' }));
    expect(calls.logout).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/login');
  });

  it('상한 안에 끝난 해지는 보고하지 않는다', async () => {
    const { result } = renderHook(() => useSignOutAndLeave());

    await act(() => result.current.signOutAndLeave('/login', OPTIONS));

    expect(reportClientError).not.toHaveBeenCalled();
  });

  it('로그아웃이 실패하면 세션을 지우거나 이동하지 않고 호출부가 정한 문구를 남긴다', async () => {
    calls.logout.mockRejectedValue(new Error('503'));
    const { result } = renderHook(() => useSignOutAndLeave());

    await act(() => result.current.signOutAndLeave('/login', OPTIONS));

    expect(replace).not.toHaveBeenCalled();
    expect(calls.order).not.toContain('session');
    expect(calls.order).not.toContain('cache');
    expect(calls.order).not.toContain('socket');
    expect(result.current.error).toBe('로그아웃하지 못했어요.');
    expect(result.current.pending).toBe(false);
  });

  it('실패한 뒤 다시 시도하면 오류를 지우고 이어서 나간다', async () => {
    calls.logout.mockRejectedValueOnce(new Error('503'));
    const { result } = renderHook(() => useSignOutAndLeave());
    await act(() => result.current.signOutAndLeave('/login', OPTIONS));
    expect(result.current.error).not.toBeNull();

    await act(() => result.current.signOutAndLeave('/login', OPTIONS));

    expect(result.current.error).toBeNull();
    expect(replace).toHaveBeenCalledWith('/login');
  });

  it('같은 틱에 두 번 불려도 로그아웃은 한 번만 보낸다', async () => {
    const { result } = renderHook(() => useSignOutAndLeave());

    await act(async () => {
      await Promise.all([
        result.current.signOutAndLeave('/login', OPTIONS),
        result.current.signOutAndLeave('/login', OPTIONS),
      ]);
    });

    expect(calls.logout).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('onStart 는 실제로 시작한 시도마다 한 번만 불린다 — 연타로 막힌 호출에는 불리지 않는다', async () => {
    const onStart = vi.fn();
    const { result } = renderHook(() => useSignOutAndLeave());

    await act(async () => {
      await Promise.all([
        result.current.signOutAndLeave('/login', { ...OPTIONS, onStart }),
        result.current.signOutAndLeave('/login', { ...OPTIONS, onStart }),
      ]);
    });

    expect(onStart).toHaveBeenCalledTimes(1);
  });

  describe('대기 연결 토큰', () => {
    const hint = { next: 'sign_in_then_link', provider: 'kakao', linkToken: 'link-token-1', linkTokenExpiresInSeconds: 600 } as const;
    afterEach(() => window.sessionStorage.clear());

    it('로그아웃이 끝나면 앞 사람이 남긴 대기 연결 토큰을 지운다', async () => {
      savePendingSocialLink(hint);
      const { result } = renderHook(() => useSignOutAndLeave());

      await act(() => result.current.signOutAndLeave('/login', OPTIONS));

      expect(readPendingSocialLink()).toBeNull();
    });

    it('로그아웃이 실패하면 아직 로그인 중이므로 토큰도 그대로 둔다', async () => {
      savePendingSocialLink(hint);
      calls.logout.mockRejectedValue(new Error('503'));
      const { result } = renderHook(() => useSignOutAndLeave());

      await act(() => result.current.signOutAndLeave('/login', OPTIONS));

      expect(readPendingSocialLink()).toMatchObject({ linkToken: 'link-token-1' });
    });

    // 로그아웃 정리가 토큰 칸을 지우므로, 이동 뒤 화면이 읽을 토큰은 정리보다 늦게 써야 살아남는다.
    it('onSignedOut 은 정리 뒤·이동 앞에 불려 그 안에서 저장한 토큰이 이동 뒤까지 남는다', async () => {
      savePendingSocialLink({ ...hint, linkToken: 'left-by-previous-person' });
      const seenInCallback: Array<string | undefined> = [];
      const onSignedOut = vi.fn(() => {
        calls.order.push('signed-out');
        seenInCallback.push(readPendingSocialLink()?.linkToken);
        savePendingSocialLink(hint);
      });
      const { result } = renderHook(() => useSignOutAndLeave());

      await act(() => result.current.signOutAndLeave('/login', { ...OPTIONS, onSignedOut }));

      expect(calls.order).toEqual(['push', 'logout', 'session', 'cache', 'socket', 'signed-out', 'navigate']);
      expect(seenInCallback).toEqual([undefined]);
      expect(readPendingSocialLink()).toMatchObject({ linkToken: 'link-token-1' });
    });

    it('onSignedOut 은 로그아웃이 실패하면 불리지 않는다', async () => {
      calls.logout.mockRejectedValue(new Error('503'));
      const onSignedOut = vi.fn();
      const { result } = renderHook(() => useSignOutAndLeave());

      await act(() => result.current.signOutAndLeave('/login', { ...OPTIONS, onSignedOut }));

      expect(onSignedOut).not.toHaveBeenCalled();
    });
  });
});
