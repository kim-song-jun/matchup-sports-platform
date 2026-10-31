import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as renderUi, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { readPendingSocialLink } from '@/lib/pending-social-link';
import { v1Keys } from '@/lib/query-keys';
import { V1_SESSION_HINT_KEY } from '@/lib/session-storage';
import { readWithdrawalCancel } from '@/lib/withdrawal-cancel-storage';
import { AppleLoginButton } from './apple-login-button';

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
const api = vi.hoisted(() => ({ v1Post: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  v1Post: api.v1Post,
}));

// 로그인 성공이 세션 캐시를 비우므로 QueryClient 아래에서 렌더한다.
let queryClient: QueryClient;
const render = (ui: ReactElement) => renderUi(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
const apiError = (statusCode: number, code: string, details?: Record<string, unknown>) =>
  new V1ApiError({ status: 'error', statusCode, code, message: '실패', details, timestamp: '2026-10-31T00:00:00.000Z' });

/** What the shell replies with; each test sets it before tapping. */
let reply: Record<string, unknown> = {};

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient();
  window.TeameetNative = {
    supports: ['sign-in-with-apple'],
    postMessage: vi.fn((message: string) => {
      const request = JSON.parse(message) as { requestId: string };
      window.dispatchEvent(new CustomEvent('teameet:native-apple-result', {
        detail: { requestId: request.requestId, ...reply },
      }));
    }),
  };
  api.v1Post.mockImplementation((path: string) =>
    path === '/auth/apple/nonce'
      ? Promise.resolve({ nonce: 'server-nonce' })
      : Promise.resolve({ session: { userId: 'u1', userEmail: null }, next: { route: '/home' } }));
});

afterEach(() => {
  delete window.TeameetNative;
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.pushState({}, '', '/');
});

describe('AppleLoginButton', () => {
  it('is not rendered where the shell does not offer the action', () => {
    delete window.TeameetNative;
    render(<AppleLoginButton />);
    expect(screen.queryByRole('button', { name: 'Apple로 계속하기' })).toBeNull();
  });

  it('signs in and lands on the route the server chose', async () => {
    reply = { ok: true, identityToken: 'identity.token', authorizationCode: 'auth.code', fullName: '김선준' };
    render(<AppleLoginButton />);

    await userEvent.click(screen.getByRole('button', { name: 'Apple로 계속하기' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/home'));
    expect(api.v1Post).toHaveBeenCalledWith('/auth/apple', {
      identityToken: 'identity.token',
      nonce: 'server-nonce',
      authorizationCode: 'auth.code',
      fullName: '김선준',
    });
  });

  it('records the session hint and drops the previous identity cache, so the app-wide gate sees the login', async () => {
    reply = { ok: true, identityToken: 'identity.token' };
    queryClient.setQueryData([...v1Keys.all, 'chat-rooms'], ['previous-user-room']);
    api.v1Post.mockImplementation((path: string) =>
      path === '/auth/apple/nonce'
        ? Promise.resolve({ nonce: 'server-nonce' })
        : Promise.resolve({ session: { userId: 'u1', userEmail: null }, next: { route: '/home' } }));
    render(<AppleLoginButton />);

    await userEvent.click(screen.getByRole('button', { name: 'Apple로 계속하기' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/home'));
    expect(window.localStorage.getItem(V1_SESSION_HINT_KEY)).toBe('active');
    expect(queryClient.getQueryData([...v1Keys.all, 'chat-rooms'])).toBeUndefined();
  });

  it('keeps the link token and opens the sign-in-then-link guide when the Apple account already has a Teameet account', async () => {
    reply = { ok: true, identityToken: 'identity.token' };
    window.history.pushState({}, '', '/login?redirect=%2Fteams%2Fnew');
    api.v1Post.mockImplementation((path: string) =>
      path === '/auth/apple/nonce'
        ? Promise.resolve({ nonce: 'server-nonce' })
        : Promise.reject(apiError(409, 'SOCIAL_LINK_CONTACT_CONFLICT', {
          next: 'sign_in_then_link', provider: 'apple', linkToken: 'apple-link-token', linkTokenExpiresInSeconds: 600,
        })));
    render(<AppleLoginButton />);

    await userEvent.click(screen.getByRole('button', { name: 'Apple로 계속하기' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/auth/account-conflict?provider=apple&redirect=%2Fteams%2Fnew'));
    expect(readPendingSocialLink()).toMatchObject({ linkToken: 'apple-link-token', provider: 'apple' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('sends a withdrawal-pending account to the cancel screen with its token', async () => {
    reply = { ok: true, identityToken: 'identity.token' };
    api.v1Post.mockImplementation((path: string) =>
      path === '/auth/apple/nonce'
        ? Promise.resolve({ nonce: 'server-nonce' })
        : Promise.reject(apiError(403, 'ACCOUNT_WITHDRAWAL_PENDING', { withdrawalCancelToken: 'withdrawal-token-1', expiresInSeconds: 600 })));
    render(<AppleLoginButton />);

    await userEvent.click(screen.getByRole('button', { name: 'Apple로 계속하기' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/auth/withdrawal-cancel'));
    expect(readWithdrawalCancel()).toMatchObject({ token: 'withdrawal-token-1' });
  });

  /** A shell built before the code was forwarded still signs in; the field is simply absent. */
  it('keeps the saved redirect while the server sends a new account to social terms', async () => {
    reply = { ok: true, identityToken: 'identity.token' };
    window.history.pushState({}, '', '/login?redirect=%2Fteams%2Fnew');
    api.v1Post.mockImplementation((path: string) =>
      path === '/auth/apple/nonce'
        ? Promise.resolve({ nonce: 'server-nonce' })
        : Promise.resolve({ session: { userId: 'u1', userEmail: null }, next: { route: '/terms?mode=social' } }));
    render(<AppleLoginButton />);

    await userEvent.click(screen.getByRole('button', { name: 'Apple로 계속하기' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/terms?mode=social'));
    expect(window.sessionStorage.getItem('teameet.v1.savedRedirect')).toBe('/teams/new');
  });

  it('omits the authorization code when the shell did not send one', async () => {
    reply = { ok: true, identityToken: 'identity.token' };
    render(<AppleLoginButton />);

    await userEvent.click(screen.getByRole('button', { name: 'Apple로 계속하기' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/home'));
    expect(api.v1Post).toHaveBeenCalledWith('/auth/apple', {
      identityToken: 'identity.token',
      nonce: 'server-nonce',
    });
  });

  // aria-busy opts out of the shared `.tm-btn:disabled:not([aria-busy='true']) > *` rule, which
  // would halve the mark and label again on top of the button's own dimming.
  it('marks itself busy while connecting and clears it afterwards', async () => {
    let releaseNonce!: (value: { nonce: string }) => void;
    api.v1Post.mockImplementationOnce(() => new Promise((resolve) => { releaseNonce = resolve; }));
    reply = { ok: false };
    render(<AppleLoginButton />);

    await userEvent.click(screen.getByRole('button', { name: 'Apple로 계속하기' }));

    const button = screen.getByRole('button', { name: 'Apple로 계속하기' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent('연결 중이에요…');

    releaseNonce({ nonce: 'server-nonce' });
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(button).not.toHaveAttribute('aria-busy');
  });

  it('says nothing when the reader closes the sheet', async () => {
    reply = { ok: false };
    render(<AppleLoginButton />);

    await userEvent.click(screen.getByRole('button', { name: 'Apple로 계속하기' }));

    await waitFor(() => expect(api.v1Post).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  // Without this the button just does nothing when the App ID has no Sign In with Apple
  // capability — the sheet dies with error 1000 and the reader is told nothing. A reviewer
  // meeting that reads it as a broken button.
  it('reports a failure the shell explains', async () => {
    reply = { ok: false, error: 'The operation couldn’t be completed. (com.apple.AuthenticationServices.AuthorizationError error 1000.)' };
    render(<AppleLoginButton />);

    await userEvent.click(screen.getByRole('button', { name: 'Apple로 계속하기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Apple 로그인에 실패했어요');
    expect(router.replace).not.toHaveBeenCalled();
  });
});
