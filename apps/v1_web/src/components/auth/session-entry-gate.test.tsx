import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { SessionEntryGate } from './session-entry-gate';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  clearStoredV1Session: vi.fn(),
  disconnectV1Socket: vi.fn(),
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
  shouldProbeV1Session: () => true,
  sanitizeRedirectPath: () => null,
}));

vi.mock('@/lib/v1-socket', () => ({
  disconnectV1Socket: mocks.disconnectV1Socket,
}));

describe('SessionEntryGate', () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.clearStoredV1Session.mockReset();
    mocks.disconnectV1Socket.mockReset();
    mocks.useV1AuthMe.mockReset();
  });

  it('disables the stale auth query after clearing an expired login hint', async () => {
    mocks.useV1AuthMe.mockReturnValue({
      isError: true,
      isFetching: false,
      isSuccess: false,
      error: new V1ApiError({
        status: 'error',
        statusCode: 401,
        code: 'UNAUTHENTICATED',
        message: 'expired',
        timestamp: '2026-07-20T00:00:00.000Z',
      }),
    });

    render(
      <SessionEntryGate mode='login'>
        <div>로그인 선택</div>
      </SessionEntryGate>,
    );

    expect(await screen.findByText('로그인 선택')).toBeInTheDocument();
    await waitFor(() => expect(mocks.clearStoredV1Session).toHaveBeenCalledTimes(1));
    expect(mocks.disconnectV1Socket).toHaveBeenCalledTimes(1);
    expect(mocks.useV1AuthMe).toHaveBeenLastCalledWith({
      enabled: false,
      retry: expect.any(Function),
    });
  });

  it('does not show the login form for a transient (non-401) auth check failure — keeps the session and offers a retry instead', async () => {
    const refetch = vi.fn();
    mocks.useV1AuthMe.mockReturnValue({
      isError: true,
      isFetching: false,
      isSuccess: false,
      refetch,
      error: new V1ApiError({
        status: 'error',
        statusCode: 503,
        code: 'SERVICE_UNAVAILABLE',
        message: 'temporary outage',
        timestamp: '2026-07-20T00:00:00.000Z',
      }),
    });

    render(
      <SessionEntryGate mode='login'>
        <div>로그인 선택</div>
      </SessionEntryGate>,
    );

    // 세션이 살아있을 수 있으므로 로그인 폼으로 내려보내지 않는다.
    expect(screen.queryByText('로그인 선택')).not.toBeInTheDocument();
    expect(mocks.clearStoredV1Session).not.toHaveBeenCalled();
    expect(mocks.disconnectV1Socket).not.toHaveBeenCalled();

    // 다만 로딩 화면에 갇히지도 않아야 한다 — 직접 다시 시도할 수단이 있어야 한다.
    expect(
      await screen.findByText('로그인 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('로그인 정보를 확인하고 있어요.')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('retries only transient failures — never a 4xx, which would answer the same and waste the rate limit', () => {
    mocks.useV1AuthMe.mockReturnValue({ isError: false, isFetching: false, isSuccess: false });

    render(
      <SessionEntryGate mode='login'>
        <div>로그인 선택</div>
      </SessionEntryGate>,
    );

    const { retry } = mocks.useV1AuthMe.mock.calls.at(-1)![0] as {
      retry: (failureCount: number, error: unknown) => boolean;
    };
    const apiError = (statusCode: number, code: string) =>
      new V1ApiError({
        status: 'error',
        statusCode,
        code,
        message: 'x',
        timestamp: '2026-07-20T00:00:00.000Z',
      });

    // 401은 다시 물어도 답이 같다 — 즉시 포기하고 로그아웃 경로로 가야 한다.
    expect(retry(0, apiError(401, 'UNAUTHENTICATED'))).toBe(false);
    // 403도 마찬가지다. /auth/me는 계정 정지·소셜 가입 미완·약관 재동의로 403을 흔하게
    // 돌려주는데, 이걸 재시도하면 사용자는 백오프만큼 기다리고 서버는 요청을 3배로 받는다.
    expect(retry(0, apiError(403, 'TERMS_RECONSENT_REQUIRED'))).toBe(false);
    expect(retry(0, apiError(403, 'SIGNUP_INCOMPLETE'))).toBe(false);
    // rate limit 503 등 일시 오류는 스스로 복구를 시도한다.
    expect(retry(0, apiError(503, 'SERVICE_UNAVAILABLE'))).toBe(true);
    expect(retry(1, apiError(503, 'SERVICE_UNAVAILABLE'))).toBe(true);
    // 무한히 재시도해 서버를 더 밀어붙이지는 않는다.
    expect(retry(2, apiError(503, 'SERVICE_UNAVAILABLE'))).toBe(false);
    // 네트워크 단절은 응답이 없어 V1ApiError로 감싸이지 않는다 — 이 경로도 재시도 대상이다.
    expect(retry(0, new TypeError('Failed to fetch'))).toBe(true);
  });
});
