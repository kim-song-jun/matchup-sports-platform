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

const FUTSAL_LEVEL_ID = '33333333-3333-4333-8333-333333333333';
const sportsFixture = [
  { id: FUTSAL_SPORT_ID, code: 'futsal', name: '풋살', levels: [{ id: '33333333-3333-4333-8333-333333333333', name: '초급' }] },
];

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

vi.mock('@/hooks/use-v1-api', () => ({
  // 초안을 계정별로 나누려면 누구인지 알아야 한다 — 이게 없으면 초안을 읽지도 쓰지도 않는다.
  useV1AuthMe: () => ({ data: { user: { id: 'user-1' } } }),
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
      isPending: false,
    });
  });

  it('실력 단계 완료는 자기 단계(level)를 보고한다 — 지역을 고르기 전에 지역 완료로 확정되지 않는다', () => {
    // 서버는 currentStep 이 'region' 이면 **지역 선택 여부와 무관하게** region_done 으로
    // 확정한다(derivePreferenceStatus). 실력 단계 버튼이 다음 단계명을 보내고 있어서,
    // 지역 화면을 보지도 않은 계정이 "지역 입력 완료"로 기록됐다.
    window.sessionStorage.setItem(
      'teameet.v1.onboardingDraft:user-1',
      JSON.stringify({ sports: [{ sportId: FUTSAL_SPORT_ID, levelId: FUTSAL_LEVEL_ID }], regions: [] }),
    );
    render(<OnboardingClient step="level" />);

    fireEvent.click(screen.getByRole('button', { name: '지역 선택하기' }));

    expect(hooks.savePreferencesMutate).toHaveBeenCalledWith(
      expect.objectContaining({ currentStep: 'level' }),
      expect.anything(),
    );
  });

  it('다른 계정의 초안은 복원되지 않고, 계정 구분이 없던 옛 초안은 지운다', () => {
    // 같은 탭에서 계정이 바뀌어도 앞사람이 고른 종목이 새 계정에 복원되면 안 된다 —
    // 본인이 고르지 않은 값으로 매칭 추천을 받게 되는데 화면상으로는 자기 선택처럼 보인다.
    const otherDraft = JSON.stringify({
      sports: [{ sportId: FUTSAL_SPORT_ID, levelId: FUTSAL_LEVEL_ID }],
      regions: [],
    });
    window.sessionStorage.setItem('teameet.v1.onboardingDraft:someone-else', otherDraft);
    window.sessionStorage.setItem('teameet.v1.onboardingDraft', otherDraft);

    render(<OnboardingClient step="confirm" />);

    // 계정 구분이 없던 키는 읽지 않고 지운다 — 그 값이 이 계정의 것이라는 보장이 없다.
    expect(window.sessionStorage.getItem('teameet.v1.onboardingDraft')).toBeNull();
    // 이 계정의 초안에는 남의 선택이 들어오지 않는다(서버가 준 빈 상태 그대로다).
    const mine = JSON.parse(window.sessionStorage.getItem('teameet.v1.onboardingDraft:user-1') ?? '{}');
    expect(mine.sports).toEqual([]);
    // 남의 초안 자체는 건드리지 않는다 — 그 계정으로 돌아가면 그대로 이어져야 한다.
    expect(window.sessionStorage.getItem('teameet.v1.onboardingDraft:someone-else')).toBe(otherDraft);
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
      'teameet.v1.onboardingDraft:user-1',
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
      isPending: false,
    });
    window.sessionStorage.setItem(
      'teameet.v1.onboardingDraft:user-1',
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
      isPending: false,
    });
    window.sessionStorage.setItem(
      'teameet.v1.onboardingDraft:user-1',
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
      isPending: false,
    });
    window.sessionStorage.setItem(
      'teameet.v1.onboardingDraft:user-1',
      JSON.stringify({ sports: [{ sportId: FUTSAL_SPORT_ID, levelId: null }], regions: [] }),
    );
    render(<OnboardingClient step="confirm" />);

    const button = screen.getByRole('button', { name: '알림 받기 완료' });
    expect(button).toBeDisabled();
  });
});
