import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NotificationsPageClient } from './community-api-clients';

// useV1MyMatchesInfinite/my-matches-client.test.tsx와 동일한 "더 보기" 무한 목록 테스트 패턴.
const mock = vi.hoisted(() => ({
  query: vi.fn(),
  fetchNextPage: vi.fn(),
  readMutate: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-v1-api')>();
  return {
    ...actual,
    useV1NotificationsInfinite: mock.query,
    useV1ReadNotification: () => ({ mutate: mock.readMutate }),
    useV1ReadAllNotifications: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

vi.mock('next/navigation', () => ({
  usePathname: () => '/notifications',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

function notif(overrides: Record<string, unknown> = {}) {
  return {
    notificationId: 'n1',
    type: 'inquiry',
    title: '제목',
    body: null,
    target: { type: 'inquiry', id: 't1', route: '/my/inquiries/t1' },
    status: 'created',
    readAt: null,
    createdAt: '2026-09-25T00:00:00.000Z',
    ...overrides,
  };
}

function baseQuery(overrides: Record<string, unknown> = {}) {
  return {
    isPending: false,
    isError: false,
    isFetching: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    hasNextPage: false,
    fetchNextPage: mock.fetchNextPage,
    refetch: vi.fn(),
    ...overrides,
  };
}

describe('알림 목록 "더 보기"', () => {
  it('다음 페이지가 있으면 버튼이 보이고, 누르면 다음 페이지를 요청한다', () => {
    mock.query.mockReturnValue(baseQuery({
      data: { pages: [{ unreadCount: 1, items: [notif()] }] },
      hasNextPage: true,
    }));
    render(<NotificationsPageClient />);
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    expect(mock.fetchNextPage).toHaveBeenCalledOnce();
  });

  // 더 보기 실패로 isError 가 켜져도 이미 받은 알림은 그대로 두고, 다시 불러오기만 안내한다.
  it('다음 페이지를 불러오다 실패해도 기존 목록을 지우지 않는다', () => {
    mock.query.mockReturnValue(baseQuery({
      data: { pages: [{ unreadCount: 1, items: [notif({ title: '남아 있어야 할 알림' })] }] },
      hasNextPage: true,
      isError: true,
      isFetchNextPageError: true,
    }));
    render(<NotificationsPageClient />);
    expect(screen.getByText('남아 있어야 할 알림')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('이전 알림을 불러오지 못했어요');
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeTruthy();
  });

  it('다음 페이지가 없으면 버튼을 숨긴다', () => {
    mock.query.mockReturnValue(baseQuery({
      data: { pages: [{ unreadCount: 0, items: [notif()] }] },
      hasNextPage: false,
    }));
    render(<NotificationsPageClient />);
    expect(screen.queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument();
  });

  it('안읽은 카드는 탭하면 읽음 처리하고, 이미 읽은 카드는 처리하지 않는다', () => {
    mock.query.mockReturnValue(baseQuery({
      data: {
        pages: [{
          unreadCount: 1,
          items: [
            notif({ notificationId: 'unread-1', title: '새 소식 도착' }),
            notif({ notificationId: 'read-1', title: '지난 알림 확인함', status: 'read', readAt: '2026-09-24T00:00:00.000Z' }),
          ],
        }],
      },
    }));
    render(<NotificationsPageClient />);
    fireEvent.click(screen.getByRole('button', { name: /새 소식 도착/ }));
    expect(mock.readMutate).toHaveBeenCalledWith('unread-1');
    mock.readMutate.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /지난 알림 확인함/ }));
    expect(mock.readMutate).not.toHaveBeenCalled();
  });

  it('여러 페이지를 이어 붙여도 날짜 그룹이 유지된다', () => {
    mock.query.mockReturnValue(baseQuery({
      data: {
        pages: [
          { unreadCount: 1, items: [notif({ notificationId: 'today-1', title: '오늘 알림', createdAt: new Date().toISOString() })] },
          { unreadCount: 1, items: [notif({ notificationId: 'old-1', title: '예전 알림', createdAt: '2020-01-01T00:00:00.000Z' })] },
        ],
      },
      hasNextPage: true,
    }));
    render(<NotificationsPageClient />);
    expect(screen.getByText('오늘')).toBeInTheDocument();
    expect(screen.getByText('오늘 알림')).toBeInTheDocument();
    expect(screen.getByText('예전 알림')).toBeInTheDocument();
  });
});
