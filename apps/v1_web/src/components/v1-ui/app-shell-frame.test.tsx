import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppShellFrame } from './app-shell-frame';
import { AppChrome } from './shell';
import { useShellOverride } from './shell-override';

vi.mock('@/hooks/use-v1-api', () => ({
  useV1NotificationUnreadSummary: vi.fn(() => ({ data: { unreadCount: 0 } })),
}));

// AppShellFrame이 route-chrome.ts의 실제 테이블 내용에 의존하지 않도록 두 라우트만
// 고정 목킹한다 — 테이블 자체의 정확성은 route-chrome.test.ts(§3.5)가 따로 검증한다.
// '/campaign-fixture'는 backHref 우선순위 테스트 전용 — 테이블에 backHref가 있는 라우트를
// 하나 목킹해야 override가 그 값을 실제로 이기는지 검증할 수 있다.
vi.mock('@/lib/route-chrome', () => ({
  resolveRouteChrome: (pathname: string) => {
    if (pathname === '/home') return { chrome: { title: 'teameet', activeTab: 'home' as const }, params: {} };
    if (pathname === '/tournaments') return { chrome: { title: '대회', activeTab: 'tournaments' as const }, params: {} };
    if (pathname === '/campaign-fixture') {
      return { chrome: { title: '캠페인', activeTab: 'tournaments' as const, backHref: '/tournaments' }, params: {} };
    }
    return null;
  },
}));

let mockPathname = '/home';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe('AppShellFrame — 셸 지속성 (진단 #1의 반증)', () => {
  it('pathname이 바뀌어도 topbar/bottomnav/스크롤 컨테이너 DOM은 리마운트되지 않는다', () => {
    mockPathname = '/home';
    const { rerender } = render(
      <AppShellFrame><div data-testid="page-content">홈 콘텐츠</div></AppShellFrame>,
    );

    const topbarBefore = screen.getByRole('banner');                                  // <header class="tm-topbar">
    const bottomNavBefore = screen.getByRole('navigation', { name: '주요 메뉴' });      // <nav class="tm-bottom-nav">
    const scrollAreaBefore = screen.getByRole('main');                                 // <main class="tm-scroll-area">

    // 라우트 전환 시뮬레이션: 같은 AppShellFrame 인스턴스 아래에서 pathname과 children만
    // 바뀐다 — Next 라우터가 layout을 유지한 채 페이지 세그먼트만 바꾸는 상황과 동형이다.
    mockPathname = '/tournaments';
    rerender(<AppShellFrame><div data-testid="page-content">대회 콘텐츠</div></AppShellFrame>);

    expect(screen.getByRole('banner')).toBe(topbarBefore);
    expect(screen.getByRole('navigation', { name: '주요 메뉴' })).toBe(bottomNavBefore);
    expect(screen.getByRole('main')).toBe(scrollAreaBefore);
    // "셸이 안 바뀜"과 "아무것도 리렌더 안 됨"을 구분 — 콘텐츠는 실제로 갱신됐는지도 확인.
    expect(screen.getByTestId('page-content')).toHaveTextContent('대회 콘텐츠');
  });

  it('제목/활성 탭은 라우트 전환에 맞춰 실제로 바뀐다 (셸이 얼어붙은 게 아님을 확인)', () => {
    // 제목 텍스트는 topbar(role="banner") 안에서만 찾는다 — "teameet"/"대회"는
    // DesktopNav 브랜드 링크·탭 라벨·DesktopFooter 워드마크에도 항상(라우트 무관) 등장하는
    // 문자열이라 screen 전체를 getByText로 찾으면 여러 매치로 거짓 실패한다.
    mockPathname = '/home';
    const { rerender } = render(<AppShellFrame><div /></AppShellFrame>);
    expect(within(screen.getByRole('banner')).getByText('teameet')).toBeInTheDocument();

    mockPathname = '/tournaments';
    rerender(<AppShellFrame><div /></AppShellFrame>);
    expect(within(screen.getByRole('banner')).getByText('대회')).toBeInTheDocument();
    const tournamentsTab = screen
      .getByRole('navigation', { name: '주요 메뉴' })
      .querySelector('[href="/tournaments"]');
    expect(tournamentsTab).toHaveAttribute('aria-current', 'page');
  });

  it('override의 backHref가 route-chrome 테이블의 backHref를 이긴다', () => {
    mockPathname = '/campaign-fixture';
    function PageWithBackHrefOverride() {
      useShellOverride({ backHref: '/custom-back' });
      return <div>캠페인 콘텐츠</div>;
    }
    render(
      <AppShellFrame>
        <PageWithBackHrefOverride />
      </AppShellFrame>,
    );

    // 테이블 값('/tournaments')이 아니라 override 값('/custom-back')이 실제 링크에
    // 반영돼야 한다 — app-shell-frame.tsx의 `override.backHref ?? chrome.backHref` 배선을
    // 지우면(예: chrome.backHref만 쓰도록 되돌리면) 이 assertion이 '/tournaments'를 보고
    // red가 된다.
    const backLink = within(screen.getByRole('banner')).getByRole('link', { name: '뒤로가기' });
    expect(backLink).toHaveAttribute('href', '/custom-back');
  });

  // 대조군 — 이 기법이 실제로 변별력이 있는지 확인한다(§3.3).
  it('[대조군] 페이지가 각자 AppChrome을 직접 렌더하던 예전 방식은 이 성질을 만족하지 못한다', () => {
    function OldStyleHomePage() {
      return <AppChrome title="teameet" activeTab="home"><div>홈</div></AppChrome>;
    }
    function OldStyleTournamentsPage() {
      return <AppChrome title="대회" activeTab="tournaments"><div>대회</div></AppChrome>;
    }

    const { rerender } = render(<OldStyleHomePage />);
    const bottomNavBefore = screen.getByRole('navigation', { name: '주요 메뉴' });

    // 컴포넌트 함수 자체가 바뀐다 — 오늘 실제로 라우트가 바뀔 때 Next가 하는 일과 같다
    // (HomePage와 TournamentsPage는 서로 다른 모듈의 서로 다른 함수다).
    rerender(<OldStyleTournamentsPage />);
    const bottomNavAfter = screen.getByRole('navigation', { name: '주요 메뉴' });

    expect(bottomNavAfter).not.toBe(bottomNavBefore);
  });
});
