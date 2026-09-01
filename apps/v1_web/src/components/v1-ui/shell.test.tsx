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
  { label: '팀', href: '/teams' },
  { label: '마이', href: '/my' },
];

describe('AppChrome bottom nav — 탭 5개(리그는 대회 탭 세그먼트로)', () => {
  it('탭이 5개이고 각 href가 기대한 경로다', () => {
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

  // 이 테스트가 이 변경의 계약이다. 탭을 지우는 것만으로 끝내면 **리그가 하단 탭에서
  // 도달 불가능해지는데**, 그때 리그 화면은 아무 탭도 활성화되지 않아 사용자는 자기가
  // 어디 있는지 알 수 없다. 리그는 대회의 한 종류이므로 대회 탭이 켜져야 한다.
  it('리그 화면에서 대회 탭이 활성화된다 — 리그 전용 탭은 더 이상 없다', () => {
    render(
      <AppChrome title="정규 리그" activeTab="tournaments" showNotifications={false}>
        <div>본문</div>
      </AppChrome>
    );

    const nav = screen.getByRole('navigation', { name: '주요 메뉴' });
    const links = within(nav).getAllByRole('link');

    expect(links.some((link) => link.getAttribute('href') === '/league-matches')).toBe(false);

    const tournamentsLink = links.find((link) => link.getAttribute('href') === '/tournaments');
    expect(tournamentsLink).toHaveAttribute('aria-current', 'page');

    links
      .filter((link) => link.getAttribute('href') !== '/tournaments')
      .forEach((link) => {
        expect(link).not.toHaveAttribute('aria-current');
      });
  });
});

describe('useV1NotificationUnreadSummary mock wiring', () => {
  it('테스트 환경에서 실제 네트워크 훅 대신 목이 호출된다', () => {
    vi.mocked(useV1NotificationUnreadSummary).mockClear();
    render(
      <AppChrome title="테스트">
        <div>본문</div>
      </AppChrome>
    );
    expect(vi.mocked(useV1NotificationUnreadSummary)).toHaveBeenCalled();
  });
});

describe('AppChrome mobile page title semantics', () => {
  it('renders an opt-in page title as a level-one heading', () => {
    render(
      <AppChrome title="알림 설정" titleAsHeading showNotifications={false}>
        <div>본문</div>
      </AppChrome>
    );

    expect(screen.getByRole('heading', { level: 1, name: '알림 설정' })).toBeInTheDocument();
  });
});

describe('AppChrome 이중 마운트 가드 (§2.2 마이그레이션 안전망)', () => {
  it('AppChrome 안에 또 다른 AppChrome이 중첩되면 안쪽은 children만 통과시킨다', () => {
    render(
      <AppChrome title="바깥" activeTab="home" showNotifications={false}>
        <AppChrome title="안쪽(마이그레이션 잔재)" activeTab="matches" showNotifications={false}>
          <div data-testid="leaf">내용</div>
        </AppChrome>
      </AppChrome>,
    );

    // bottom nav가 정확히 1개 — 2개면 이중 셸이 실제로 렌더된 것(구조적 회귀).
    expect(screen.getAllByRole('navigation', { name: '주요 메뉴' })).toHaveLength(1);
    expect(screen.getByText('바깥')).toBeInTheDocument();
    expect(screen.queryByText('안쪽(마이그레이션 잔재)')).not.toBeInTheDocument();
    // 안쪽 children(leaf)은 그대로 화면에 나온다 — passthrough가 콘텐츠까지 지우지 않음.
    expect(screen.getByTestId('leaf')).toBeInTheDocument();
  });
});
