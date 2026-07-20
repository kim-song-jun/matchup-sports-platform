import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingClient } from './onboarding-client';
import { useV1PushRegistration } from '@/hooks/use-v1-push-registration';

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

const hooks = vi.hoisted(() => ({
  savePreferencesMutate: vi.fn(),
  completeOnboardingMutate: vi.fn(),
  deferOnboardingMutate: vi.fn(),
  resolveLocationMutate: vi.fn(),
}));

const analytics = vi.hoisted(() => ({
  trackEvent: vi.fn(),
}));

const FUTSAL_SPORT_ID = '22222222-2222-4222-8222-222222222222';

const sportsFixture = [
  { id: FUTSAL_SPORT_ID, code: 'futsal', name: '풋살', levels: [{ id: '33333333-3333-4333-8333-333333333333', name: '초급' }] },
];

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1Onboarding: () => ({ data: { sports: [], regions: [] }, isLoading: false, isError: false, refetch: vi.fn() }),
  useV1MasterSports: () => ({ data: sportsFixture, isLoading: false, isError: false, refetch: vi.fn() }),
  useV1MasterRegions: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useV1SaveOnboardingPreferences: () => ({ mutate: hooks.savePreferencesMutate, isPending: false }),
  useV1CompleteOnboarding: () => ({ mutate: hooks.completeOnboardingMutate, isPending: false }),
  useV1DeferOnboarding: () => ({ mutate: hooks.deferOnboardingMutate, isPending: false }),
  useV1ResolveLocation: () => ({ mutate: hooks.resolveLocationMutate, isPending: false }),
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: analytics.trackEvent,
}));

vi.mock('@/hooks/use-v1-push-registration', () => ({
  useV1PushRegistration: vi.fn(),
}));

type SaveCallbacks = { readonly onSuccess: () => void; readonly onError: (error: unknown) => void };
type CompleteCallbacks = {
  readonly onSuccess: (result: { readonly next?: { readonly route: string } }) => void;
  readonly onError: (error: unknown) => void;
};

describe('OnboardingClient GA events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    hooks.savePreferencesMutate.mockImplementation((_body: unknown, callbacks: SaveCallbacks) => callbacks.onSuccess());
    hooks.completeOnboardingMutate.mockImplementation((_arg: unknown, callbacks: CompleteCallbacks) =>
      callbacks.onSuccess({ next: { route: '/home' } }),
    );
    vi.mocked(useV1PushRegistration).mockReturnValue({
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      permission: 'default',
      isSubscribed: false,
    });
  });

  it('tracks onboarding_step_complete with the selected sport code on the sport step', async () => {
    // Given
    render(<OnboardingClient step="sport" />);
    fireEvent.click(screen.getByRole('button', { name: /풋살/ }));

    // When
    fireEvent.click(screen.getByRole('button', { name: '실력 입력하기' }));

    // Then
    await waitFor(() =>
      expect(analytics.trackEvent).toHaveBeenCalledWith('onboarding_step_complete', { step: 'sport', sportType: 'futsal' }),
    );
  });

  it('tracks onboarding_complete without a sportType when the confirm step finishes', async () => {
    // Given: a sport is already saved to the draft so the confirm CTA isn't disabled
    window.sessionStorage.setItem(
      'teameet.v1.onboardingDraft',
      JSON.stringify({ sports: [{ sportId: FUTSAL_SPORT_ID, levelId: null }], regions: [] }),
    );
    render(<OnboardingClient step="confirm" />);

    // When
    fireEvent.click(screen.getByRole('button', { name: '홈으로 시작하기' }));

    // Then
    await waitFor(() => expect(analytics.trackEvent).toHaveBeenCalledWith('onboarding_complete', {}));
  });

  it('does NOT trigger a push subscription automatically when onboarding completes', async () => {
    // Regression guard: subscribe() must only fire from an explicit user gesture
    // (the 알림 받기 button), never as a side effect of completing onboarding —
    // mirrors the LocationNotice pattern for the geolocation prompt.
    const subscribe = vi.fn();
    vi.mocked(useV1PushRegistration).mockReturnValue({
      subscribe,
      unsubscribe: vi.fn(),
      permission: 'default',
      isSubscribed: false,
    });
    window.sessionStorage.setItem(
      'teameet.v1.onboardingDraft',
      JSON.stringify({ sports: [{ sportId: FUTSAL_SPORT_ID, levelId: null }], regions: [] }),
    );
    render(<OnboardingClient step="confirm" />);

    fireEvent.click(screen.getByRole('button', { name: '홈으로 시작하기' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/home'));
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('renders a 알림 받기 button on the confirm step that triggers subscribe() via explicit click', async () => {
    const subscribe = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useV1PushRegistration).mockReturnValue({
      subscribe,
      unsubscribe: vi.fn(),
      permission: 'default',
      isSubscribed: false,
    });
    window.sessionStorage.setItem(
      'teameet.v1.onboardingDraft',
      JSON.stringify({ sports: [{ sportId: FUTSAL_SPORT_ID, levelId: null }], regions: [] }),
    );
    render(<OnboardingClient step="confirm" />);

    // Not called just from rendering the confirm step.
    expect(subscribe).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '알림 받기' }));

    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1));
  });

  it('shows the subscribed state on the 알림 받기 button once isSubscribed is true', () => {
    vi.mocked(useV1PushRegistration).mockReturnValue({
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      permission: 'granted',
      isSubscribed: true,
    });
    window.sessionStorage.setItem(
      'teameet.v1.onboardingDraft',
      JSON.stringify({ sports: [{ sportId: FUTSAL_SPORT_ID, levelId: null }], regions: [] }),
    );
    render(<OnboardingClient step="confirm" />);

    const button = screen.getByRole('button', { name: '알림 받기 완료' });
    expect(button).toBeDisabled();
  });
});
