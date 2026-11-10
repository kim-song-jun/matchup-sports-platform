import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1AuthMe, V1Profile } from '@/types/api';
import { EmailVerifyBanner } from './email-verify-banner';
import { MyHomePageClient } from './my-api-clients';

const apiMocks = vi.hoisted(() => ({
  useV1Profile: vi.fn(),
  useV1MyActivitySummary: vi.fn(),
  useV1MyTeams: vi.fn(),
  useV1Notifications: vi.fn(),
  useV1Reviews: vi.fn(),
  useV1AuthMe: vi.fn(),
  useV1MyTournamentStaffAssignments: vi.fn(),
  useV1PublicProfile: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  ...apiMocks,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/my',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const REASON = '이메일 인증을 마치면 비밀번호를 잊어도 찾을 수 있어요.';
const SNOOZE_TOAST = '14일 뒤에 다시 알려 드릴게요';
const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 10, 8, 0, 0, 0);

function render(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(START);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('EmailVerifyBanner — 닫기와 다시 보이기', () => {
  it('이유 한 줄과 인증하기 링크를 보이고, 링크는 마치면 마이 탭으로 돌아오게 한다', () => {
    render(<EmailVerifyBanner userId="u1" />);

    expect(screen.getByText(REASON)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '인증하기' })).toHaveAttribute('href', '/my/email-verify?redirect=%2Fmy');
    // 공지는 문구에만 — 버튼·링크는 라이브 리전 밖에 있어야 낭독기가 조작 요소를 공지로 읽지 않는다.
    const status = screen.getByText(REASON);
    expect(status).toHaveAttribute('role', 'status');
    expect(status).not.toContainElement(screen.getByRole('link', { name: '인증하기' }));
    expect(status).not.toContainElement(screen.getByRole('button', { name: '이메일 인증 안내 닫기' }));
  });

  it('닫으면 키보드 포커스를 배너 바로 뒤의 보이는 조작 요소로 옮긴다(숨김 제목이나 body 가 아니라)', () => {
    render(
      <>
        <a href="/before">앞 링크</a>
        <EmailVerifyBanner userId="u1" />
        <div aria-hidden="true"><button type="button">숨은 버튼</button></div>
        <a href="/next">다음 링크</a>
      </>,
    );

    const close = screen.getByRole('button', { name: '이메일 인증 안내 닫기' });
    close.focus();
    fireEvent.click(close);

    expect(screen.getByRole('link', { name: '다음 링크' })).toHaveFocus();
  });

  it('닫으면 배너가 사라지고, 다시 알려 주겠다는 안내를 한 번 보인다', () => {
    render(<EmailVerifyBanner userId="u1" />);

    fireEvent.click(screen.getByRole('button', { name: '이메일 인증 안내 닫기' }));

    expect(screen.queryByText(REASON)).not.toBeInTheDocument();
    expect(screen.getByText(SNOOZE_TOAST)).toBeInTheDocument();
  });

  it('닫은 뒤 14일이 되기 전에 다시 들어오면 숨겨져 있고, 14일이 지나면 다시 보인다', () => {
    const first = render(<EmailVerifyBanner userId="u1" />);
    fireEvent.click(screen.getByRole('button', { name: '이메일 인증 안내 닫기' }));
    first.unmount();

    vi.setSystemTime(START + 14 * DAY - 1000);
    const early = render(<EmailVerifyBanner userId="u1" />);
    expect(screen.queryByText(REASON)).not.toBeInTheDocument();
    early.unmount();

    vi.setSystemTime(START + 14 * DAY);
    render(<EmailVerifyBanner userId="u1" />);
    expect(screen.getByText(REASON)).toBeInTheDocument();
  });

  it('다른 사용자가 닫은 기록은 이 사용자에게 영향을 주지 않는다', () => {
    const other = render(<EmailVerifyBanner userId="u-other" />);
    fireEvent.click(screen.getByRole('button', { name: '이메일 인증 안내 닫기' }));
    other.unmount();

    render(<EmailVerifyBanner userId="u1" />);

    expect(screen.getByText(REASON)).toBeInTheDocument();
  });

  it('처음 보인 뒤 3번 다시 보이고, 4번째 닫기에서는 약속 없이 닫히며 다시는 오지 않는다', () => {
    for (let close = 1; close <= 4; close += 1) {
      vi.setSystemTime(START + (close - 1) * 14 * DAY);
      const view = render(<EmailVerifyBanner userId="u1" />);
      expect(screen.getByText(REASON)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: '이메일 인증 안내 닫기' }));

      if (close < 4) expect(screen.getByText(SNOOZE_TOAST)).toBeInTheDocument();
      else expect(screen.queryByText(SNOOZE_TOAST)).not.toBeInTheDocument();
      view.unmount();
    }

    vi.setSystemTime(START + 4 * 14 * DAY + 365 * DAY);
    render(<EmailVerifyBanner userId="u1" />);
    expect(screen.queryByText(REASON)).not.toBeInTheDocument();
  });
});

describe('MyHomePageClient — 이메일 인증 권유 노출', () => {
  const profile: V1Profile = {
    userId: 'user-42',
    accountStatus: 'active',
    email: 'user@example.com',
    authProvider: 'email',
    regionName: '서울',
    profile: { displayName: '김도윤', realName: null, nickname: '도윤', profileImageUrl: null, gender: null },
    reputation: { trustState: 'estimated', mannerScore: null, activityCount: 0, reviewCount: 0 },
  };

  type AuthOverrides = { user?: Partial<V1AuthMe['user']>; verification?: V1AuthMe['verification'] };
  function authMeData(overrides: AuthOverrides = {}) {
    return {
      user: {
        id: 'user-42',
        email: 'user@example.com',
        accountStatus: 'active',
        onboardingStatus: 'completed',
        authProviders: ['email'],
        hasPassword: true,
        ...overrides.user,
      },
      verification: overrides.verification ?? { emailVerified: false, phoneVerified: true },
    };
  }

  function mockHooks(overrides: AuthOverrides = {}) {
    apiMocks.useV1Profile.mockReturnValue({ isError: false, data: profile });
    apiMocks.useV1MyActivitySummary.mockReturnValue({ data: undefined });
    apiMocks.useV1MyTeams.mockReturnValue({ data: { items: [] } });
    apiMocks.useV1Notifications.mockReturnValue({ data: undefined });
    apiMocks.useV1Reviews.mockReturnValue({ data: undefined });
    apiMocks.useV1AuthMe.mockReturnValue({ data: authMeData(overrides) });
    apiMocks.useV1MyTournamentStaffAssignments.mockReturnValue({ data: { items: [] } });
    apiMocks.useV1PublicProfile.mockReturnValue({ data: { playerCard: null, teams: [] }, isPending: false });
  }

  it('조건을 모두 채운 계정에게 보이고, 카드·메뉴보다 앞(두 열 레이아웃 바로 위)에 놓인다', () => {
    mockHooks();

    const { container } = render(<MyHomePageClient />);

    const banner = screen.getByText(REASON).closest('.tm-action-banner');
    expect(banner).not.toBeNull();
    expect(banner).toHaveClass('tm-my-top-notice');
    const shell = container.querySelector('.tm-my-home-shell');
    expect(banner?.parentElement).toBe(shell);
    expect(banner?.nextElementSibling).toHaveClass('tm-my-desktop-layout');
  });

  it.each([
    ['이미 인증한 계정', { verification: { emailVerified: true, phoneVerified: true } }],
    ['카카오로만 로그인하는 계정', { user: { authProviders: ['kakao'], hasPassword: false } }],
    ['이메일 로그인이지만 비밀번호가 없는 계정', { user: { hasPassword: false } }],
    ['탈퇴 신청 중인 계정', { user: { accountStatus: 'withdrawal_pending' } }],
    ['가입 프로필을 미룬 계정', { user: { onboardingStatus: 'social_profile_deferred' } }],
  ] as Array<[string, AuthOverrides]>)('%s 에게는 보이지 않는다', (_name, overrides) => {
    mockHooks(overrides);

    render(<MyHomePageClient />);

    expect(screen.queryByText(REASON)).not.toBeInTheDocument();
  });

  it('인증을 마쳐 /auth/me 가 바뀌면 배너가 사라진다', () => {
    mockHooks();
    const view = render(<MyHomePageClient />);
    expect(screen.getByText(REASON)).toBeInTheDocument();

    mockHooks({ verification: { emailVerified: true, phoneVerified: true } });
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MyHomePageClient />
      </QueryClientProvider>,
    );

    expect(screen.queryByText(REASON)).not.toBeInTheDocument();
  });

  it('이 기기에서 닫아 둔 계정에게는 숨겨 둔 기간 동안 보이지 않는다', () => {
    mockHooks();
    const first = render(<MyHomePageClient />);
    fireEvent.click(screen.getByRole('button', { name: '이메일 인증 안내 닫기' }));
    first.unmount();

    render(<MyHomePageClient />);

    expect(screen.queryByText(REASON)).not.toBeInTheDocument();
  });
});
