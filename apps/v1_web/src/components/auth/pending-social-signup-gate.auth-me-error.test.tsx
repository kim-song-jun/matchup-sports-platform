import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearV1IdentityCache } from '@/lib/query-keys';
import { createV1QueryClient } from '@/lib/query-client';
import { saveStoredV1Session } from '@/lib/session-storage';
import { PendingSocialSignupGate } from './pending-social-signup-gate';
import { RequireAuth } from './require-auth';
import { SessionEntryGate } from './session-entry-gate';

const mocks = vi.hoisted(() => ({
  pathname: '/my',
  replace: vi.fn(),
  replaceDocument: vi.fn(),
  trackEvent: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock('@/lib/navigation-history', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/navigation-history')>(),
  replaceDocument: mocks.replaceDocument,
}));
vi.mock('@/lib/analytics', () => ({ trackEvent: mocks.trackEvent }));
vi.mock('@/lib/v1-socket', () => ({ disconnectV1Socket: vi.fn() }));
vi.mock('@/lib/client-error-reporter', () => ({ reportClientError: vi.fn() }));

const ERROR_MESSAGE = '로그인 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.';
const CHECKING_MESSAGE = '로그인 정보를 확인하고 있어요.';
// 1 request from the gate (retry off) + 1 first try and 2 retries from the page's own observer.
const REQUESTS_PER_ROUND = 4;

type MeAnswer = 'unavailable' | 'bad-gateway-html' | 'rate-limited' | 'unauthenticated' | 'signed-in' | 'terms-pending' | 'hang';

let answer: MeAnswer;
let meRequests: number;

function respond(): Promise<Response> {
  meRequests += 1;
  const error = (statusCode: number, code: string) => new Response(JSON.stringify({
    status: 'error', statusCode, code, message: code, details: null, requestId: 'r', timestamp: 't',
  }), { status: statusCode, headers: { 'content-type': 'application/json' } });
  switch (answer) {
    case 'unavailable': return Promise.resolve(error(503, 'SERVICE_UNAVAILABLE'));
    case 'rate-limited': return Promise.resolve(error(429, 'RATE_LIMITED'));
    case 'unauthenticated': return Promise.resolve(error(401, 'UNAUTHENTICATED'));
    case 'bad-gateway-html': return Promise.resolve(new Response('<html>Bad Gateway</html>', { status: 502 }));
    case 'hang': return new Promise<Response>(() => {});
    case 'signed-in':
    case 'terms-pending':
      return Promise.resolve(new Response(JSON.stringify({
        status: 'success',
        data: {
          user: { id: 'u1', onboardingStatus: 'completed' },
          termsCompliance: { compliant: answer === 'signed-in', pendingRequiredDocumentIds: [], nextRoute: null },
        },
        timestamp: 't',
      }), { status: 200, headers: { 'content-type': 'application/json' } }));
  }
}

async function passSeconds(seconds: number) {
  for (let s = 0; s < seconds; s += 1) {
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  }
}

function renderTree(ui: ReactNode) {
  const queryClient = createV1QueryClient();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <PendingSocialSignupGate>{ui}</PendingSocialSignupGate>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

const protectedPage = <RequireAuth><div>마이페이지</div></RequireAuth>;
const loginPage = <SessionEntryGate mode="login"><div>로그인 폼</div></SessionEntryGate>;
const rootPage = <SessionEntryGate mode="root"><div>루트</div></SessionEntryGate>;
const expiredEvents = () => mocks.trackEvent.mock.calls.filter(([name]) => name === 'session_expired');

describe('app gate when /auth/me keeps failing for a browser that holds the sign-in hint', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubGlobal('location', { ...window.location, replace: vi.fn() });
    saveStoredV1Session({ userId: 'user-1' });
    mocks.pathname = '/my';
    mocks.replace.mockReset();
    mocks.replaceDocument.mockReset();
    mocks.trackEvent.mockReset();
    meRequests = 0;
    answer = 'unavailable';
    vi.stubGlobal('fetch', vi.fn((input: unknown) => {
      if (String(input).includes('/auth/me')) return respond();
      return Promise.resolve(new Response('{}', { status: 404 }));
    }));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it.each<[string, MeAnswer]>([
    ['503', 'unavailable'],
    ['502 with an HTML body', 'bad-gateway-html'],
    ['429', 'rate-limited'],
  ])('stops asking after the retry policy and shows the error state on a protected page (%s)', async (_label, kind) => {
    answer = kind;
    renderTree(protectedPage);

    await passSeconds(10);
    const settled = meRequests;
    expect(settled).toBeGreaterThan(0);
    expect(settled).toBeLessThanOrEqual(REQUESTS_PER_ROUND);

    await passSeconds(20);
    expect(meRequests).toBe(settled);
    expect(screen.getByText(ERROR_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도하기' })).toBeInTheDocument();
    expect(screen.queryByText(CHECKING_MESSAGE)).not.toBeInTheDocument();
  });

  it.each([
    ['the login page', loginPage],
    ['the root entry page', rootPage],
  ])('stops asking and settles on the entry gate error state on %s', async (_label, page) => {
    mocks.pathname = '/login';
    renderTree(page);

    await passSeconds(10);
    const settled = meRequests;
    expect(settled).toBeLessThanOrEqual(REQUESTS_PER_ROUND);

    await passSeconds(20);
    expect(meRequests).toBe(settled);
    expect(screen.getByText(ERROR_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도하기' })).toBeInTheDocument();
  });

  it('asks again only when the retry button is pressed, then stops again', async () => {
    renderTree(protectedPage);
    await passSeconds(10);
    const afterFirstRound = meRequests;

    await passSeconds(20);
    expect(meRequests).toBe(afterFirstRound);

    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    await passSeconds(10);
    const afterPress = meRequests;
    expect(afterPress).toBeGreaterThan(afterFirstRound);

    await passSeconds(20);
    expect(meRequests).toBe(afterPress);
    expect(screen.getByRole('button', { name: '다시 시도하기' })).toBeInTheDocument();
  });

  it('still sends a user whose terms need renewal when a later ask answers 200 after earlier errors', async () => {
    renderTree(protectedPage);
    await passSeconds(10);
    expect(screen.getByText(ERROR_MESSAGE)).toBeInTheDocument();

    answer = 'terms-pending';
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    await passSeconds(3);

    expect(mocks.replace).toHaveBeenCalledWith('/terms?mode=renewal&redirect=%2Fmy');
    expect(screen.queryByText('마이페이지')).not.toBeInTheDocument();
  });

  it('shows the page once a later ask answers 200 for a compliant account', async () => {
    renderTree(protectedPage);
    await passSeconds(10);

    answer = 'signed-in';
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    await passSeconds(3);

    expect(screen.getByText('마이페이지')).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('keeps the checking screen, without the page, until the first answer arrives', async () => {
    answer = 'hang';
    renderTree(protectedPage);
    await passSeconds(5);

    expect(screen.getByText(CHECKING_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText('마이페이지')).not.toBeInTheDocument();
    expect(meRequests).toBe(1);
  });

  it('on 401 clears the hint, sends session_expired once and does not keep asking', async () => {
    answer = 'unauthenticated';
    renderTree(protectedPage);
    await passSeconds(10);

    expect(expiredEvents()).toEqual([['session_expired', expect.objectContaining({ gate: expect.any(String) })]]);
    expect(window.localStorage.getItem('teameet.v1.session')).toBeNull();
    expect(mocks.replaceDocument).toHaveBeenCalled();
    const settled = meRequests;
    await passSeconds(20);
    expect(meRequests).toBe(settled);
    expect(expiredEvents()).toHaveLength(1);
  });

  it('waits for the first answer again when another account signs in after a failed one', async () => {
    const { queryClient, rerender } = renderTree(protectedPage);
    await passSeconds(10);
    expect(screen.getByText(ERROR_MESSAGE)).toBeInTheDocument();

    // Sign-out: hint and identity cache are cleared, the browser lands on /login.
    window.localStorage.clear();
    act(() => { clearV1IdentityCache(queryClient); });
    mocks.pathname = '/login';
    rerender(
      <QueryClientProvider client={queryClient}>
        <PendingSocialSignupGate><div>로그인 폼</div></PendingSocialSignupGate>
      </QueryClientProvider>,
    );

    // Another account signs in and opens a protected page; its first answer is still on the way.
    answer = 'hang';
    saveStoredV1Session({ userId: 'user-2' });
    mocks.pathname = '/my';
    rerender(
      <QueryClientProvider client={queryClient}>
        <PendingSocialSignupGate><RequireAuth key="second"><div>마이페이지</div></RequireAuth></PendingSocialSignupGate>
      </QueryClientProvider>,
    );
    await passSeconds(5);

    expect(screen.getByText(CHECKING_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(ERROR_MESSAGE)).not.toBeInTheDocument();
    expect(screen.queryByText('마이페이지')).not.toBeInTheDocument();
  });
});
