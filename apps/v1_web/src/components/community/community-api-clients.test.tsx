import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationsViewModel } from './community.types';
import { ChatRoomPageClient, NotificationsPageClient } from './community-api-clients';

const router = vi.hoisted(() => ({
  push: vi.fn(),
}));

const hooks = vi.hoisted(() => ({
  notifications: vi.fn(),
  readNotification: vi.fn(),
  readAllNotifications: vi.fn(),
  chatRooms: vi.fn(),
  updateChatRoomMe: vi.fn(),
  chatRoom: vi.fn(),
  chatMessages: vi.fn(),
  sendChatMessage: vi.fn(),
  updateMyChatRoom: vi.fn(),
}));

const analytics = vi.hoisted(() => ({
  trackEvent: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: analytics.trackEvent,
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-v1-api')>();
  return {
    ...actual,
    useV1Notifications: hooks.notifications,
    useV1ReadNotification: hooks.readNotification,
    useV1ReadAllNotifications: hooks.readAllNotifications,
    useV1ChatRooms: hooks.chatRooms,
    useV1UpdateChatRoomMe: hooks.updateChatRoomMe,
    useV1ChatRoom: hooks.chatRoom,
    useV1ChatMessages: hooks.chatMessages,
    useV1SendChatMessage: hooks.sendChatMessage,
    useV1UpdateMyChatRoom: hooks.updateMyChatRoom,
  };
});

// 알림 도메인의 chrome(AppChrome, 하단 nav 등)은 이 테스트의 관심사가 아니므로
// 모델을 그대로 노출하는 최소 stub view로 교체해 onOpen 트리거만 검증한다.
// ChatRoomPageView/ChatListPageView는 실제 구현을 그대로 써야
// "조회 실패 시 mock 채팅이 새는" 렌더 버그를 검증할 수 있다 — stub하지 않는다.
vi.mock('./community-page', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./community-page')>();
  return {
    ...actual,
    NotificationsPageView: ({ model }: { model: NotificationsViewModel }) => (
      <div>
        {model.notifications.map((notification) => (
          <button key={notification.id} type="button" onClick={() => model.onOpen?.(notification)}>
            {notification.title}
          </button>
        ))}
      </div>
    ),
  };
});

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('NotificationsPageClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hooks.readAllNotifications.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  it('tracks notification_click with the raw notification type when a notification is opened', () => {
    hooks.readNotification.mockReturnValue({ mutate: vi.fn() });
    hooks.notifications.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        unreadCount: 1,
        items: [
          {
            notificationId: 'notif-1',
            type: 'team_application_accepted',
            title: '팀 가입 신청이 수락됐어요',
            body: null,
            target: { type: 'team', id: 'team-1', route: '/teams/team-1' },
            status: 'created',
            readAt: null,
            createdAt: '2026-07-18T00:00:00.000Z',
          },
        ],
      },
    });

    renderWithClient(<NotificationsPageClient />);

    fireEvent.click(screen.getByText('팀 가입 신청이 수락됐어요'));

    expect(analytics.trackEvent).toHaveBeenCalledWith('notification_click', {
      type: 'team_application_accepted',
    });
  });
});

describe('ChatRoomPageClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 데스크톱 목록 pane(useChatListPageModel)이 내부적으로 쓰는 훅들 — 이 스위트의 관심사가 아니므로 안정된 빈 상태로 고정.
    hooks.chatRooms.mockReturnValue({ data: { items: [] }, isPending: false, isError: false, refetch: vi.fn() });
    hooks.updateChatRoomMe.mockReturnValue({ isPending: false, variables: undefined, mutate: vi.fn() });
    hooks.sendChatMessage.mockReturnValue({ isPending: false, isError: false, mutate: vi.fn() });
    hooks.updateMyChatRoom.mockReturnValue({ isPending: false, mutate: vi.fn() });
  });

  it('shows a real error state — never the hardcoded mock room/messages — when the room fetch fails', () => {
    hooks.chatRoom.mockReturnValue({ data: undefined, isPending: false, isError: true, refetch: vi.fn() });
    hooks.chatMessages.mockReturnValue({ data: undefined, isPending: false, isError: true, refetch: vi.fn() });

    renderWithClient(<ChatRoomPageClient roomId="room-real-from-notification" />);

    expect(screen.getAllByText('채팅방을 불러오지 못했어요').length).toBeGreaterThan(0);

    // community.view-model.ts의 하드코딩된 placeholder가 에러 상태에서도 새면, 조회가 실패한 채팅방이
    // 마치 실제 다른 채팅방("주말 풋살 매치")처럼 보이는 버그가 재현된다 — 알파에서 실제로 발생했다.
    expect(screen.queryByText('주말 풋살 매치')).not.toBeInTheDocument();
    expect(screen.queryByText('오늘 14:00 경기 인원 확인해 주세요')).not.toBeInTheDocument();
    expect(screen.queryByText('수아님이 참가 승인됐어요')).not.toBeInTheDocument();
  });

  it('still shows the placeholder conversation while the room is loading (documented loading-only behavior)', () => {
    hooks.chatRoom.mockReturnValue({ data: undefined, isPending: true, isError: false, refetch: vi.fn() });
    hooks.chatMessages.mockReturnValue({ data: undefined, isPending: true, isError: false, refetch: vi.fn() });

    renderWithClient(<ChatRoomPageClient roomId="room-real-from-notification" />);

    expect(screen.getAllByText('주말 풋살 매치').length).toBeGreaterThan(0);
  });
});
