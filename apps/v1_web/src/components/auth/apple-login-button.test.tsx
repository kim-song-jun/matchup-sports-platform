import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppleLoginButton } from './apple-login-button';

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
const api = vi.hoisted(() => ({ v1Post: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/api-client', () => ({ v1Post: api.v1Post }));

/** What the shell replies with; each test sets it before tapping. */
let reply: Record<string, unknown> = {};

beforeEach(() => {
  vi.clearAllMocks();
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
      : Promise.resolve({ next: { route: '/home' } }));
});

afterEach(() => {
  delete window.TeameetNative;
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

  /** A shell built before the code was forwarded still signs in; the field is simply absent. */
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
