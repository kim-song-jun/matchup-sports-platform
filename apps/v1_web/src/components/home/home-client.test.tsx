import { render, screen } from '@testing-library/react';
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
// already-verified result so unrelated home tests do not crash it.
const authMeMock = vi.fn(() => authMeResult(true));

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

describe('HomePageClient phone verify nudge banner', () => {
  beforeEach(() => {
    authMeMock.mockReset().mockReturnValue(authMeResult(false));
  });

  it('shows the banner when the account has not completed phone verification', async () => {
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

  // 인증 전에는 쓰기가 전부 막히므로 배너를 닫을 수 있으면 안 된다 — 닫고 나면 사용자는
  // 신청·등록이 왜 실패하는지 알 방법이 사라진다(조회는 열려 있어 화면상 정상으로 보인다).
  it('offers no dismiss control so the banner stays until verification is done', async () => {
    render(
      <Providers>
        <HomePageClient />
      </Providers>,
    );

    expect(await screen.findByText('휴대폰 본인인증이 필요해요')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '휴대폰 본인인증 안내 닫기' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '인증하기' })).toBeInTheDocument();
  });
});
