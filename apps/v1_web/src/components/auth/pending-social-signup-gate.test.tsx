import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { PendingSocialSignupGate } from './pending-social-signup-gate';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  useV1AuthMe: vi.fn(),
  pathname: '/my',
  clearStoredV1Session: vi.fn(),
  disconnectV1Socket: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AuthMe: (...args: unknown[]) => mocks.useV1AuthMe(...args),
}));

vi.mock('@/lib/session-storage', () => ({
  hasStoredV1Session: () => true,
  clearStoredV1Session: mocks.clearStoredV1Session,
}));

vi.mock('@/lib/v1-socket', () => ({ disconnectV1Socket: mocks.disconnectV1Socket }));

vi.mock('@/lib/app-route', () => ({ browserAppRoute: (route: string) => route }));

describe('PendingSocialSignupGate required terms renewal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = '/my';
  });

  it('redirects an authenticated existing user to renewal before rendering the protected page', async () => {
    mocks.useV1AuthMe.mockReturnValue({
      isSuccess: true,
      isError: false,
      data: {
        user: { onboardingStatus: 'completed' },
        termsCompliance: {
          compliant: false,
          pendingRequiredDocumentIds: ['document-new'],
          nextRoute: '/terms?mode=renewal',
        },
      },
    });

    render(<PendingSocialSignupGate><div>마이 페이지</div></PendingSocialSignupGate>);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(
      '/terms?mode=renewal&redirect=%2Fmy',
    ));
    expect(screen.queryByText('마이 페이지')).not.toBeInTheDocument();
  });

  it('renders the protected page when all current required terms are satisfied', async () => {
    mocks.useV1AuthMe.mockReturnValue({
      isSuccess: true,
      isError: false,
      data: {
        user: { onboardingStatus: 'completed' },
        termsCompliance: {
          compliant: true,
          pendingRequiredDocumentIds: [],
          nextRoute: null,
        },
      },
    });

    render(<PendingSocialSignupGate><div>마이 페이지</div></PendingSocialSignupGate>);

    expect(await screen.findByText('마이 페이지')).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  // 정보 입력을 미룬 계정은 쓸 수 있는 계정 — 강제 이동하면 건너뛰기가 무의미해진다.
  // 대조군인 social_profile_required 는 같은 화면에서 여전히 가입 화면으로 보내진다.
  it.each([
    ['social_profile_deferred', false],
    ['social_profile_required', true],
  ] as const)('%s 계정이 /home 에 있을 때 강제 이동은 %s', async (onboardingStatus, redirected) => {
    mocks.pathname = '/home';
    mocks.useV1AuthMe.mockReturnValue({
      isSuccess: true,
      isError: false,
      data: {
        user: { onboardingStatus },
        termsCompliance: { compliant: true, pendingRequiredDocumentIds: [], nextRoute: null },
      },
    });

    render(<PendingSocialSignupGate><div>홈 화면</div></PendingSocialSignupGate>);

    if (redirected) {
      await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/signup/social'));
      expect(screen.queryByText('홈 화면')).not.toBeInTheDocument();
    } else {
      expect(await screen.findByText('홈 화면')).toBeInTheDocument();
      expect(mocks.replace).not.toHaveBeenCalled();
    }
  });

  it('does not overwrite the redirect while already rendering the terms completion route', async () => {
    mocks.pathname = '/terms';
    mocks.useV1AuthMe.mockReturnValue({
      isSuccess: true,
      isError: false,
      data: {
        user: { onboardingStatus: 'completed' },
        termsCompliance: {
          compliant: false,
          pendingRequiredDocumentIds: ['document-new'],
          nextRoute: '/terms?mode=renewal',
        },
      },
    });

    render(<PendingSocialSignupGate><div>재동의 화면</div></PendingSocialSignupGate>);

    expect(await screen.findByText('재동의 화면')).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('lets the email login callback preserve its original redirect before renewal navigation', async () => {
    mocks.pathname = '/login/email';
    mocks.useV1AuthMe.mockReturnValue({
      isSuccess: true,
      isError: false,
      data: {
        user: { onboardingStatus: 'completed' },
        termsCompliance: {
          compliant: false,
          pendingRequiredDocumentIds: ['document-new'],
          nextRoute: '/terms?mode=renewal',
        },
      },
    });

    render(<PendingSocialSignupGate><div>이메일 로그인</div></PendingSocialSignupGate>);

    expect(await screen.findByText('이메일 로그인')).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

describe('PendingSocialSignupGate session preservation on transient errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = '/my';
  });

  it('does not clear the stored session on a transient 503 — only a genuine 401 means unauthenticated', async () => {
    mocks.useV1AuthMe.mockReturnValue({
      isSuccess: false,
      isError: true,
      isFetching: false,
      data: undefined,
      error: new V1ApiError({
        status: 'error',
        statusCode: 503,
        code: 'SERVICE_UNAVAILABLE',
        message: 'unavailable',
        timestamp: new Date().toISOString(),
      }),
    });

    render(<PendingSocialSignupGate><div>마이 페이지</div></PendingSocialSignupGate>);

    expect(await screen.findByText('마이 페이지')).toBeInTheDocument();
    expect(mocks.clearStoredV1Session).not.toHaveBeenCalled();
    expect(mocks.disconnectV1Socket).not.toHaveBeenCalled();
  });

  it('clears the stored session on a genuine 401', async () => {
    mocks.useV1AuthMe.mockReturnValue({
      isSuccess: false,
      isError: true,
      isFetching: false,
      data: undefined,
      error: new V1ApiError({
        status: 'error',
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'unauthorized',
        timestamp: new Date().toISOString(),
      }),
    });

    render(<PendingSocialSignupGate><div>마이 페이지</div></PendingSocialSignupGate>);

    await waitFor(() => expect(mocks.clearStoredV1Session).toHaveBeenCalled());
    expect(mocks.disconnectV1Socket).toHaveBeenCalled();
  });
});
