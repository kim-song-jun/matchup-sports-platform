import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/app/providers';
import { HomePageClient } from './home-client';

vi.mock('next/navigation', () => ({
  usePathname: () => '/home',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
  getGaMeasurementId: () => undefined,
}));

const homeData = {
  viewer: { authenticated: true, onboardingStatus: 'completed', displayName: '테스터' },
};

vi.mock('@/hooks/use-v1-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-v1-api')>();
  return {
    ...actual,
    useV1Home: () => ({ data: homeData, isError: false, refetch: vi.fn() }),
    useV1ChatRooms: () => ({ data: { items: [] }, isPending: false, isError: false }),
    useV1PendingTournamentReviews: () => ({ data: undefined }),
  };
});

vi.mock('@/lib/session-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/session-storage')>();
  return {
    ...actual,
    shouldShowPushNudge: () => true,
    dismissPushNudge: vi.fn(),
  };
});

const subscribe = vi.fn();
vi.mock('@/hooks/use-v1-push-registration', () => ({
  useV1PushRegistration: () => ({
    subscribe,
    unsubscribe: vi.fn(),
    permission: 'default',
    isSubscribed: false,
  }),
}));

describe('HomePageClient push nudge banner', () => {
  beforeEach(() => {
    subscribe.mockReset();
  });

  it('dismisses the banner only after a confirmed subscription', async () => {
    subscribe.mockResolvedValue(true);

    render(
      <Providers>
        <HomePageClient />
      </Providers>,
    );

    const subscribeButton = await screen.findByRole('button', { name: '알림 받기' });
    fireEvent.click(subscribeButton);

    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('알림을 받아보세요')).not.toBeInTheDocument());
  });

  it('keeps the banner visible for retry when subscribe resolves without a confirmed subscription', async () => {
    subscribe.mockResolvedValue(false);

    render(
      <Providers>
        <HomePageClient />
      </Providers>,
    );

    const subscribeButton = await screen.findByRole('button', { name: '알림 받기' });
    fireEvent.click(subscribeButton);

    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1));
    // subscribe() resolved (it never rejects, even on decline/failure) but did not
    // confirm a subscription — the banner must stay so the user can retry, not
    // silently disappear as if the attempt had succeeded.
    expect(await screen.findByText('알림을 받아보세요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '알림 받기' })).not.toBeDisabled();
  });
});
