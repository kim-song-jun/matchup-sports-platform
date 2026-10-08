import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { ReactElement } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { WithdrawalPageClient } from './my-api-clients';
import { RequireAuth } from '@/components/auth/require-auth';
import { server } from '@/test/msw/server';
import { clearStoredV1Session, saveStoredV1Session, V1_SESSION_HINT_KEY, V1_USER_ID_KEY } from '@/lib/session-storage';
import { v1Keys } from '@/lib/query-keys';

const socket = vi.hoisted(() => ({ disconnect: vi.fn() }));
const documentNavigation = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/my/settings/withdrawal',
}));

vi.mock('@/lib/v1-socket', () => ({ disconnectV1Socket: socket.disconnect }));

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  return { ...view, queryClient };
}

describe('WithdrawalPageClient session termination', () => {
  let withdrawStatus: number;
  let requestCount: number;
  let deferWithdrawalResponse: boolean;
  let resolveWithdrawalResponse: ((response: Response) => void) | null;
  let pushUnsubscribeRequestCount: number;

  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('location', { ...window.location, replace: documentNavigation.replace });
    clearStoredV1Session();
    saveStoredV1Session({ userId: 'withdrawal-user', userEmail: 'user@example.test' });
    withdrawStatus = 200;
    requestCount = 0;
    deferWithdrawalResponse = false;
    resolveWithdrawalResponse = null;
    pushUnsubscribeRequestCount = 0;
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
    server.use(http.post('*/api/v1/me/withdrawal-request', async () => {
      requestCount += 1;
      if (deferWithdrawalResponse) {
        return await new Promise<Response>((resolve) => { resolveWithdrawalResponse = resolve; });
      }
      if (withdrawStatus >= 400) {
        return HttpResponse.json({
          status: 'error', statusCode: withdrawStatus, code: 'WITHDRAWAL_BLOCKED_ACTIVE_MATCH',
          message: '진행 중인 매치를 먼저 종료해 주세요.', details: null,
        }, { status: withdrawStatus });
      }
      return HttpResponse.json({
        status: 'success', data: { userId: 'withdrawal-user', accountStatus: 'withdrawal_pending', requestedAt: '2026-10-08T00:00:00.000Z' },
      });
    }),
    http.delete('*/api/v1/notifications/push-unsubscribe', () => {
      pushUnsubscribeRequestCount += 1;
      return HttpResponse.json({
        status: 'error', statusCode: 403, code: 'PERMISSION_DENIED', message: 'Account is not active', details: null,
      }, { status: 403 });
    }),
    http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })));
  });
  afterEach(() => {
    clearStoredV1Session();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('shows the 30-day deletion timeline and recovery path before submission', () => {
    renderWithClient(<WithdrawalPageClient />);

    expect(screen.getByText('탈퇴를 요청하면 30일 뒤 계정과 개인정보가 삭제돼요. 그 전에는 고객센터로 복구를 요청할 수 있어요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '탈퇴 요청' })).toBeInTheDocument();
  });

  it('clears the real identity cache and session, disconnects the socket, then replaces the document after API success', async () => {
    const user = userEvent.setup();
    const { queryClient } = renderWithClient(<WithdrawalPageClient />);
    queryClient.setQueryData(v1Keys.profile(), { userId: 'withdrawal-user' });
    queryClient.setQueryData(v1Keys.authMe(), { userId: 'withdrawal-user' });

    await user.click(screen.getByRole('button', { name: '탈퇴 요청' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^탈퇴 요청$/ }));

    await waitFor(() => expect(documentNavigation.replace).toHaveBeenCalledWith('/login'));
    expect(requestCount).toBe(1);
    expect(queryClient.getQueryCache().findAll({ queryKey: v1Keys.all })).toHaveLength(0);
    expect(localStorage.getItem(V1_SESSION_HINT_KEY)).toBeNull();
    expect(localStorage.getItem(V1_USER_ID_KEY)).toBeNull();
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
  });

  it('does not refetch active auth after withdrawal succeeds and redirect leaves the authenticated screen stable', async () => {
    let authRequestCount = 0;
    server.use(http.get('*/api/v1/auth/me', () => {
      authRequestCount += 1;
      if (authRequestCount > 1) {
        return HttpResponse.json({
          status: 'error', statusCode: 403, code: 'PERMISSION_DENIED',
          message: 'Account is not active', details: null,
        }, { status: 403 });
      }
      return HttpResponse.json({
        status: 'success', data: {
          user: { id: 'withdrawal-user', email: 'user@example.test', onboardingStatus: 'completed' },
          profile: { displayName: '테스트 사용자' },
          verification: { emailVerified: true, phoneVerified: true },
          termsCompliance: { compliant: true, pendingRequiredDocumentIds: [], nextRoute: null },
        },
      });
    }));
    const user = userEvent.setup();
    renderWithClient(<RequireAuth><WithdrawalPageClient /></RequireAuth>);

    await user.click(await screen.findByRole('button', { name: '탈퇴 요청' }));
    expect(authRequestCount).toBe(1);
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^탈퇴 요청$/ }));

    await waitFor(() => expect(documentNavigation.replace).toHaveBeenCalledWith('/login'));
    expect(requestCount).toBe(1);
    expect(authRequestCount).toBe(1);
    expect(screen.queryByText('로그인 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.')).not.toBeInTheDocument();
  });

  it('completes successful withdrawal cleanup after the page unmounts while the actual request is pending', async () => {
    deferWithdrawalResponse = true;
    const user = userEvent.setup();
    const view = renderWithClient(<WithdrawalPageClient />);

    await user.click(screen.getByRole('button', { name: '탈퇴 요청' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^탈퇴 요청$/ }));
    await waitFor(() => expect(requestCount).toBe(1));
    view.unmount();

    await act(async () => {
      resolveWithdrawalResponse?.(HttpResponse.json({
        status: 'success', data: { userId: 'withdrawal-user', accountStatus: 'withdrawal_pending', requestedAt: '2026-10-08T00:00:00.000Z' },
      }));
    });

    await waitFor(() => expect(documentNavigation.replace).toHaveBeenCalledWith('/login'));
    expect(localStorage.getItem(V1_SESSION_HINT_KEY)).toBeNull();
    expect(localStorage.getItem(V1_USER_ID_KEY)).toBeNull();
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
  });

  it('removes the browser subscription when the inactive-account guard rejects push-row cleanup', async () => {
    const subscription = { endpoint: 'https://push.example/device', unsubscribe: vi.fn().mockResolvedValue(true) };
    vi.stubGlobal('navigator', {
      serviceWorker: { getRegistration: vi.fn().mockResolvedValue({ pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription) } }) },
    });
    vi.stubGlobal('PushManager', class PushManager {});
    vi.stubGlobal('Notification', { permission: 'default' });
    const user = userEvent.setup();
    renderWithClient(<WithdrawalPageClient />);

    await user.click(screen.getByRole('button', { name: '탈퇴 요청' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^탈퇴 요청$/ }));

    await waitFor(() => expect(documentNavigation.replace).toHaveBeenCalledWith('/login'));
    expect(pushUnsubscribeRequestCount).toBe(1);
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(V1_SESSION_HINT_KEY)).toBeNull();
  });

  it('still clears the withdrawn session and navigates when browser subscription removal rejects', async () => {
    const subscription = { endpoint: 'https://push.example/device', unsubscribe: vi.fn().mockRejectedValue(new Error('browser refused unsubscribe')) };
    vi.stubGlobal('navigator', {
      serviceWorker: { getRegistration: vi.fn().mockResolvedValue({ pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription) } }) },
    });
    vi.stubGlobal('PushManager', class PushManager {});
    vi.stubGlobal('Notification', { permission: 'default' });
    const user = userEvent.setup();
    renderWithClient(<WithdrawalPageClient />);

    await user.click(screen.getByRole('button', { name: '탈퇴 요청' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^탈퇴 요청$/ }));

    await waitFor(() => expect(documentNavigation.replace).toHaveBeenCalledWith('/login'));
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(V1_SESSION_HINT_KEY)).toBeNull();
  });

  it('keeps valid identity, cached data, and navigation after the API rejects the request', async () => {
    withdrawStatus = 403;
    const subscription = { endpoint: 'https://push.example/device', unsubscribe: vi.fn().mockResolvedValue(true) };
    vi.stubGlobal('navigator', {
      serviceWorker: { getRegistration: vi.fn().mockResolvedValue({ pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription) } }) },
    });
    vi.stubGlobal('PushManager', class PushManager {});
    vi.stubGlobal('Notification', { permission: 'default' });
    const { queryClient } = renderWithClient(<WithdrawalPageClient />);
    queryClient.setQueryData(v1Keys.profile(), { userId: 'withdrawal-user' });

    fireEvent.click(screen.getByRole('button', { name: '탈퇴 요청' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^탈퇴 요청$/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('진행 중인 매치를 먼저 종료해 주세요.');
    expect(requestCount).toBe(1);
    expect(localStorage.getItem(V1_SESSION_HINT_KEY)).toBe('active');
    expect(localStorage.getItem(V1_USER_ID_KEY)).toBe('withdrawal-user');
    expect(queryClient.getQueryData(v1Keys.profile())).toEqual({ userId: 'withdrawal-user' });
    expect(documentNavigation.replace).not.toHaveBeenCalled();
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(pushUnsubscribeRequestCount).toBe(0);
    expect(subscription.unsubscribe).not.toHaveBeenCalled();
  });
});
