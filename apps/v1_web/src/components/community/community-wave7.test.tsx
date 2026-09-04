import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatListPageView, ChatRoomPageView, NotificationsPageView } from './community-page';
import type { ChatListViewModel, ChatRoomViewModel, NotificationsViewModel } from './community.types';

vi.mock('next/navigation', () => ({
  usePathname: () => '/chat',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const emptyChatList: ChatListViewModel = {
  categories: [{ label: '전체', active: true }],
  pinnedRooms: [],
  rooms: [],
  status: 'ready',
  emptyHref: '/matches',
};

describe('채팅 목록 빈 상태', () => {
  // 이 뷰는 모바일 pane 과 데스크톱 workspace 두 벌을 함께 그린다(CSS 로 한쪽만 보인다).
  // 그래서 단언은 pane 안으로 좁히고, 두 벌 다 같은 행동을 제공하는지 개수로 따로 확인한다.
  it('다음 행동을 링크로 준다 — window.location 전체 새로고침이 아니라 앱 안에서 이동한다', () => {
    const { container } = renderWithClient(<ChatListPageView model={emptyChatList} />);

    const pane = container.querySelector('.tm-chat-mobile-pane') as HTMLElement;
    expect(within(pane).getByRole('link', { name: '매치 찾아보기' })).toHaveAttribute('href', '/matches');
    expect(screen.getAllByRole('link', { name: '매치 찾아보기' })).toHaveLength(2);
  });

  it('그래픽을 함께 보여준다', () => {
    const { container } = renderWithClient(<ChatListPageView model={emptyChatList} />);

    expect(container.querySelector('.tm-empty-illustration')).not.toBeNull();
  });

  it('실패는 빈 상태가 아니라 경고 + 다시 불러오기로 나온다', () => {
    const onRetry = vi.fn();
    const { container } = renderWithClient(<ChatListPageView model={{ ...emptyChatList, status: 'error', onRetry }} />);

    const pane = within(container.querySelector('.tm-chat-mobile-pane') as HTMLElement);
    expect(pane.getByRole('alert')).toHaveTextContent('채팅방을 불러오지 못했어요');
    fireEvent.click(pane.getByRole('button', { name: '다시 불러오기' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

const emptyRoom: ChatRoomViewModel = {
  title: '테스트 방',
  context: { title: '연습 경기', sub: '7월 26일', href: '/matches/m-1' },
  messages: [],
  status: 'ready',
};

describe('채팅방 빈 상태', () => {
  it('첫 메시지를 유도하는 그래픽을 보여준다', () => {
    const { container } = renderWithClient(
      <ChatRoomPageView listModel={emptyChatList} model={emptyRoom} roomId="room-1" />,
    );

    expect(screen.getByText('아직 메시지가 없어요')).toBeInTheDocument();
    expect(container.querySelector('.tm-empty-illustration')).not.toBeNull();
  });

  it('메시지 로드 실패는 경고 + 다시 불러오기로 나온다', () => {
    const onRetry = vi.fn();
    renderWithClient(
      <ChatRoomPageView listModel={emptyChatList} model={{ ...emptyRoom, status: 'error', onRetry }} roomId="room-1" />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('메시지를 불러오지 못했어요');
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

const emptyNotifications: NotificationsViewModel = { status: 'ready', unreadCount: 0, notifications: [] };

describe('알림 빈 상태', () => {
  it('막다른 길로 두지 않고 매치로 가는 링크를 준다', () => {
    renderWithClient(<NotificationsPageView model={emptyNotifications} />);

    expect(screen.getByRole('link', { name: '매치 둘러보기' })).toHaveAttribute('href', '/matches');
  });

  it('알림 로드 실패는 경고 + 다시 불러오기로 나온다', () => {
    const onRetry = vi.fn();
    renderWithClient(<NotificationsPageView model={{ ...emptyNotifications, status: 'error', onRetry }} />);

    expect(screen.getByRole('alert')).toHaveTextContent('알림을 불러오지 못했어요');
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
