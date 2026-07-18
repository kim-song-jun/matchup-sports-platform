import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailLoginClient } from './email-login-client';
import { V1ApiError } from '@/lib/api-client';

const router = vi.hoisted(() => ({
  replace: vi.fn(),
}));

const hooks = vi.hoisted(() => ({
  loginMutate: vi.fn(),
}));

const analytics = vi.hoisted(() => ({
  trackEvent: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1EmailLogin: () => ({ mutate: hooks.loginMutate, isPending: false }),
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: analytics.trackEvent,
}));

type LoginCallbacks = {
  readonly onSuccess?: (result: { readonly session: { readonly userId: string; readonly userEmail: string | null } }) => void;
  readonly onError?: (error: unknown) => void;
  readonly onSettled?: () => void;
};

async function submitLogin(email: string, password: string): Promise<void> {
  fireEvent.change(screen.getByLabelText('이메일'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: '로그인' }));
}

describe('EmailLoginClient GA events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tracks a login event with method=email on successful sign-in', async () => {
    // Given
    hooks.loginMutate.mockImplementation((_body: unknown, callbacks: LoginCallbacks) =>
      callbacks.onSuccess?.({ session: { userId: 'user-1', userEmail: 'me@example.com' } }),
    );
    render(<EmailLoginClient />);

    // When
    await submitLogin('me@example.com', 'password123');

    // Then
    await waitFor(() => expect(analytics.trackEvent).toHaveBeenCalledWith('login', { method: 'email' }));
  });

  it('tracks a login_failed event carrying the API error code as reason', async () => {
    // Given
    hooks.loginMutate.mockImplementation((_body: unknown, callbacks: LoginCallbacks) =>
      callbacks.onError?.(
        new V1ApiError({
          status: 'error',
          statusCode: 401,
          code: 'UNAUTHENTICATED',
          message: 'invalid credentials',
          timestamp: new Date().toISOString(),
        }),
      ),
    );
    render(<EmailLoginClient />);

    // When
    await submitLogin('me@example.com', 'wrongpass');

    // Then
    await waitFor(() =>
      expect(analytics.trackEvent).toHaveBeenCalledWith('login_failed', { method: 'email', reason: 'UNAUTHENTICATED' }),
    );
  });
});
