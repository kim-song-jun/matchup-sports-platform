import { cleanup, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ChatListPageView, ChatRoomPageView, NotificationsPageView } from './community-page';
import { getChatListViewModel, getChatRoomViewModel, getNotificationsViewModel } from './community.view-model';

function expectRuntimeLinksOnly(container: HTMLElement) {
  const links = within(container).queryAllByRole('link');
  expect(links.length).toBeGreaterThan(0);
  for (const link of links) {
    const href = link.getAttribute('href') ?? '';
    expect(href).not.toContain('.html');
    expect(href).not.toBe('#');
  }
}

describe('community Open Design contract', () => {
  it('renders chat list, room, and notifications with supported v1 links', () => {
    render(<ChatListPageView model={getChatListViewModel()} />);

    const chatPage = screen.getByTestId('chat-open-design');
    expect(chatPage).toHaveClass('tm-chat-open-design');
    expect(chatPage).toHaveClass('tm-community-desktop-workbench');
    expect(within(chatPage).getByText('커뮤니티 요약')).toBeInTheDocument();
    expect(within(chatPage).getByText('토픽 큐')).toBeInTheDocument();
    expect(within(chatPage).getByText('작성 관리')).toBeInTheDocument();
    expect(within(chatPage).getByRole('banner')).toHaveClass('tm-page-header');
    expect(within(chatPage).getByTestId('chat-filter-rail')).toHaveClass('tm-filter-rail');
    expectRuntimeLinksOnly(chatPage);

    cleanup();
    render(<ChatRoomPageView model={getChatRoomViewModel()} />);
    const chatRoom = screen.getByTestId('chat-room-open-design');
    expect(chatRoom).toHaveClass('tm-chat-room-open-design');
    expect(within(chatRoom).getByText('개인매치 상세조회')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('메시지 입력')).toBeInTheDocument();
    expectRuntimeLinksOnly(chatRoom);

    cleanup();
    render(<NotificationsPageView model={getNotificationsViewModel()} />);
    const notifications = screen.getByTestId('notifications-open-design');
    expect(notifications).toHaveClass('tm-notifications-open-design');
    expect(within(notifications).getByText('매치 참가 확정')).toBeInTheDocument();
    expect(within(notifications).getByRole('button', { name: '모두읽음' })).toBeDisabled();
    expectRuntimeLinksOnly(notifications);
  });
});
