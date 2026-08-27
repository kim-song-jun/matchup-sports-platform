import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogoutButton } from './logout-button';

const hooks = vi.hoisted(() => ({
  logoutMutate: vi.fn(),
  pushUnsubscribe: vi.fn().mockResolvedValue(undefined),
}));

const analytics = vi.hoisted(() => ({
  trackEvent: vi.fn(),
}));

const session = vi.hoisted(() => ({
  clearStoredV1Session: vi.fn(),
}));

const socket = vi.hoisted(() => ({
  disconnectV1Socket: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ removeQueries: vi.fn() }),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1Logout: () => ({ mutate: hooks.logoutMutate, isPending: false }),
}));

vi.mock('@/hooks/use-v1-push-registration', () => ({
  useV1PushRegistration: () => ({
    subscribe: vi.fn(),
    unsubscribe: hooks.pushUnsubscribe,
    permission: 'default',
    isSubscribed: false,
    isPending: false,
  }),
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: analytics.trackEvent,
}));

vi.mock('@/lib/session-storage', () => ({
  clearStoredV1Session: session.clearStoredV1Session,
}));

vi.mock('@/lib/v1-socket', () => ({
  disconnectV1Socket: socket.disconnectV1Socket,
}));

describe('LogoutButton GA events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tracks a logout event before firing the logout mutation', () => {
    // Given
    render(<LogoutButton />);

    // When
    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));

    // Then
    expect(analytics.trackEvent).toHaveBeenCalledWith('logout', {});
    expect(hooks.logoutMutate).toHaveBeenCalled();
  });
});

describe('LogoutButton session cleanup', () => {
  let replaceMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    replaceMock = vi.fn();
    vi.stubGlobal('location', { ...window.location, replace: replaceMock });
    // 로그아웃 mutation이 완료되면 컴포넌트가 넘긴 onSettled 콜백을 즉시 실행하도록 스텁한다.
    hooks.logoutMutate.mockImplementation((_variables, opts?: { onSettled?: () => void }) => {
      opts?.onSettled?.();
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('disconnects the realtime socket together with clearing the stored session', async () => {
    // Given
    render(<LogoutButton />);

    // When
    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));

    // Then — 세션 삭제와 소켓 연결 해제가 함께 일어나야 이전 사용자로 인증된 소켓이
    // 로그아웃 후에도 살아남아 다음 사용자 탭으로 데이터가 새는 것을 막는다.
    // pushCleanup 프라미스가 resolve 되는 다음 microtask 까지 리다이렉트가 지연되므로 waitFor.
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'));
    expect(session.clearStoredV1Session).toHaveBeenCalledTimes(1);
    expect(socket.disconnectV1Socket).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes the browser web push subscription so the next login on this device does not show a stale "on" toggle', async () => {
    // Given — 로그아웃이 브라우저 쪽 pushManager 구독을 끊지 않으면, 같은 기기에 로그인하는
    // 다음 사용자는 서버에 구독이 없는데도(로그아웃한 계정 소유였으므로) 브라우저
    // pushManager.getSubscription() 이 여전히 값을 반환해 알림 토글이 '켜짐'으로 잘못 보인다.
    render(<LogoutButton />);

    // When
    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));

    // Then
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'));
    expect(hooks.pushUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('여전히 리다이렉트한다 — 푸시 구독 해지가 실패해도 로그아웃 자체는 막히지 않는다', async () => {
    // Given — 서버 요청 실패 등으로 unsubscribe() 가 reject 해도(훅 내부에서 보통 삼키지만,
    // 방어적으로) 로그아웃 리다이렉트는 반드시 일어나야 한다 — 그렇지 않으면 사용자가
    // 로그아웃 버튼을 눌렀는데 화면에 아무 반응이 없는 것처럼 보인다.
    hooks.pushUnsubscribe.mockRejectedValueOnce(new Error('network'));
    render(<LogoutButton />);

    // When
    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));

    // Then
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'));
  });
});
