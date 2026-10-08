import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { V1_SESSION_HINT_KEY, V1_USER_ID_KEY } from '@/lib/session-storage';
import { server } from '@/test/msw/server';
import { SessionEntryGate } from './session-entry-gate';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  disconnectV1Socket: vi.fn(),
  reportClientError: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('@/lib/v1-socket', () => ({
  disconnectV1Socket: mocks.disconnectV1Socket,
}));

vi.mock('@/lib/client-error-reporter', () => ({
  reportClientError: mocks.reportClientError,
}));

describe('SessionEntryGate storage failure handling', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());

  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.disconnectV1Socket.mockReset();
    mocks.reportClientError.mockReset();
    window.localStorage.clear();
    window.localStorage.setItem(V1_SESSION_HINT_KEY, 'active');
    window.localStorage.setItem(V1_USER_ID_KEY, 'withdrawn-user');
  });

  afterEach(() => {
    server.resetHandlers();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('keeps the login entry usable and reports a failed session clear after a real auth 401', async () => {
    let authRequestCount = 0;
    server.use(http.get('*/api/v1/auth/me', () => {
      authRequestCount += 1;
      return HttpResponse.json({
        status: 'error',
        statusCode: 401,
        code: 'UNAUTHENTICATED',
        message: '로그인이 필요해요.',
        details: null,
        requestId: 'session-entry-gate-storage-test',
        timestamp: new Date().toISOString(),
      }, { status: 401 });
    }));

    const originalRemoveItem = Storage.prototype.removeItem;
    const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key: string) {
      if (this === window.localStorage && key === V1_SESSION_HINT_KEY) {
        throw new DOMException('Storage is unavailable', 'SecurityError');
      }
      originalRemoveItem.call(this, key);
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <SessionEntryGate mode='login'>
          <div>이메일 로그인</div>
        </SessionEntryGate>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('이메일 로그인')).toBeInTheDocument();
    await waitFor(() => expect(authRequestCount).toBe(1));
    expect(removeItemSpy).toHaveBeenCalledWith(V1_SESSION_HINT_KEY);
    expect(mocks.disconnectV1Socket).toHaveBeenCalledTimes(1);
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.reportClientError).toHaveBeenCalledTimes(1);
    expect(mocks.reportClientError).toHaveBeenCalledWith(expect.objectContaining({
      level: 'warn',
      context: expect.objectContaining({ flow: 'session-entry-gate-session-cleanup' }),
    }));
    expect(screen.getByText('이메일 로그인')).toBeInTheDocument();
  });

  it('treats only the inactive-account permission response as a usable login entry', async () => {
    let authRequestCount = 0;
    server.use(http.get('*/api/v1/auth/me', () => {
      authRequestCount += 1;
      return HttpResponse.json({
        status: 'error',
        statusCode: 403,
        code: 'PERMISSION_DENIED',
        message: 'Account is not active',
        details: null,
        requestId: 'session-entry-gate-inactive-test',
        timestamp: new Date().toISOString(),
      }, { status: 403 });
    }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <SessionEntryGate mode='login'>
          <div>이메일 로그인</div>
        </SessionEntryGate>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('이메일 로그인')).toBeInTheDocument();
    await waitFor(() => expect(authRequestCount).toBe(1));
    expect(localStorage.getItem(V1_SESSION_HINT_KEY)).toBeNull();
    expect(localStorage.getItem(V1_USER_ID_KEY)).toBeNull();
    expect(mocks.disconnectV1Socket).toHaveBeenCalledTimes(1);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('keeps the session and retry screen for a different 403 auth restriction', async () => {
    server.use(http.get('*/api/v1/auth/me', () => HttpResponse.json({
      status: 'error',
      statusCode: 403,
      code: 'TERMS_RECONSENT_REQUIRED',
      message: '약관 동의가 필요해요.',
      details: null,
      requestId: 'session-entry-gate-terms-test',
      timestamp: new Date().toISOString(),
    }, { status: 403 })));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <SessionEntryGate mode='login'>
          <div>이메일 로그인</div>
        </SessionEntryGate>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('로그인 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
    expect(screen.queryByText('이메일 로그인')).not.toBeInTheDocument();
    expect(localStorage.getItem(V1_SESSION_HINT_KEY)).toBe('active');
    expect(localStorage.getItem(V1_USER_ID_KEY)).toBe('withdrawn-user');
    expect(mocks.disconnectV1Socket).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
