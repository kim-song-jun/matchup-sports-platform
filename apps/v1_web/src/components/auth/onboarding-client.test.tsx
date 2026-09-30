import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingClient } from './onboarding-client';
import { useV1PushRegistration } from '@/hooks/use-v1-push-registration';

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

const fixtures = vi.hoisted(() => ({
  regions: [] as unknown[],
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
const SEOUL_ID = '44444444-4444-4444-8444-444444444444';
const MAPO_ID = '55555555-5555-4555-8555-555555555555';
const BUSAN_ID = '66666666-6666-4666-8666-666666666666';
const regionsFixture = [
  { id: SEOUL_ID, name: '서울', parentId: null, level: 1, children: [{ id: MAPO_ID, name: '마포구', parentId: SEOUL_ID, level: 2 }] },
  { id: BUSAN_ID, name: '부산', parentId: null, level: 1, children: [] },
];
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
  useV1MasterRegions: () => ({ data: fixtures.regions, isLoading: false, isError: false, refetch: vi.fn() }),
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
    fixtures.regions = [];
    hooks.savePreferencesMutate.mockImplementation((_body: unknown, callbacks: SaveCallbacks) => callbacks.onSuccess());
    hooks.deferOnboardingMutate.mockImplementation((_body: unknown, callbacks: CompleteCallbacks) =>
      callbacks.onSuccess({ next: { route: '/home' } }),
    );
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

  it('renders a 켜기 button on the confirm step that triggers subscribe() via explicit click', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: '알림 켜기' }));

    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1));
  });

  it('shows the subscribed state on the 알림 row once isSubscribed is true', () => {
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

    const button = screen.getByRole('button', { name: '알림 켜짐' });
    expect(button).toBeDisabled();
  });

  it.each([
    ['denied', '브라우저 설정에서 알림을 다시 허용하면 소식을 받을 수 있어요.'],
    ['unsupported', '이 브라우저에서는 알림을 지원하지 않아요.'],
  ] as const)('알림 권한이 %s 이면 켜기를 잠그고 이유를 한 줄로 말한다', (permission, message) => {
    vi.mocked(useV1PushRegistration).mockReturnValue({
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      permission,
      isSubscribed: false,
      isPending: false,
    });
    window.sessionStorage.setItem(
      'teameet.v1.onboardingDraft:user-1',
      JSON.stringify({ sports: [{ sportId: FUTSAL_SPORT_ID, levelId: null }], regions: [] }),
    );
    render(<OnboardingClient step="confirm" />);

    expect(screen.getByRole('button', { name: '알림 켜기' })).toBeDisabled();
    expect(screen.getByText(message)).toBeInTheDocument();
  });
});

// 확인 화면은 "내가 고른 것"이 먼저 보여야 하고, 알림은 같은 말을 세 번 하지 않고 한 줄이다.
describe('OnboardingClient 확인 단계', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    fixtures.regions = regionsFixture;
    vi.mocked(useV1PushRegistration).mockReturnValue({
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      permission: 'default',
      isSubscribed: false,
      isPending: false,
    });
    window.sessionStorage.setItem(
      'teameet.v1.onboardingDraft:user-1',
      JSON.stringify({
        sports: [{ sportId: FUTSAL_SPORT_ID, levelId: FUTSAL_LEVEL_ID }],
        regions: [{ regionId: MAPO_ID, primary: true }],
      }),
    );
  });

  it('요약 카드가 알림 한 줄보다 앞에 오고, 알림 안내와 버튼은 한 번씩만 나온다', () => {
    render(<OnboardingClient step="confirm" />);

    const summary = screen.getByText('관심 종목과 실력');
    expect(screen.getByText('풋살 초급')).toBeInTheDocument();
    expect(screen.getByText('서울 마포구')).toBeInTheDocument();
    const pushRow = screen.getByText('알림 받기');
    expect(summary.compareDocumentPosition(pushRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // "알림 받기" 제목 하나, 켜기 버튼 하나 — 큰 버튼·안내 카드·설명 문단으로 되풀이하지 않는다.
    expect(screen.getAllByText('알림 받기')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /^알림/ })).toHaveLength(1);
    expect(screen.queryByText('설정 완료')).not.toBeInTheDocument();
  });
});

describe('OnboardingClient 지역 단계', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    fixtures.regions = regionsFixture;
    hooks.savePreferencesMutate.mockImplementation((_body: unknown, callbacks: SaveCallbacks) => callbacks.onSuccess());
    hooks.deferOnboardingMutate.mockImplementation((_body: unknown, callbacks: CompleteCallbacks) =>
      callbacks.onSuccess({ next: { route: '/home' } }),
    );
    vi.mocked(useV1PushRegistration).mockReturnValue({
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      permission: 'default',
      isSubscribed: false,
      isPending: false,
    });
    window.sessionStorage.setItem(
      'teameet.v1.onboardingDraft:user-1',
      JSON.stringify({ sports: [{ sportId: FUTSAL_SPORT_ID, levelId: FUTSAL_LEVEL_ID }], regions: [] }),
    );
  });

  it('처음에는 어떤 시/도도 골라져 있지 않고 상세 지역은 닫혀 있으며 큰 버튼이 잠겨 있다', () => {
    render(<OnboardingClient step="region" />);

    expect(screen.getByRole('button', { name: '서울' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '부산' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText(/상세 지역/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '지역 선택 완료' })).toBeDisabled();
  });

  // 지역을 안 고르면 큰 버튼이 잠기므로, 부제가 "직접 골라도 돼요" 로 끝나면 왜 못 넘어가는지 읽히지 않는다.
  it('부제가 지역을 고르면 넘어가고 안 정하면 나중에 설정하기를 누르라고 말한다', () => {
    render(<OnboardingClient step="region" />);

    expect(screen.getByText(
      '위치 권한 없어도 괜찮아요. 지역을 직접 고르면 다음으로 넘어가요. 지금 정하지 않으면 "나중에 설정하기"를 눌러 주세요.',
    )).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '지역 선택 완료' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '나중에 설정하기' })).toBeEnabled();
  });

  it('"나중에 설정하기"는 하단에 하나뿐이고 누르면 온보딩을 미룬다', () => {
    render(<OnboardingClient step="region" />);

    const skip = screen.getAllByRole('button', { name: '나중에 설정하기' });
    expect(skip).toHaveLength(1);
    fireEvent.click(skip[0]);

    expect(hooks.deferOnboardingMutate).toHaveBeenCalledWith({ reason: 'later' }, expect.anything());
    expect(router.replace).toHaveBeenCalledWith('/home');
  });

  it('시/도를 고르면 상세 지역이 열리고, 상세 지역을 고르면 큰 버튼이 열려 확인 단계로 간다', async () => {
    render(<OnboardingClient step="region" />);

    fireEvent.click(screen.getByRole('button', { name: '서울' }));
    expect(screen.getByText('서울 상세 지역')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '지역 선택 완료' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '마포구' }));
    const done = screen.getByRole('button', { name: '지역 선택 완료' });
    expect(done).toBeEnabled();
    fireEvent.click(done);

    // 분석 이벤트 단계명과 이동 경로는 그대로다.
    expect(hooks.savePreferencesMutate).toHaveBeenCalledWith(
      expect.objectContaining({ currentStep: 'region', regions: [{ regionId: MAPO_ID, primary: true }] }),
      expect.anything(),
    );
    await waitFor(() => expect(analytics.trackEvent).toHaveBeenCalledWith('onboarding_step_complete', { step: 'region' }));
    expect(router.push).toHaveBeenCalledWith('/onboarding/confirm');
  });

  it('이미 고른 지역이 있으면 그 시/도가 열려 있고 큰 버튼도 열려 있다', () => {
    window.sessionStorage.setItem(
      'teameet.v1.onboardingDraft:user-1',
      JSON.stringify({ sports: [{ sportId: FUTSAL_SPORT_ID, levelId: FUTSAL_LEVEL_ID }], regions: [{ regionId: MAPO_ID, primary: true }] }),
    );
    render(<OnboardingClient step="region" />);

    expect(screen.getByRole('button', { name: '서울' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '마포구' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '지역 선택 완료' })).toBeEnabled();
  });

  it('위치 안내는 한 번만 나온다', () => {
    render(<OnboardingClient step="region" />);

    expect(screen.getAllByText(/좌표는 저장하지 않아요/)).toHaveLength(1);
    expect(screen.queryByText('현재 위치로 지역 찾기')).not.toBeInTheDocument();
  });
});
