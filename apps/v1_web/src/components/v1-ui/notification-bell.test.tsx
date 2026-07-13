import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useV1NotificationUnreadSummary } from '@/hooks/use-v1-api';
import { NotificationBellLink, buildAriaLabel, formatUnreadCount } from './notification-bell';

vi.mock('@/hooks/use-v1-api', () => ({
  useV1NotificationUnreadSummary: vi.fn(),
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
});
