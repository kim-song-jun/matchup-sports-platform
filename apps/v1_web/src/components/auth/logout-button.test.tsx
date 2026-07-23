import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogoutButton } from './logout-button';

const hooks = vi.hoisted(() => ({
  logoutMutate: vi.fn(),
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

  it('disconnects the realtime socket together with clearing the stored session', () => {
    // Given
    render(<LogoutButton />);

    // When
    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));

    // Then — 세션 삭제와 소켓 연결 해제가 함께 일어나야 이전 사용자로 인증된 소켓이
    // 로그아웃 후에도 살아남아 다음 사용자 탭으로 데이터가 새는 것을 막는다.
    expect(session.clearStoredV1Session).toHaveBeenCalledTimes(1);
    expect(socket.disconnectV1Socket).toHaveBeenCalledTimes(1);
    // router.replace()(소프트 네비게이션)는 로그인 상태에서 prefetch된 /login 인스턴스를
    // 재사용해 로그아웃 이전 세션 스냅샷에 멈추는 버그가 있어 하드 네비게이션으로 전환했다.
    expect(replaceMock).toHaveBeenCalledWith('/login');
  });
});
