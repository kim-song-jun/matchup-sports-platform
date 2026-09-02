import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/app/providers';
import { HomePageClient } from './home-client';

// 이 파일이 지키는 것은 하나다 — **추천 대회 슬롯이 서버 렌더에서도 자리를 잡는가**.
//
// alpha 실측(390px · 느린 4G · CPU 4배): /home 의 CLS 가 0.5489("나쁨" 기준의 2.2배)였고,
// 그중 0.319 가 이 슬롯이 하이드레이션 시점(10초)에 통째로 나타나며 아래를 민 것이었다.
// 원인은 조건식이 `tournaments.isLoading` 을 봤다는 것이다 — React Query 에서
// `isLoading = isPending && isFetching` 이라, 쿼리가 돌지 않는 서버 렌더에서는 false 다.
// 즉 조건식이 **"아직 모름"을 "없음"으로** 읽고 섹션을 통째로 뺐다.
//
// 그래서 아래 테스트는 `isPending: true` + `isLoading: false` 라는 **서버 렌더 그대로의
// 상태**를 만들어 둔다. 이 조합에서만 두 플래그가 갈리므로, 누군가 `isPending` 을
// `isLoading` 으로 되돌리면 여기서만 잡힌다.

vi.mock('next/navigation', () => ({
  usePathname: () => '/home',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
  getGaMeasurementId: () => undefined,
}));

const authMe = {
  data: {
    user: { id: 'user-1', email: 'user@example.com', onboardingStatus: 'completed' },
    profile: { displayName: '테스터' },
    termsCompliance: { compliant: true, pendingRequiredDocumentIds: [], nextRoute: null },
    verification: { emailVerified: true, phoneVerified: true },
  },
  isError: false,
  isFetching: false,
  isSuccess: true,
  error: null,
  refetch: vi.fn(),
};

// `useV1AllTournaments` 가 돌려주는 것 중 홈이 실제로 읽는 필드만 추린 모양.
// `data` 를 optional 로 두지 않으면 첫 반환값(undefined)에서 타입이 굳어, 나중에
// 빈 배열을 돌려주는 테스트가 tsc 에서 막힌다.
type TournamentsResult = {
  data?: unknown[];
  isPending: boolean;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
};

// 서버 렌더 그대로: 데이터 없음 + isPending true + isLoading **false**.
const tournamentsMock = vi.fn<() => TournamentsResult>(() => ({
  data: undefined,
  isPending: true,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-v1-api')>();
  return {
    ...actual,
    useV1Home: () => ({
      data: { viewer: { authenticated: true, onboardingStatus: 'completed', displayName: '테스터' } },
      isError: false,
      refetch: vi.fn(),
    }),
    useV1ChatRooms: () => ({ data: { items: [] }, isPending: false, isError: false }),
    useV1PendingTournamentReviews: () => ({ data: undefined }),
    useV1AuthMe: () => authMe,
    useV1AllTournaments: () => tournamentsMock(),
  };
});

vi.mock('@/hooks/use-v1-push-registration', () => ({
  useV1PushRegistration: () => ({
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    permission: 'default',
    isSubscribed: false,
  }),
}));

function renderHome() {
  return render(
    <Providers>
      <HomePageClient />
    </Providers>,
  );
}

const PENDING = { data: undefined, isPending: true, isLoading: false, isError: false, refetch: vi.fn() };

describe('홈 추천 대회 슬롯 — 데이터가 아직 없을 때도 자리를 잡는다', () => {
  // mockReturnValue 는 영구적이라 다음 테스트까지 끌고 간다 — 매번 서버 렌더 상태로 되돌린다.
  afterEach(() => {
    tournamentsMock.mockReturnValue(PENDING);
  });

  it('isPending 이면(= 서버 렌더처럼 isLoading 이 false 여도) 슬롯이 렌더된다', () => {
    const { container } = renderHome();

    // 섹션이 통째로 빠지지 않았다는 것 — 이것이 0.319 를 만들던 결함이다.
    expect(screen.getByText('오늘의 추천')).toBeInTheDocument();
    expect(container.querySelector('.tm-home-featured-carousel')).toBeInTheDocument();
    expect(container.querySelector('.tm-featured-skeleton')).toBeInTheDocument();
  });

  it('스켈레톤이 실제 카드와 같은 뼈대를 쓴다(높이가 어긋나지 않게)', () => {
    const { container } = renderHome();
    const skeleton = container.querySelector('.tm-featured-skeleton');

    // 아래 세 가지가 실제 카드에는 있고 스켈레톤에는 없어서 450px vs 345px 로 갈렸다.
    // 하나라도 빠지면 데이터 도착 순간 그 차이만큼 화면이 다시 밀린다.
    expect(skeleton?.classList.contains('tm-featured-link')).toBe(true);
    expect(skeleton?.querySelector('.tm-featured-content-with-cta')).toBeInTheDocument();
    expect(skeleton?.querySelector('.tm-featured-cta')).toBeInTheDocument();

    // 스켈레톤 자체는 장식이라 숨기고, "로딩 중"은 **바깥 블록**이 알린다.
    // (안쪽에 aria-busy 를 달면 aria-hidden 서브트리라 보조기기에 닿지 않는다)
    expect(skeleton?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.tm-home-featured-block')?.getAttribute('aria-busy')).toBe('true');
  });

  it('추천할 대회가 하나도 없으면 슬롯을 접는다(이 안이 감수하기로 한 대가)', () => {
    // mockReturnValueOnce 는 쓰지 않는다 — 훅은 한 번 렌더에 여러 번 불리므로 첫 호출만
    // 바뀌고 나머지는 기본값(isPending)으로 돌아가 테스트가 조용히 무의미해진다.
    tournamentsMock.mockReturnValue({
      data: [],
      isPending: false,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const { container } = renderHome();

    // 조건부 단언(`if (block) …`)을 쓰지 않는다 — block 이 null 이면 그냥 통과하는
    // 빈 테스트가 된다. 접히는 것이 이 안의 **의도된 동작**이므로 그대로 못박는다:
    // 슬롯이 사라지고, 따라서 "불러오는 중"이 영원히 남는 일도 없다.
    expect(container.querySelector('.tm-home-featured-block')).toBeNull();
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });
});
