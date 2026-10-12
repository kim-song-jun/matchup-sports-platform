import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetNavigationHistoryForTests, installNavigationHistory, markEntryAuthGated, markEntryReplacedByDocument } from '@/lib/navigation-history';
import { LoginPageView } from './auth-page';
import { getLoginViewModel } from './auth.view-model';
import { normalizeSiteInfo } from '@/lib/public-site/site-info';

const siteInfo = normalizeSiteInfo(null);

const router = vi.hoisted(() => ({ back: vi.fn(), replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={href} {...rest}>{children}</a>,
}));

beforeEach(() => {
  __resetNavigationHistoryForTests();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/home');
  Object.values(router).forEach((fn) => fn.mockReset());
  installNavigationHistory();
});
afterEach(() => __resetNavigationHistoryForTests());

function renderLogin() {
  render(<LoginPageView model={getLoginViewModel('/tournaments/t1/my')} siteInfo={siteInfo} />);
}

// 두 출구(상단 뒤로가기·"로그인 없이 시작하기")는 같은 규칙을 따라야 한다.
const exits: Array<[string, () => HTMLElement]> = [
  ['상단 뒤로가기', () => screen.getAllByRole('button', { name: '뒤로가기' })[0]],
  ['로그인 없이 시작하기', () => screen.getByRole('link', { name: '로그인 없이 시작하기' })],
];

describe.each(exits)('로그인 화면 출구 — %s', (_label, exit) => {
  it('보던 화면에서 로그인으로 왔으면 그 화면으로 돌아간다(홈이 아니다)', () => {
    window.history.pushState({}, '', '/tournaments/t1');
    window.history.pushState({}, '', '/login?redirect=%2Ftournaments%2Ft1%2Fmy');
    renderLogin();

    fireEvent.click(exit());

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('앞에 앱 안 화면이 없으면(앱 첫 실행) 홈으로 간다', () => {
    window.history.replaceState({}, '', '/login');
    __resetNavigationHistoryForTests();
    window.sessionStorage.clear();
    installNavigationHistory();
    renderLogin();

    fireEvent.click(exit());

    expect(router.replace).toHaveBeenCalledWith('/home');
    expect(router.back).not.toHaveBeenCalled();
  });

  it('앞 항목이 다른 로그인 단계(/login/email)면 그리로 되돌아가지 않고 홈으로 간다', () => {
    window.history.pushState({}, '', '/login/email');
    window.history.pushState({}, '', '/login?redirect=%2Ftournaments%2Ft1%2Fmy');
    renderLogin();

    fireEvent.click(exit());

    expect(router.replace).toHaveBeenCalledWith('/home');
    expect(router.back).not.toHaveBeenCalled();
  });

  it('탭의 유일한 항목이 로그인으로 교체된 경우엔 거울에 앞 항목이 남아 있어도 홈으로 간다', () => {
    window.history.pushState({}, '', '/tournaments/t1');
    window.history.pushState({}, '', '/login?redirect=%2Ftournaments%2Ft1%2Fmy');
    Object.defineProperty(window.history, 'length', { value: 1, configurable: true });
    try {
      renderLogin();
      fireEvent.click(exit());
    } finally {
      delete (window.history as { length?: number }).length;
    }

    expect(router.replace).toHaveBeenCalledWith('/home');
    expect(router.back).not.toHaveBeenCalled();
  });

  it('redirect 없이 열린 로그인(로그아웃·탈퇴)은 앞 항목이 보호 화면이어도 홈으로 간다', () => {
    window.history.pushState({}, '', '/my/settings');
    window.history.pushState({}, '', '/login');
    renderLogin();

    fireEvent.click(exit());

    expect(router.replace).toHaveBeenCalledWith('/home');
    expect(router.back).not.toHaveBeenCalled();
  });

  it('세션 만료로 보호 화면(/my)에서 다른 보호 화면으로 옮겨 열린 로그인은 앞 항목으로 돌아가지 않고 홈으로 간다', () => {
    window.history.pushState({}, '', '/my');
    markEntryAuthGated();
    window.history.pushState({}, '', '/login?redirect=%2Fnotifications');
    render(<LoginPageView model={getLoginViewModel('/notifications')} siteInfo={siteInfo} />);

    fireEvent.click(exit());

    expect(router.replace).toHaveBeenCalledWith('/home');
    expect(router.back).not.toHaveBeenCalled();
  });

  it('앞 항목이 redirect 대상 자신이면 되돌아가지 않고 홈으로 간다', () => {
    window.history.pushState({}, '', '/tournaments/t1/my');
    window.history.pushState({}, '', '/login?redirect=%2Ftournaments%2Ft1%2Fmy');
    renderLogin();

    fireEvent.click(exit());

    expect(router.replace).toHaveBeenCalledWith('/home');
    expect(router.back).not.toHaveBeenCalled();
  });
});

// RequireAuth 는 push 한 보호 화면을 window.location.replace 로 로그인에 하드 교체한다 — 새 문서·state null.
describe.each(exits)('로그인 화면 출구(하드 교체로 열림) — %s', (_label, exit) => {
  function openLoginByHardReplace(redirect: string) {
    window.history.pushState({}, '', '/tournaments/t1');
    window.history.pushState({}, '', redirect);
    markEntryReplacedByDocument();
    __resetNavigationHistoryForTests(); // 새 문서: 메모리는 사라지고 sessionStorage 거울만 남는다
    window.history.replaceState(null, '', `/login?redirect=${encodeURIComponent(redirect)}`);
    installNavigationHistory();
  }

  it('참가 신청 화면이 로그인으로 교체돼도 대회 상세로 돌아간다(홈이 아니다)', () => {
    openLoginByHardReplace('/tournaments/t1/apply');
    render(<LoginPageView model={getLoginViewModel('/tournaments/t1/apply')} siteInfo={siteInfo} />);

    fireEvent.click(exit());

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('하드 교체가 아니라 앱 안에서 push 한 로그인이 redirect 대상 자신 위에 쌓였으면 홈으로 간다', () => {
    window.history.pushState({}, '', '/tournaments/t1/apply');
    window.history.pushState({}, '', '/login?redirect=%2Ftournaments%2Ft1%2Fapply');
    render(<LoginPageView model={getLoginViewModel('/tournaments/t1/apply')} siteInfo={siteInfo} />);

    fireEvent.click(exit());

    expect(router.replace).toHaveBeenCalledWith('/home');
    expect(router.back).not.toHaveBeenCalled();
  });
});

describe('로그인 화면 뒤로가기 컨트롤', () => {
  it('모바일 상단바와 데스크톱 in-card 내비 두 벌을 렌더한다', () => {
    renderLogin();
    expect(screen.getAllByRole('button', { name: '뒤로가기' })).toHaveLength(2);
  });

  it('"로그인 없이 시작하기"는 새 탭·JS 없이도 홈 링크로 남는다', () => {
    renderLogin();
    expect(screen.getByRole('link', { name: '로그인 없이 시작하기' })).toHaveAttribute('href', '/home');
  });
});
