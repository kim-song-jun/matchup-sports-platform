import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { transferableAbortController } from 'node:util';
import type { ReactElement } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { WithdrawalPageClient } from './my-api-clients';
import { RequireAuth } from '@/components/auth/require-auth';
import { server } from '@/test/msw/server';
import { clearStoredV1Session, saveStoredV1Session, V1_SESSION_HINT_KEY, V1_USER_ID_KEY } from '@/lib/session-storage';
import { v1Keys } from '@/lib/query-keys';
import type { ClientErrorPayload } from '@/lib/client-error-reporter';

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
  let loseWithdrawalResponseAfterCommit: boolean;
  let withdrawalCommitted: boolean;
  let pushUnsubscribeRequestCount: number;
  let logoutRequestCount: number;
  let clientErrorPayloads: ClientErrorPayload[];

  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());
  beforeEach(() => {
    vi.clearAllMocks();
    class NodeCompatibleAbortController {
      private readonly controller = transferableAbortController();

      get signal() {
        return this.controller.signal;
      }

      abort(reason?: unknown) {
        this.controller.abort(reason);
      }
    }
    vi.stubGlobal('AbortController', NodeCompatibleAbortController);
    vi.stubGlobal('location', { ...window.location, replace: documentNavigation.replace });
    clearStoredV1Session();
    saveStoredV1Session({ userId: 'withdrawal-user', userEmail: 'user@example.test' });
    withdrawStatus = 200;
    requestCount = 0;
    deferWithdrawalResponse = false;
    resolveWithdrawalResponse = null;
    loseWithdrawalResponseAfterCommit = false;
    withdrawalCommitted = false;
    pushUnsubscribeRequestCount = 0;
    logoutRequestCount = 0;
    clientErrorPayloads = [];
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
    server.use(http.post('*/api/v1/me/withdrawal-request', async () => {
      requestCount += 1;
      if (loseWithdrawalResponseAfterCommit) {
        withdrawalCommitted = true;
        return HttpResponse.error();
      }
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
    http.post<never, ClientErrorPayload>('*/api/v1/logs/client-error', async ({ request }) => {
      clientErrorPayloads.push(await request.json());
      return new HttpResponse(null, { status: 204 });
    }),
    http.post('*/api/v1/auth/logout', () => {
      logoutRequestCount += 1;
      return HttpResponse.json({ status: 'success', data: { ok: true } });
    }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
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

  it('reconciles a committed withdrawal with a lost response when auth now rejects the session', async () => {
    loseWithdrawalResponseAfterCommit = true;
    let authRequestCount = 0;
    server.use(http.get('*/api/v1/auth/me', () => {
      authRequestCount += 1;
      if (withdrawalCommitted) {
        return HttpResponse.json({
          status: 'error', statusCode: 403, code: 'PERMISSION_DENIED',
          message: 'Account is not active', details: null,
        }, { status: 403 });
      }
      return HttpResponse.json({ status: 'success', data: { user: { id: 'withdrawal-user' } } });
    }));
    const { queryClient } = renderWithClient(<WithdrawalPageClient />);
    queryClient.setQueryData(v1Keys.profile(), { userId: 'withdrawal-user' });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '탈퇴 요청' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^탈퇴 요청$/ }));

    await waitFor(() => expect(documentNavigation.replace).toHaveBeenCalledWith('/login'));
    expect(requestCount).toBe(1);
    expect(withdrawalCommitted).toBe(true);
    expect(authRequestCount).toBe(1);
    expect(logoutRequestCount).toBe(1);
    expect(localStorage.getItem(V1_SESSION_HINT_KEY)).toBeNull();
    expect(localStorage.getItem(V1_USER_ID_KEY)).toBeNull();
    expect(queryClient.getQueryData(v1Keys.profile())).toBeUndefined();
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('keeps the active identity and network error when a lost response is followed by successful auth', async () => {
    loseWithdrawalResponseAfterCommit = true;
    let authRequestCount = 0;
    server.use(http.get('*/api/v1/auth/me', () => {
      authRequestCount += 1;
      return HttpResponse.json({
        status: 'success',
        data: {
          user: { id: 'withdrawal-user', email: 'user@example.test', onboardingStatus: 'completed' },
          profile: { displayName: '테스트 사용자' },
        },
      });
    }));
    const { queryClient } = renderWithClient(<WithdrawalPageClient />);
    queryClient.setQueryData(v1Keys.profile(), { userId: 'withdrawal-user' });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '탈퇴 요청' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^탈퇴 요청$/ }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(requestCount).toBe(1);
    expect(withdrawalCommitted).toBe(true);
    expect(authRequestCount).toBe(1);
    expect(logoutRequestCount).toBe(0);
    expect(localStorage.getItem(V1_SESSION_HINT_KEY)).toBe('active');
    expect(localStorage.getItem(V1_USER_ID_KEY)).toBe('withdrawal-user');
    expect(queryClient.getQueryData(v1Keys.profile())).toEqual({ userId: 'withdrawal-user' });
    expect(documentNavigation.replace).not.toHaveBeenCalled();
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('bounds a stalled auth reconciliation and keeps identity when the outcome remains unknown', async () => {
    loseWithdrawalResponseAfterCommit = true;
    let authRequestCount = 0;
    let authSignal: AbortSignal | undefined;
    server.use(http.get('*/api/v1/auth/me', ({ request }) => {
      authRequestCount += 1;
      authSignal = request.signal;
      return new Promise<Response>(() => {});
    }));
    const { queryClient } = renderWithClient(<WithdrawalPageClient />);
    queryClient.setQueryData(v1Keys.profile(), { userId: 'withdrawal-user' });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '탈퇴 요청' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^탈퇴 요청$/ }));

    await screen.findByRole('alert', {}, { timeout: 2_500 });
    await waitFor(() => expect(screen.getByRole('button', { name: '탈퇴 요청' })).toBeEnabled(), { timeout: 3_000 });
    expect(requestCount).toBe(1);
    expect(withdrawalCommitted).toBe(true);
    expect(authRequestCount).toBe(1);
    expect(authSignal?.aborted).toBe(true);
    expect(logoutRequestCount).toBe(0);
    expect(localStorage.getItem(V1_SESSION_HINT_KEY)).toBe('active');
    expect(localStorage.getItem(V1_USER_ID_KEY)).toBe('withdrawal-user');
    expect(queryClient.getQueryData(v1Keys.profile())).toEqual({ userId: 'withdrawal-user' });
    expect(documentNavigation.replace).not.toHaveBeenCalled();
    expect(socket.disconnect).not.toHaveBeenCalled();
    await waitFor(() => expect(clientErrorPayloads).toContainEqual(
      expect.objectContaining({ level: 'warn', context: { flow: 'withdrawal-outcome-reconciliation' } }),
    ));
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
    expect(pushUnsubscribeRequestCount).toBe(0);
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(V1_SESSION_HINT_KEY)).toBeNull();
  });

  it('clears identity immediately, keeps withdrawal locked, and bounds navigation when browser cleanup stalls', async () => {
    let authRequestCount = 0;
    server.use(http.get('*/api/v1/auth/me', () => {
      authRequestCount += 1;
      if (authRequestCount > 1) {
        return HttpResponse.json({
          status: 'error', statusCode: 403, code: 'PERMISSION_DENIED', message: 'Account is not active', details: null,
        }, { status: 403 });
      }
      return HttpResponse.json({ status: 'success', data: {
        user: { id: 'withdrawal-user', email: 'user@example.test', onboardingStatus: 'completed' },
        profile: { displayName: '테스트 사용자' },
        verification: { emailVerified: true, phoneVerified: true },
        termsCompliance: { compliant: true, pendingRequiredDocumentIds: [], nextRoute: null },
      } });
    }));
    let releaseRegistration: ((registration: ServiceWorkerRegistration | undefined) => void) | null = null;
    let registrationLookupCount = 0;
    vi.stubGlobal('navigator', {
      serviceWorker: { getRegistration: vi.fn(() => {
        registrationLookupCount += 1;
        if (registrationLookupCount === 1) {
          return Promise.resolve({ pushManager: { getSubscription: vi.fn().mockResolvedValue(null) } });
        }
        return new Promise((resolve) => { releaseRegistration = resolve; });
      }) },
    });
    vi.stubGlobal('PushManager', class PushManager {});
    vi.stubGlobal('Notification', { permission: 'default' });
    const user = userEvent.setup();
    const { queryClient } = renderWithClient(<RequireAuth><WithdrawalPageClient /></RequireAuth>);
    queryClient.setQueryData(v1Keys.profile(), { userId: 'withdrawal-user' });

    await user.click(await screen.findByRole('button', { name: '탈퇴 요청' }));
    expect(authRequestCount).toBe(1);
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^탈퇴 요청$/ }));
    await waitFor(() => expect(navigator.serviceWorker.getRegistration).toHaveBeenCalledTimes(2));

    expect(localStorage.getItem(V1_SESSION_HINT_KEY)).toBeNull();
    expect(queryClient.getQueryData(v1Keys.profile())).toBeUndefined();
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '탈퇴 요청' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '탈퇴 요청' }));
    expect(requestCount).toBe(1);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 100)));
    expect(authRequestCount).toBe(1);
    expect(registrationLookupCount).toBe(2);
    expect(screen.queryByText('로그인 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.')).not.toBeInTheDocument();
    expect(documentNavigation.replace).not.toHaveBeenCalled();

    await waitFor(() => expect(documentNavigation.replace).toHaveBeenCalledWith('/login'), { timeout: 2000 });
    await waitFor(() => expect(clientErrorPayloads).toContainEqual(
      expect.objectContaining({ level: 'warn', context: { flow: 'withdrawal-push-unsubscribe-timeout' } }),
    ));
    await act(async () => {
      releaseRegistration?.(undefined);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(documentNavigation.replace).toHaveBeenCalledTimes(1);
    expect(clientErrorPayloads.filter((payload) => payload.context?.flow === 'withdrawal-push-unsubscribe-timeout')).toHaveLength(1);
  });

  it('reports stored-session cleanup failure but still clears socket/cache and navigates after server success', async () => {
    const originalRemoveItem = Storage.prototype.removeItem;
    const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key: string) {
      if (this === localStorage && key === V1_SESSION_HINT_KEY) {
        throw new DOMException('Storage is unavailable', 'SecurityError');
      }
      originalRemoveItem.call(this, key);
    });
    const user = userEvent.setup();
    const { queryClient } = renderWithClient(<WithdrawalPageClient />);
    queryClient.setQueryData(v1Keys.profile(), { userId: 'withdrawal-user' });

    await user.click(screen.getByRole('button', { name: '탈퇴 요청' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^탈퇴 요청$/ }));

    await waitFor(() => expect(documentNavigation.replace).toHaveBeenCalledWith('/login'));
    expect(requestCount).toBe(1);
    expect(removeItemSpy).toHaveBeenCalledWith(V1_SESSION_HINT_KEY);
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(v1Keys.profile())).toBeUndefined();
    expect(screen.queryByText('탈퇴 요청을 접수하지 못했어요')).not.toBeInTheDocument();
    await waitFor(() => expect(clientErrorPayloads).toContainEqual(
      expect.objectContaining({ level: 'warn', context: { flow: 'withdrawal-session-cleanup' } }),
    ));
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
    await waitFor(() => expect(clientErrorPayloads).toHaveLength(1));
    expect(clientErrorPayloads[0]).toMatchObject({ level: 'warn', context: { path: '/me/withdrawal-request', statusCode: 403 } });
  });
});
