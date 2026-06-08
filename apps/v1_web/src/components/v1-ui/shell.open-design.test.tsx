import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AppChrome } from './shell';

describe('AppChrome Open Design shell contract', () => {
  it('renders desktop navigation, top search, create CTA, and preserves mobile bottom nav', () => {
    const { container } = render(
      <AppChrome title="홈" activeTab="matches" showSearch>
        <div>본문</div>
      </AppChrome>,
    );

    const desktopNav = screen.getByLabelText('데스크탑 주요 메뉴');
    expect(desktopNav).toHaveClass('tm-desktop-nav');
    expect(within(desktopNav).getByText('teameet')).toBeInTheDocument();
    expect(within(desktopNav).getByRole('link', { name: '매치' })).toHaveAttribute('aria-current', 'page');
    expect(within(desktopNav).getByRole('link', { name: '매치 만들기' })).toHaveAttribute('href', '/matches/new');

    expect(container.firstElementChild).toHaveClass('tm-app-frame-wide');
    expect(screen.getByRole('searchbox', { name: '통합 검색' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '주요 메뉴' })).toHaveClass('tm-bottom-nav');
    expect(screen.getByRole('main')).toHaveClass('tm-scroll-area');
  });

  it('uses the responsive wide frame for immersive routes without bottom navigation', () => {
    const { container } = render(
      <AppChrome title="채팅" activeTab="my" bottomNav={false}>
        <div>대화</div>
      </AppChrome>,
    );

    expect(container.firstElementChild).toHaveClass('tm-app-frame-wide');
    expect(screen.queryByRole('navigation', { name: '주요 메뉴' })).not.toBeInTheDocument();
  });

  it('renders admin desktop navigation as a customer operations workspace', () => {
    render(
      <AppChrome title="운영 ERP" desktopNav="admin" adminActiveTab="teamMatches" bottomNav={false} showSearch={false} showNotifications={false}>
        <div>운영 본문</div>
      </AppChrome>,
    );

    const adminNav = screen.getByLabelText('운영 워크스페이스 메뉴');
    expect(adminNav).toHaveClass('tm-desktop-nav');
    expect(adminNav).toHaveClass('tm-desktop-nav-operations');
    expect(adminNav).toHaveClass('tm-desktop-nav-admin');
    expect(adminNav).not.toHaveClass('tm-desktop-nav-ops-dark');
    expect(within(adminNav).getByText('teameet 운영')).toBeInTheDocument();
    expect(within(adminNav).getByRole('link', { name: '팀매치' })).toHaveAttribute('aria-current', 'page');
    expect(within(adminNav).getByRole('link', { name: '워크스페이스' })).toHaveAttribute('href', '/admin');
    expect(within(adminNav).getByRole('link', { name: '개인 매치' })).toHaveAttribute('href', '/admin/matches');
    expect(within(adminNav).getByRole('link', { name: '팀매치' })).toHaveAttribute('href', '/admin/team-matches');
    expect(within(adminNav).getByRole('link', { name: '팀 운영' })).toHaveAttribute('href', '/admin/teams');
    expect(within(adminNav).getByRole('link', { name: '리뷰' })).toHaveAttribute('href', '/admin/reviews');
    expect(within(adminNav).getByRole('link', { name: '알림' })).toHaveAttribute('href', '/admin/notifications');
    expect(within(adminNav).getByRole('link', { name: '업무 이력' })).toHaveAttribute('href', '/admin/audit');
    expect(within(adminNav).queryByRole('link', { name: /매치 만들기/ })).not.toBeInTheDocument();
    expect(within(adminNav).queryByRole('link', { name: /감사 로그/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '주요 메뉴' })).not.toBeInTheDocument();
  });

  it('renders ops desktop navigation as an internal operator console', () => {
    render(
      <AppChrome title="내부 운영" desktopNav="ops" opsActiveTab="payments" bottomNav={false} showSearch={false} showNotifications={false}>
        <div>ops 본문</div>
      </AppChrome>,
    );

    const opsNav = screen.getByLabelText('내부 운영 콘솔 메뉴');
    expect(opsNav).toHaveClass('tm-desktop-nav');
    expect(opsNav).toHaveClass('tm-desktop-nav-operations');
    expect(opsNav).toHaveClass('tm-desktop-nav-ops');
    expect(opsNav).not.toHaveClass('tm-desktop-nav-ops-dark');
    expect(within(opsNav).getByText('teameet ops')).toBeInTheDocument();
    expect(within(opsNav).getByRole('link', { name: '결제·환불' })).toHaveAttribute('aria-current', 'page');
    expect(within(opsNav).getByRole('link', { name: '상황판' })).toHaveAttribute('href', '/ops');
    expect(within(opsNav).getByRole('link', { name: '신고' })).toHaveAttribute('href', '/ops/reports');
    expect(within(opsNav).getByRole('link', { name: '분쟁' })).toHaveAttribute('href', '/ops/disputes');
    expect(within(opsNav).getByRole('link', { name: '결제·환불' })).toHaveAttribute('href', '/ops/payments');
    expect(within(opsNav).getByRole('link', { name: '정산·지급' })).toHaveAttribute('href', '/ops/settlements');
    expect(within(opsNav).getByRole('link', { name: '감사 이력' })).toHaveAttribute('href', '/ops/audit');
    expect(within(opsNav).queryByRole('link', { name: /개인 매치/ })).not.toBeInTheDocument();
  });
});
