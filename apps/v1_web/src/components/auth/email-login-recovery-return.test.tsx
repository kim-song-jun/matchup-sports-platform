import { cleanup, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from '@/app/login/page';
import EmailLoginPage from '@/app/login/email/page';
import FindAccountPage from '@/app/auth/find-account/page';
import { authUiServer, RETURN_PATH, renderAuthUi, resetWireScenario } from './mdqa133-auth-ui.fixtures';

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

beforeAll(() => authUiServer.listen({ onUnhandledRequest: 'error' }));
afterAll(() => authUiServer.close());
beforeEach(() => {
  vi.clearAllMocks();
  resetWireScenario();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/login');
});
afterEach(() => {
  cleanup();
  authUiServer.resetHandlers();
});

function queryFromRenderedHref(href: string | null): Record<string, string> {
  if (!href) throw new Error('Expected a rendered navigation href');
  return Object.fromEntries(new URL(href, 'https://teameet.example.test').searchParams);
}

describe('MD-QA #133 이메일 로그인에서 계정 찾기로 이동하는 복귀 경로', () => {
  it('이메일 로그인 화면에서 계정 찾기를 열면 원래 query와 hash 목적지를 전달한다', async () => {
    // Given: the actual email-login server page receives an in-site destination.
    renderAuthUi(await EmailLoginPage({ searchParams: Promise.resolve({ redirect: RETURN_PATH }) }));

    // When: the user chooses the rendered account-recovery navigation link.
    const recoveryHref = screen.getByRole('link', { name: '아이디·비밀번호 찾기' }).getAttribute('href');

    // Then: the real route keeps the whole destination, including query and hash.
    expect(recoveryHref).toBe(`/auth/find-account?redirect=${encodeURIComponent(RETURN_PATH)}`);
  });

  it('실제 로그인 → 이메일 → 계정 찾기 → 이메일 복귀 링크가 같은 목적지를 유지한다', async () => {
    // Given: a signed-out visitor reaches the real login route from an in-site page.
    renderAuthUi(await LoginPage({ searchParams: Promise.resolve({ redirect: RETURN_PATH }) }));
    const emailHref = (await screen.findByRole('link', { name: '이메일로 로그인' })).getAttribute('href');
    cleanup();
    renderAuthUi(await EmailLoginPage({ searchParams: Promise.resolve(queryFromRenderedHref(emailHref)) }));

    // When: the account-recovery route consumes the actual email page's href.
    const recoveryHref = screen.getByRole('link', { name: '아이디·비밀번호 찾기' }).getAttribute('href');
    cleanup();
    renderAuthUi(await FindAccountPage({ searchParams: Promise.resolve(queryFromRenderedHref(recoveryHref)) }));

    // Then: going back to email login retains the original destination.
    const expectedEmailHref = `/login/email?redirect=${encodeURIComponent(RETURN_PATH)}`;
    const backLinks = screen.getAllByRole('link', { name: '뒤로가기' });
    backLinks.forEach((link) => expect(link).toHaveAttribute('href', expectedEmailHref));
    cleanup();
    renderAuthUi(await EmailLoginPage({
      searchParams: Promise.resolve(queryFromRenderedHref(backLinks[0].getAttribute('href'))),
    }));
    expect(screen.getByRole('link', { name: '아이디·비밀번호 찾기' })).toHaveAttribute('href', recoveryHref);
  });

  it.each([
    'https://outside.example.test/steal?next=account#secret',
    '//outside.example.test/steal',
    '/\\outside.example.test/steal',
  ])('외부 주소 %s는 계정 찾기와 이메일 복귀 링크에서 제외한다', async (redirect) => {
    // Given: the real email-login route receives an untrusted external destination.
    renderAuthUi(await EmailLoginPage({ searchParams: Promise.resolve({ redirect }) }));

    // When: account recovery consumes the rendered link's query.
    const recoveryHref = screen.getByRole('link', { name: '아이디·비밀번호 찾기' }).getAttribute('href');
    cleanup();
    renderAuthUi(await FindAccountPage({ searchParams: Promise.resolve(queryFromRenderedHref(recoveryHref)) }));

    // Then: the unsafe value never reaches either destination link.
    expect(recoveryHref).toBe('/auth/find-account');
    screen.getAllByRole('link', { name: '뒤로가기' }).forEach((link) => {
      expect(link).toHaveAttribute('href', '/login/email');
    });
  });

  it('복귀 목적지가 없으면 기존 계정 찾기 링크를 유지한다', async () => {
    // Given: the actual email-login route has no redirect query.
    renderAuthUi(await EmailLoginPage({ searchParams: Promise.resolve({}) }));

    // When: the visitor chooses account recovery.
    const recoveryLink = screen.getByRole('link', { name: '아이디·비밀번호 찾기' });

    // Then: canonical account recovery remains available.
    expect(recoveryLink).toHaveAttribute('href', '/auth/find-account');
  });
});
