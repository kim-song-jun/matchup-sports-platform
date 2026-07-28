import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { RequireAuth } from './require-auth';

const mocks = vi.hoisted(() => ({
  refetch: vi.fn(),
  clearStoredV1Session: vi.fn(),
  disconnectV1Socket: vi.fn(),
  useV1AuthMe: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AuthMe: (...args: unknown[]) => mocks.useV1AuthMe(...args),
}));

vi.mock('@/lib/session-storage', () => ({
  clearStoredV1Session: mocks.clearStoredV1Session,
  getCurrentRedirectPath: () => '/v1/my',
  getLoginPathForRedirect: () => '/login?redirect=%2Fmy',
  shouldProbeV1Session: () => true,
}));

vi.mock('@/lib/v1-socket', () => ({
  disconnectV1Socket: mocks.disconnectV1Socket,
}));

function apiError(statusCode: number, code: string) {
  return new V1ApiError({
    status: 'error',
    statusCode,
    code,
    message: code,
    timestamp: '2026-07-20T00:00:00.000Z',
  });
}

describe('RequireAuth', () => {
  let replaceMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    replaceMock = vi.fn();
    vi.stubGlobal('location', { ...window.location, replace: replaceMock });
    mocks.refetch.mockReset();
    mocks.clearStoredV1Session.mockReset();
    mocks.disconnectV1Socket.mockReset();
    mocks.useV1AuthMe.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not clear a new session while a cached 401 is being revalidated', async () => {
    mocks.useV1AuthMe.mockReturnValue({
      isError: true,
      isFetching: true,
      isSuccess: false,
      error: apiError(401, 'UNAUTHENTICATED'),
      refetch: mocks.refetch,
    });

    render(<RequireAuth><div>마이페이지</div></RequireAuth>);

    await waitFor(() => expect(mocks.useV1AuthMe).toHaveBeenCalled());
    expect(mocks.clearStoredV1Session).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('clears and redirects after a confirmed unauthenticated response', async () => {
    mocks.useV1AuthMe.mockReturnValue({
      isError: true,
      isFetching: false,
      isSuccess: false,
      error: apiError(401, 'UNAUTHENTICATED'),
      refetch: mocks.refetch,
    });

    render(<RequireAuth><div>마이페이지</div></RequireAuth>);

    await waitFor(() => expect(mocks.clearStoredV1Session).toHaveBeenCalledTimes(1));
    expect(mocks.disconnectV1Socket).toHaveBeenCalledTimes(1);
    // router.replace()(소프트 네비게이션)는 로그인 상태에서 prefetch된 /login 인스턴스를
    // 재사용해 로그아웃/세션만료 이전 스냅샷에 멈추는 버그가 있어 하드 네비게이션으로 전환했다.
    expect(replaceMock).toHaveBeenCalledWith('/login?redirect=%2Fmy');
  });

  it('keeps the session and exposes retry for a temporary auth failure', async () => {
    mocks.useV1AuthMe.mockReturnValue({
      isError: true,
      isFetching: false,
      isSuccess: false,
      error: apiError(503, 'SERVICE_UNAVAILABLE'),
      refetch: mocks.refetch,
    });

    render(<RequireAuth><div>마이페이지</div></RequireAuth>);

    expect(await screen.findByText('로그인 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
    expect(mocks.clearStoredV1Session).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
