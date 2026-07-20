import { render, screen, waitFor } from '@testing-library/react';
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
    expect(mocks.useV1AuthMe).toHaveBeenLastCalledWith({ enabled: false, retry: false });
  });
});
