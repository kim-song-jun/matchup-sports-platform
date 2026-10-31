import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { v1Keys } from '@/lib/query-keys';
import { V1_SESSION_HINT_KEY } from '@/lib/session-storage';
import type { V1AuthSessionResponse } from '@/types/api';
import { completeEmailLogin, completeSignIn } from './email-login-completion';

const analytics = vi.hoisted(() => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ trackEvent: analytics.trackEvent }));

function sessionResult(next?: { route: string }): V1AuthSessionResponse {
  return {
    user: { id: 'user-1', email: 'user@example.test', onboardingStatus: 'completed' },
    profile: { displayName: '테스트' },
    session: { userId: 'user-1', userEmail: 'user@example.test' },
    ...(next ? { next } : {}),
  } as V1AuthSessionResponse;
}

function seededClient() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(v1Keys.profile(), { userId: 'previous-identity' });
  return queryClient;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('completeSignIn', () => {
  it('stores the session hint, drops the previous identity, reports the login method and returns the destination', () => {
    const queryClient = seededClient();

    const destination = completeSignIn({
      result: sessionResult(),
      queryClient,
      requestedRedirect: '/matches/42',
      method: 'kakao',
    });

    expect(window.localStorage.getItem(V1_SESSION_HINT_KEY)).toBe('active');
    expect(queryClient.getQueryCache().findAll({ queryKey: v1Keys.all })).toHaveLength(0);
    expect(analytics.trackEvent).toHaveBeenCalledWith('login', { method: 'kakao' });
    expect(destination).toBe('/matches/42');
  });

  it('prefers the route the server asks for', () => {
    expect(completeSignIn({
      result: sessionResult({ route: '/onboarding/region' }),
      queryClient: seededClient(),
      requestedRedirect: '/matches/42',
      method: 'email',
    })).toMatch(/^\/onboarding\/region/);
  });

  it('never returns another origin as the destination', () => {
    expect(completeSignIn({
      result: sessionResult(),
      queryClient: seededClient(),
      requestedRedirect: 'https://evil.example/phish',
      method: 'email',
    })).toBe('/home');
  });
});

describe('completeEmailLogin', () => {
  it('navigates to the destination with the email login event', () => {
    const replace = vi.fn();

    completeEmailLogin({ result: sessionResult(), queryClient: seededClient(), replace, requestedRedirect: '/teams/7' });

    expect(replace).toHaveBeenCalledWith('/teams/7');
    expect(analytics.trackEvent).toHaveBeenCalledWith('login', { method: 'email' });
  });
});
