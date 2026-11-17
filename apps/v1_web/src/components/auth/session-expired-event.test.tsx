import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { v1Keys } from '@/lib/query-keys';
import { hasStoredV1Session, saveStoredV1Session } from '@/lib/session-storage';
import { server } from '@/test/msw/server';
import { LogoutButton } from './logout-button';
import { PendingSocialSignupGate } from './pending-social-signup-gate';
import { RequireAuth } from './require-auth';
import { SessionEntryGate } from './session-entry-gate';

const mocks = vi.hoisted(() => ({
  trackEvent: vi.fn(),
  replace: vi.fn(),
  disconnectV1Socket: vi.fn(),
}));

vi.mock('@/lib/analytics', () => ({ trackEvent: mocks.trackEvent }));
vi.mock('@/lib/v1-socket', () => ({ disconnectV1Socket: mocks.disconnectV1Socket }));
// The push hook talks to the native shell and the Push API, which jsdom does not have.
vi.mock('@/hooks/use-v1-push-registration', () => ({ useV1PushRegistration: () => ({ unsubscribe: async () => true }) }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/my',
  useRouter: () => ({ replace: mocks.replace }),
}));

function answerAuthMe(statusCode: number, code: string) {
  server.use(http.get('*/api/v1/auth/me', () => HttpResponse.json({
    status: 'error',
    statusCode,
    code,
    message: code,
    details: null,
    requestId: 'session-expired-event-test',
    timestamp: new Date().toISOString(),
  }, { status: statusCode })));
}

function renderWithQuery(ui: ReactNode) {
  // retryDelay 0 keeps the 5xx retries of `retryTransientFailure` from slowing the test down.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  const view = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  return { ...view, queryClient };
}

// A protected page behind the app-wide gate, the way `providers.tsx` and a route wrap it.
function ProtectedPageInAppTree() {
  return (
    <PendingSocialSignupGate>
      <RequireAuth><div>마이페이지</div></RequireAuth>
    </PendingSocialSignupGate>
  );
}

const expiredEvents = () => mocks.trackEvent.mock.calls.filter(([name]) => name === 'session_expired');

async function letLateEffectsRun() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
}

describe('session_expired event wherever a 401 clears the sign-in hint', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());

  beforeEach(() => {
    mocks.trackEvent.mockReset();
    mocks.replace.mockReset();
    mocks.disconnectV1Socket.mockReset();
    window.localStorage.clear();
    vi.stubGlobal('location', { ...window.location, replace: vi.fn() });
    // Failures on /auth/me are reported to this endpoint; the 4xx/5xx cases below trigger it.
    server.use(http.post('*/api/v1/logs/client-error', () => HttpResponse.json({ ok: true })));
  });

  afterEach(() => {
    server.resetHandlers();
    window.localStorage.clear();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe('RequireAuth on its own', () => {
    it('sends it once, naming itself, when the browser held the sign-in hint and the server answers 401', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      saveStoredV1Session({ userId: 'user-1' });
      answerAuthMe(401, 'UNAUTHENTICATED');

      renderWithQuery(<RequireAuth><div>마이페이지</div></RequireAuth>);

      await waitFor(() => expect(window.location.replace).toHaveBeenCalledTimes(1));
      await letLateEffectsRun();
      expect(expiredEvents()).toEqual([['session_expired', { gate: 'require_auth', app_shell: 'web' }]]);
      expect(hasStoredV1Session()).toBe(false);
    });

    it('sends nothing for a visitor who never signed in, even though production probes them too', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      answerAuthMe(401, 'UNAUTHENTICATED');

      renderWithQuery(<RequireAuth><div>마이페이지</div></RequireAuth>);

      await waitFor(() => expect(window.location.replace).toHaveBeenCalledTimes(1));
      await letLateEffectsRun();
      expect(expiredEvents()).toEqual([]);
    });

    it.each([
      ['a server outage (503)', 503, 'SERVICE_UNAVAILABLE'],
      ['a terms re-consent requirement (403)', 403, 'TERMS_RECONSENT_REQUIRED'],
    ])('sends nothing and keeps the hint on %s', async (_label, statusCode, code) => {
      vi.stubEnv('NODE_ENV', 'production');
      saveStoredV1Session({ userId: 'user-1' });
      answerAuthMe(statusCode, code);

      renderWithQuery(<RequireAuth><div>마이페이지</div></RequireAuth>);

      expect(await screen.findByText('로그인 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
      await letLateEffectsRun();
      expect(expiredEvents()).toEqual([]);
      expect(hasStoredV1Session()).toBe(true);
    });
  });

  describe('a protected page inside the app-wide gate', () => {
    it('counts a fresh entry once, at the app-wide gate, and the page behind it adds nothing', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      saveStoredV1Session({ userId: 'user-1' });
      answerAuthMe(401, 'UNAUTHENTICATED');

      renderWithQuery(<ProtectedPageInAppTree />);

      // The page's own gate still sends the visitor to the login screen after the app gate acted.
      await waitFor(() => expect(window.location.replace).toHaveBeenCalledTimes(1));
      await letLateEffectsRun();
      expect(expiredEvents()).toEqual([['session_expired', { gate: 'app_gate', app_shell: 'web' }]]);
      expect(hasStoredV1Session()).toBe(false);
    });

    // Both gates watch the same query and both clear the hint on a 401. Which of them reads the
    // hint first is up to the order React runs their effects in, so only the count is pinned.
    it('counts an expiry that happens while the user navigates inside the app once, though both gates see it', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      saveStoredV1Session({ userId: 'user-1' });

      const { queryClient } = renderWithQuery(<ProtectedPageInAppTree />);
      expect(await screen.findByText('마이페이지')).toBeInTheDocument();
      expect(expiredEvents()).toEqual([]);

      answerAuthMe(401, 'UNAUTHENTICATED');
      await act(async () => { await queryClient.invalidateQueries({ queryKey: v1Keys.authMe() }); });

      await waitFor(() => expect(window.location.replace).toHaveBeenCalledTimes(1));
      await letLateEffectsRun();
      expect(expiredEvents()).toEqual([
        ['session_expired', { gate: expect.stringMatching(/^(app_gate|require_auth)$/), app_shell: 'web' }],
      ]);
      expect(hasStoredV1Session()).toBe(false);
    });

    // Signing out removes the cached identity, so the gates probe again and get the 401 the server
    // now gives. The hint is already off by then, so that answer must not read as an expiry.
    it('sends nothing for the 401 that follows the user signing out on purpose', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      saveStoredV1Session({ userId: 'user-1' });
      server.use(http.post('*/api/v1/auth/logout', () => HttpResponse.json({ status: 'success', data: { ok: true }, timestamp: new Date().toISOString() })));

      renderWithQuery(
        <PendingSocialSignupGate>
          <RequireAuth><LogoutButton /></RequireAuth>
        </PendingSocialSignupGate>,
      );
      fireEvent.click(await screen.findByRole('button', { name: '로그아웃' }));
      answerAuthMe(401, 'UNAUTHENTICATED');

      await waitFor(() => expect(window.location.replace).toHaveBeenCalledWith('/login'));
      await letLateEffectsRun();
      expect(hasStoredV1Session()).toBe(false);
      expect(expiredEvents()).toEqual([]);
    });
  });

  describe('SessionEntryGate', () => {
    it('sends it once when the browser held the sign-in hint and the server answers 401', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      saveStoredV1Session({ userId: 'user-1' });
      answerAuthMe(401, 'UNAUTHENTICATED');

      renderWithQuery(<SessionEntryGate mode="login"><div>로그인 선택</div></SessionEntryGate>);

      expect(await screen.findByText('로그인 선택')).toBeInTheDocument();
      await waitFor(() => expect(hasStoredV1Session()).toBe(false));
      await letLateEffectsRun();
      expect(expiredEvents()).toEqual([['session_expired', { gate: 'entry_gate', app_shell: 'web' }]]);
    });

    it('sends nothing for a visitor who never signed in', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      answerAuthMe(401, 'UNAUTHENTICATED');

      renderWithQuery(<SessionEntryGate mode="login"><div>로그인 선택</div></SessionEntryGate>);

      expect(await screen.findByText('로그인 선택')).toBeInTheDocument();
      await waitFor(() => expect(mocks.disconnectV1Socket).toHaveBeenCalledTimes(1));
      expect(expiredEvents()).toEqual([]);
    });

    it('sends nothing for an inactive account (403), which clears the hint but is not an expiry', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      saveStoredV1Session({ userId: 'user-1' });
      answerAuthMe(403, 'PERMISSION_DENIED');

      renderWithQuery(<SessionEntryGate mode="login"><div>로그인 선택</div></SessionEntryGate>);

      expect(await screen.findByText('로그인 선택')).toBeInTheDocument();
      await waitFor(() => expect(hasStoredV1Session()).toBe(false));
      expect(expiredEvents()).toEqual([]);
    });

    it('sends nothing and keeps the hint on a server outage (503)', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      saveStoredV1Session({ userId: 'user-1' });
      answerAuthMe(503, 'SERVICE_UNAVAILABLE');

      renderWithQuery(<SessionEntryGate mode="login"><div>로그인 선택</div></SessionEntryGate>);

      expect(await screen.findByText('로그인 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
      expect(expiredEvents()).toEqual([]);
      expect(hasStoredV1Session()).toBe(true);
    });
  });
});
