import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LogoutButton } from './logout-button';

const router = vi.hoisted(() => ({
  replace: vi.fn(),
}));

const hooks = vi.hoisted(() => ({
  logoutMutate: vi.fn(),
}));

const analytics = vi.hoisted(() => ({
  trackEvent: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ removeQueries: vi.fn() }),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1Logout: () => ({ mutate: hooks.logoutMutate, isPending: false }),
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: analytics.trackEvent,
}));

describe('LogoutButton GA events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tracks a logout event before firing the logout mutation', () => {
    // Given
    render(<LogoutButton />);

    // When
    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));

    // Then
    expect(analytics.trackEvent).toHaveBeenCalledWith('logout', {});
    expect(hooks.logoutMutate).toHaveBeenCalled();
  });
});
