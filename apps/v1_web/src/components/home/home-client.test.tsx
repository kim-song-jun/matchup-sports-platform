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

function authMeResult(phoneVerified: boolean) {
  return {
    data: {
      user: { id: 'user-1', email: 'user@example.com', onboardingStatus: 'completed' },
      profile: { displayName: '테스터' },
      termsCompliance: { compliant: true, pendingRequiredDocumentIds: [], nextRoute: null },
      verification: { emailVerified: true, phoneVerified },
    },
    isError: false,
    isFetching: false,
    isSuccess: true,
    error: null,
    refetch: vi.fn(),
  };
}

// PendingSocialSignupGate (rendered above HomePageClient via Providers) also calls
// useV1AuthMe() unconditionally on every render — default to a fully-shaped,
// already-verified result so the unrelated push-nudge tests below don't crash it.
const authMeMock = vi.fn(() => authMeResult(true));
const phoneNudgeMocks = { shouldShow: vi.fn(), dismiss: vi.fn() };

vi.mock('@/hooks/use-v1-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-v1-api')>();
  return {
    ...actual,
    useV1Home: () => ({ data: homeData, isError: false, refetch: vi.fn() }),
    useV1ChatRooms: () => ({ data: { items: [] }, isPending: false, isError: false }),
    useV1PendingTournamentReviews: () => ({ data: undefined }),
    useV1AuthMe: () => authMeMock(),
  };
});

vi.mock('@/lib/session-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/session-storage')>();
  return {
    ...actual,
    shouldShowPushNudge: () => true,
    dismissPushNudge: vi.fn(),
    shouldShowPhoneVerifyNudge: () => phoneNudgeMocks.shouldShow(),
    dismissPhoneVerifyNudge: () => phoneNudgeMocks.dismiss(),
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

describe('HomePageClient phone verify nudge banner', () => {
  beforeEach(() => {
    phoneNudgeMocks.shouldShow.mockReset().mockReturnValue(true);
    phoneNudgeMocks.dismiss.mockReset();
    authMeMock.mockReset().mockReturnValue(authMeResult(false));
  });

  it('shows the banner when the account has not completed phone verification and the nudge was not dismissed', async () => {
    render(
      <Providers>
        <HomePageClient />
      </Providers>,
    );

    expect(await screen.findByText('휴대폰 본인인증이 필요해요')).toBeInTheDocument();
  });

  it('hides the banner once the account has completed phone verification', async () => {
    authMeMock.mockReturnValue(authMeResult(true));

    render(
      <Providers>
        <HomePageClient />
      </Providers>,
    );

    await screen.findByText('안녕하세요, 테스터님');
    expect(screen.queryByText('휴대폰 본인인증이 필요해요')).not.toBeInTheDocument();
  });

  it('hides the banner once the user has dismissed it for the session', async () => {
    phoneNudgeMocks.shouldShow.mockReturnValue(false);

    render(
      <Providers>
        <HomePageClient />
      </Providers>,
    );

    await screen.findByText('안녕하세요, 테스터님');
    expect(screen.queryByText('휴대폰 본인인증이 필요해요')).not.toBeInTheDocument();
  });
});
