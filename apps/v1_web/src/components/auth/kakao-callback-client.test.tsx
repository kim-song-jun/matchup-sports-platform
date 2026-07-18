import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KakaoCallbackClient } from './kakao-callback-client';
import { KAKAO_OAUTH_STATE_STORAGE_KEY } from './auth.view-model';
import { V1ApiError } from '@/lib/api-client';

const router = vi.hoisted(() => ({
  replace: vi.fn(),
}));

const analytics = vi.hoisted(() => ({
  trackEvent: vi.fn(),
}));

const api = vi.hoisted(() => ({
  v1Post: vi.fn(),
}));

let searchParamsValue = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => searchParamsValue,
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: analytics.trackEvent,
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, v1Post: api.v1Post };
});

function primeValidOAuthState() {
  window.sessionStorage.setItem(KAKAO_OAUTH_STATE_STORAGE_KEY, 'state-123');
  searchParamsValue = new URLSearchParams({ code: 'auth-code', state: 'state-123' });
}

describe('KakaoCallbackClient GA events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    searchParamsValue = new URLSearchParams();
  });

  it('tracks sign_up_start when the API routes a brand-new kakao user to social terms', async () => {
    // Given
    primeValidOAuthState();
    api.v1Post.mockResolvedValue({
      session: { userId: 'new-user', userEmail: null },
      next: { route: '/terms?mode=social', reason: 'social_terms_required' },
    });

    // When
    render(<KakaoCallbackClient />);

    // Then
    await waitFor(() => expect(analytics.trackEvent).toHaveBeenCalledWith('sign_up_start', { method: 'kakao' }));
    expect(analytics.trackEvent).not.toHaveBeenCalledWith('login', expect.anything());
    expect(router.replace).toHaveBeenCalledWith('/terms?mode=social');
  });

  it('tracks login when the API routes a returning kakao user straight into the app', async () => {
    // Given
    primeValidOAuthState();
    api.v1Post.mockResolvedValue({
      session: { userId: 'existing-user', userEmail: 'existing@example.com' },
      next: { route: '/home', reason: 'ready' },
    });

    // When
    render(<KakaoCallbackClient />);

    // Then
    await waitFor(() => expect(analytics.trackEvent).toHaveBeenCalledWith('login', { method: 'kakao' }));
    expect(analytics.trackEvent).not.toHaveBeenCalledWith('sign_up_start', expect.anything());
  });

  it('tracks login_failed with the API error code when the kakao exchange fails', async () => {
    // Given
    primeValidOAuthState();
    api.v1Post.mockRejectedValue(
      new V1ApiError({
        status: 'error',
        statusCode: 400,
        code: 'OAUTH_NOT_CONFIGURED',
        message: 'kakao oauth not configured',
        timestamp: new Date().toISOString(),
      }),
    );

    // When
    render(<KakaoCallbackClient />);

    // Then
    await waitFor(() => screen.getByText('카카오 로그인 설정이 아직 완료되지 않았어요.'));
    expect(analytics.trackEvent).toHaveBeenCalledWith('login_failed', { method: 'kakao', reason: 'OAUTH_NOT_CONFIGURED' });
  });

  it('tracks login_failed with invalid_state before ever calling the API', async () => {
    // Given: state stored locally does not match the state kakao returned (CSRF guard)
    window.sessionStorage.setItem(KAKAO_OAUTH_STATE_STORAGE_KEY, 'stored-state');
    searchParamsValue = new URLSearchParams({ code: 'auth-code', state: 'mismatched-state' });

    // When
    render(<KakaoCallbackClient />);

    // Then
    await waitFor(() => expect(analytics.trackEvent).toHaveBeenCalledWith('login_failed', { method: 'kakao', reason: 'invalid_state' }));
    expect(api.v1Post).not.toHaveBeenCalled();
  });
});
