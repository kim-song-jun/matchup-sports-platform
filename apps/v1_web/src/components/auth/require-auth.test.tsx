import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { RequireAuth } from './require-auth';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refetch: vi.fn(),
  clearStoredV1Session: vi.fn(),
  useV1AuthMe: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AuthMe: (...args: unknown[]) => mocks.useV1AuthMe(...args),
}));

vi.mock('@/lib/session-storage', () => ({
  clearStoredV1Session: mocks.clearStoredV1Session,
  getCurrentRedirectPath: () => '/v1/my',
  getLoginPathForRedirect: () => '/login?redirect=%2Fmy',
  hasStoredV1Session: () => true,
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
  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.refetch.mockReset();
    mocks.clearStoredV1Session.mockReset();
    mocks.useV1AuthMe.mockReset();
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
    expect(mocks.replace).not.toHaveBeenCalled();
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
    expect(mocks.replace).toHaveBeenCalledWith('/login?redirect=%2Fmy');
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
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
