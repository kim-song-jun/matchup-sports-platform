import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useV1NotificationUnreadSummary } from '@/hooks/use-v1-api';
import { NotificationBellLink, buildAriaLabel, formatUnreadCount } from './notification-bell';

vi.mock('@/hooks/use-v1-api', () => ({
  useV1NotificationUnreadSummary: vi.fn(),
}));

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

const useV1NotificationUnreadSummaryMock = vi.mocked(useV1NotificationUnreadSummary);

function mockUnreadCount(unreadCount: number) {
  useV1NotificationUnreadSummaryMock.mockReturnValue({
    data: { unreadCount },
  } as ReturnType<typeof useV1NotificationUnreadSummary>);
}

describe('formatUnreadCount', () => {
  it.each([
    [0, '0'],
    [1, '1'],
    [50, '50'],
    [99, '99'],
    [100, '99+'],
    [150, '99+'],
  ])('formats %i unread notifications as "%s"', (count, expected) => {
    expect(formatUnreadCount(count)).toBe(expected);
  });
});

describe('buildAriaLabel', () => {
  it('returns the original label unchanged when there are no unread notifications', () => {
    expect(buildAriaLabel('알림', 0)).toBe('알림');
  });

  it('appends the unread count for a small count', () => {
    expect(buildAriaLabel('알림', 3)).toBe('알림 (읽지 않은 알림 3개)');
  });

  it('caps the appended count at "99+" for large unread counts', () => {
    expect(buildAriaLabel('알림', 150)).toContain('99+개');
  });
});

describe('NotificationBellLink', () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/');
    window.localStorage.clear();
  });

  it('서버 HTML 과 마운트 뒤 DOM 모두 알림 링크에 출처 꼬리를 싣지 않는다', () => {
    window.history.replaceState(null, '', '/my/matches/joined?type=team&from=%2Fmy');
    mockUnreadCount(0);
    const serverHtml = renderToStaticMarkup(<NotificationBellLink className="bell" />);
    expect(new DOMParser().parseFromString(serverHtml, 'text/html').querySelector('a')?.getAttribute('href'))
      .toBe('/notifications');
    render(<NotificationBellLink className="bell" />);
    expect(screen.getByRole('link', { name: '알림' })).toHaveAttribute('href', '/notifications');
  });

  it('알림 진입 때 출발 화면의 필터와 이전 출처를 클릭 시점에 출처로 붙인다', () => {
    window.history.replaceState(null, '', '/my/matches/joined?type=team&from=%2Fmy#joined');
    mockUnreadCount(0);
    render(<NotificationBellLink className="bell" />);
    fireEvent.click(screen.getByRole('link', { name: '알림' }));
    expect(router.push).toHaveBeenCalledTimes(1);
    const target = new URL(router.push.mock.calls[0][0] as string, 'https://teameet.test');
    expect(target.pathname).toBe('/notifications');
    expect(target.searchParams.get('from')).toBe('/my/matches/joined?type=team&from=%2Fmy#joined');
  });

  it('쿼리가 없는 화면은 현재 경로만 출처로 붙인다', () => {
    window.history.replaceState(null, '', '/my');
    mockUnreadCount(0);
    render(<NotificationBellLink className="bell" />);
    fireEvent.click(screen.getByRole('link', { name: '알림' }));
    expect(router.push).toHaveBeenCalledWith('/notifications?from=%2Fmy');
  });

  it('does not request the protected unread summary without a stored session', () => {
    mockUnreadCount(0);

    render(<NotificationBellLink className="bell" />);

    expect(useV1NotificationUnreadSummaryMock).toHaveBeenCalledWith({ enabled: false });
  });

  it('enables the unread summary after detecting a stored session', async () => {
    window.localStorage.setItem('teameet.v1.userId', 'user-1');
    mockUnreadCount(0);

    render(<NotificationBellLink className="bell" />);

    await waitFor(() => {
      expect(useV1NotificationUnreadSummaryMock).toHaveBeenCalledWith({ enabled: true });
    });
  });

  it('renders the numeric unread badge and includes the count in the aria-label', () => {
    mockUnreadCount(5);

    render(<NotificationBellLink className="bell" />);

    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '알림 (읽지 않은 알림 5개)' })).toBeInTheDocument();
  });

  it('hides the unread badge and keeps the plain aria-label when there are no unread notifications', () => {
    mockUnreadCount(0);

    render(<NotificationBellLink className="bell" />);

    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '알림' })).toBeInTheDocument();
  });

  it('renders a plain dot instead of the numeric badge when dotClassName is provided', () => {
    mockUnreadCount(5);

    render(<NotificationBellLink className="bell" dotClassName="dot" />);

    expect(screen.queryByText('5')).not.toBeInTheDocument();
    const dot = screen.getByRole('link').querySelector('.dot');
    expect(dot).toBeInTheDocument();
    expect(dot).toHaveAttribute('aria-hidden', 'true');
    expect(dot).toBeEmptyDOMElement();
  });

  it('shows a generic indicator instead of a fabricated "1" when forceUnread fires before the real count loads', () => {
    mockUnreadCount(0);

    render(<NotificationBellLink className="bell" forceUnread />);

    expect(screen.queryByText('1')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '알림 (읽지 않은 알림 있음)' })).toBeInTheDocument();
    const indicator = screen.getByRole('link').querySelector('.tm-unread-dot');
    expect(indicator).toBeInTheDocument();
  });

  it('uses unknownDotClassName (not the default .tm-unread-dot) for the count-unknown state when a caller anchors its badge elsewhere', () => {
    mockUnreadCount(0);

    render(
      <NotificationBellLink
        className="bell"
        forceUnread
        badgeClassName="tm-desktop-nav-badge"
        unknownDotClassName="tm-desktop-nav-dot"
      />,
    );

    const link = screen.getByRole('link');
    expect(link.querySelector('.tm-desktop-nav-dot')).toBeInTheDocument();
    expect(link.querySelector('.tm-unread-dot')).not.toBeInTheDocument();
  });

  it('shows the real numeric badge (not the generic indicator) once the count is known, even with forceUnread set', () => {
    mockUnreadCount(7);

    render(<NotificationBellLink className="bell" forceUnread />);

    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '알림 (읽지 않은 알림 7개)' })).toBeInTheDocument();
  });
});
