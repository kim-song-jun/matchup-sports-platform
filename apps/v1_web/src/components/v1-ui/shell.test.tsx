import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useV1NotificationUnreadSummary } from '@/hooks/use-v1-api';
import { AppChrome } from './shell';

// AppChrome은 항상 DesktopNav를 렌더하고, DesktopNav는 조건 없이 NotificationBellLink를
// 그린다 — 그 컴포넌트가 react-query 훅(useV1NotificationUnreadSummary)을 호출하므로
// QueryClientProvider를 두르는 대신 훅 자체를 목킹한다(notification-bell.test.tsx와
// 동일 패턴).
vi.mock('@/hooks/use-v1-api', () => ({
  useV1NotificationUnreadSummary: vi.fn(() => ({ data: { unreadCount: 0 } })),
}));

const EXPECTED_TABS: Array<{ label: string; href: string }> = [
  { label: '홈', href: '/home' },
  { label: '매치', href: '/matches' },
  { label: '대회', href: '/tournaments' },
  { label: '리그', href: '/league-matches' },
  { label: '팀', href: '/teams' },
  { label: '마이', href: '/my' },
];

describe('AppChrome bottom nav — D5 리그 탭 분리', () => {
  it('탭이 6개이고 각 href가 기대한 경로다', () => {
    render(
      <AppChrome title="테스트" showNotifications={false}>
        <div>본문</div>
      </AppChrome>
    );

    const nav = screen.getByRole('navigation', { name: '주요 메뉴' });
    const links = within(nav).getAllByRole('link');

    expect(links).toHaveLength(EXPECTED_TABS.length);
    EXPECTED_TABS.forEach(({ label, href }, index) => {
      expect(links[index]).toHaveTextContent(label);
      expect(links[index]).toHaveAttribute('href', href);
    });
  });

  it('리그 화면(activeTab="league")에서 리그 탭만 aria-current="page"로 활성화된다', () => {
    render(
      <AppChrome title="정규 리그" activeTab="league" showNotifications={false}>
        <div>본문</div>
      </AppChrome>
    );

    const nav = screen.getByRole('navigation', { name: '주요 메뉴' });
    const links = within(nav).getAllByRole('link');

    const leagueLink = links.find((link) => link.getAttribute('href') === '/league-matches');
    expect(leagueLink).toHaveAttribute('aria-current', 'page');

    const otherLinks = links.filter((link) => link.getAttribute('href') !== '/league-matches');
    otherLinks.forEach((link) => {
      expect(link).not.toHaveAttribute('aria-current');
    });
  });

  it('대회 화면(activeTab="tournaments")에서는 대회 탭만 활성화되고 리그 탭은 활성화되지 않는다', () => {
    render(
      <AppChrome title="대회" activeTab="tournaments" showNotifications={false}>
        <div>본문</div>
      </AppChrome>
    );

    const nav = screen.getByRole('navigation', { name: '주요 메뉴' });
    const tournamentsLink = within(nav).getByRole('link', { name: /대회/ });
    const leagueLink = within(nav).getByRole('link', { name: /리그/ });

    expect(tournamentsLink).toHaveAttribute('aria-current', 'page');
    expect(leagueLink).not.toHaveAttribute('aria-current');
  });
});

describe('useV1NotificationUnreadSummary mock wiring', () => {
  it('테스트 환경에서 실제 네트워크 훅 대신 목이 호출된다', () => {
    render(
      <AppChrome title="테스트">
        <div>본문</div>
      </AppChrome>
    );
    expect(vi.mocked(useV1NotificationUnreadSummary)).toHaveBeenCalled();
  });
});
