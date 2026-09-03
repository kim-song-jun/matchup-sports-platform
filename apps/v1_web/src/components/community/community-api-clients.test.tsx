import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationsViewModel } from './community.types';
import { ChatListPageClient, ChatRoomPageClient, NotificationsPageClient } from './community-api-clients';

const router = vi.hoisted(() => ({
  push: vi.fn(),
}));

// `/chat?category=team_contact` 프리셀렉트 테스트가 값을 바꿀 수 있도록 hoisted 변수로 둔다.
const navigation = vi.hoisted(() => ({
  search: '',
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

// 실시간 수신 검증용. 훅 자체의 동작은 use-v1-realtime-socket.test.tsx 가 덮으므로,
// 여기서는 "채팅방 화면이 그 훅을 실제로 마운트하는가"만 본다 — 훅이 만들어져 있어도
// 소비처가 없으면 실시간이 통째로 안 도는데, 그건 훅 테스트로는 절대 드러나지 않는다.
const socket = vi.hoisted(() => ({
  listeners: {} as Record<string, (payload: unknown) => void>,
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
}));
socket.on.mockImplementation((event: string, cb: (payload: unknown) => void) => {
  socket.listeners[event] = cb;
});

vi.mock('@/lib/v1-socket', () => ({ getV1Socket: () => socket }));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(navigation.search),
  // U34(community 이관) 이후 ChatRoomPageView/NotificationsPageView가 useShellOverride를
  // 직접 호출해(community-page.tsx) usePathname을 필요로 한다 — 이 테스트는 AppShellFrame을
  // 거치지 않고 뷰를 직접 렌더하므로(renderWithClient) 값 자체는 검증 대상이 아니다.
  usePathname: () => '/chat/room-1',
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
  // wrapper 옵션이어야 rerender 도 같은 QueryClientProvider 안에서 다시 그려진다.
  return render(ui, {
    wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  });
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

  it('채팅방을 열면 실시간 수신을 구독하고, 나가면 해제한다', () => {
    // 훅은 만들어져 있었지만 어디에도 마운트되지 않아, 열어 둔 채팅방에 새 메시지가
    // 실시간으로 들어오지 않았다(30초 stale 이 지난 뒤 창 포커스 전환에만 의존).
    // 훅 자체를 아무리 테스트해도 "아무도 안 쓴다"는 드러나지 않는다.
    hooks.chatRoom.mockReturnValue({ data: undefined, isPending: true, isError: false, refetch: vi.fn() });
    hooks.chatMessages.mockReturnValue({ data: undefined, isPending: true, isError: false, refetch: vi.fn() });

    const { unmount } = renderWithClient(<ChatRoomPageClient roomId="room-live" />);

    expect(socket.on).toHaveBeenCalledWith('chat:message', expect.any(Function));

    unmount();
    expect(socket.off).toHaveBeenCalledWith('chat:message', expect.any(Function));
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

  it('shows one timestamp at the bottom of each same-sender, same-minute run', () => {
    hooks.chatRoom.mockReturnValue({
      data: {
        roomId: 'room-times',
        roomType: 'team',
        status: 'active',
        title: 'Timestamp test',
        linkedTarget: { type: 'team', id: 'team-1', title: 'Test team', route: '/teams/team-1' },
        me: {
          participantId: 'participant-me',
          status: 'active',
          pinned: false,
          mutedUntil: null,
          lastReadMessageId: null,
        },
        participants: [],
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    hooks.chatMessages.mockReturnValue({
      data: {
        items: [
          {
            messageId: 'other-1',
            sender: { userId: 'user-other', displayName: 'Other', profileImageUrl: null },
            messageType: 'text',
            content: 'Other first',
            status: 'sent',
            sentAt: '2026-08-31T09:01:00.000Z',
            mine: false,
          },
          {
            messageId: 'other-2',
            sender: { userId: 'user-other', displayName: 'Other', profileImageUrl: null },
            messageType: 'text',
            content: 'Other second',
            status: 'sent',
            sentAt: '2026-08-31T09:01:45.000Z',
            mine: false,
          },
          {
            messageId: 'other-3',
            sender: { userId: 'user-other', displayName: 'Other', profileImageUrl: null },
            messageType: 'text',
            content: 'Other third',
            status: 'sent',
            sentAt: '2026-08-31T09:02:00.000Z',
            mine: false,
          },
          {
            messageId: 'mine-1',
            sender: { userId: 'user-me', displayName: 'Me', profileImageUrl: null },
            messageType: 'text',
            content: 'Mine first',
            status: 'sent',
            sentAt: '2026-08-31T09:03:00.000Z',
            mine: true,
          },
          {
            messageId: 'mine-2',
            sender: { userId: 'user-me', displayName: 'Me', profileImageUrl: null },
            messageType: 'text',
            content: 'Mine second',
            status: 'sent',
            sentAt: '2026-08-31T09:03:45.000Z',
            mine: true,
          },
          {
            messageId: 'mine-3',
            sender: { userId: 'user-me', displayName: 'Me', profileImageUrl: null },
            messageType: 'text',
            content: 'Mine third',
            status: 'sent',
            sentAt: '2026-08-31T09:04:00.000Z',
            mine: true,
          },
        ],
        nextCursor: null,
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderWithClient(<ChatRoomPageClient roomId={'room-times'} />);

    expect(screen.getAllByText('18:01')).toHaveLength(1);
    expect(screen.getAllByText('18:02')).toHaveLength(1);
    expect(screen.getAllByText('18:03')).toHaveLength(1);
    expect(screen.getAllByText('18:04')).toHaveLength(1);
  });

  it('still shows the placeholder conversation while the room is loading (documented loading-only behavior)', () => {
    hooks.chatRoom.mockReturnValue({ data: undefined, isPending: true, isError: false, refetch: vi.fn() });
    hooks.chatMessages.mockReturnValue({ data: undefined, isPending: true, isError: false, refetch: vi.fn() });

    renderWithClient(<ChatRoomPageClient roomId="room-real-from-notification" />);

    expect(screen.getAllByText('주말 풋살 매치').length).toBeGreaterThan(0);
  });
});

function contactRoomDetail(status: 'requested' | 'accepted' | 'declined', mySide: 'from' | 'to') {
  return {
    roomId: 'room-contact',
    roomType: 'team_contact' as const,
    status: 'active',
    title: '가팀 ↔ 나팀',
    teamContact: {
      contactId: 'contact-1',
      status,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      declineReason: status === 'declined' ? '이번 주는 어려워요' : null,
      mySide,
      fromTeam: { id: 'team-a', name: '가팀' },
      toTeam: { id: 'team-b', name: '나팀' },
    },
    linkedTarget: { type: 'team_contact' as const, id: 'contact-1', title: '가팀', route: '/teams/team-a' },
    me: { participantId: 'p-me', status: 'active', pinned: false, mutedUntil: null, lastReadMessageId: null },
    participants: [],
  };
}

describe('ChatRoomPageClient — 팀컨택 방', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigation.search = '';
    hooks.chatRooms.mockReturnValue({ data: { items: [] }, isPending: false, isError: false, refetch: vi.fn() });
    hooks.updateChatRoomMe.mockReturnValue({ isPending: false, variables: undefined, mutate: vi.fn() });
    hooks.sendChatMessage.mockReturnValue({ isPending: false, isError: false, mutate: vi.fn() });
    hooks.updateMyChatRoom.mockReturnValue({ isPending: false, mutate: vi.fn() });
    hooks.chatMessages.mockReturnValue({ data: { items: [] }, isPending: false, isError: false, refetch: vi.fn() });
  });

  it('요청 중인 컨택 방은 상태 카드를 그리고 입력창을 잠근다', () => {
    hooks.chatRoom.mockReturnValue({ data: contactRoomDetail('requested', 'to'), isPending: false, isError: false, refetch: vi.fn() });

    renderWithClient(<ChatRoomPageClient roomId="room-contact" />);

    expect(screen.getByRole('region', { name: '컨택 상태' })).toBeInTheDocument();
    expect(screen.getByText('요청 대기')).toBeInTheDocument();
    const input = screen.getByLabelText('메시지 입력');
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('placeholder', '수락하면 대화할 수 있어요');
    expect(screen.getByRole('button', { name: '전송' })).toBeDisabled();
    // 받는 팀 운영진에게는 수락·거절이 보이고 철회는 없다
    expect(screen.getByRole('button', { name: '수락' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '거절' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '컨택 철회' })).not.toBeInTheDocument();
  });

  it('거절된 컨택 방은 "종료된 컨택이에요" 로 잠기고 거절 사유가 보인다', () => {
    hooks.chatRoom.mockReturnValue({ data: contactRoomDetail('declined', 'from'), isPending: false, isError: false, refetch: vi.fn() });

    renderWithClient(<ChatRoomPageClient roomId="room-contact" />);

    expect(screen.getByLabelText('메시지 입력')).toHaveAttribute('placeholder', '종료된 컨택이에요');
    expect(screen.getByText('거절 사유: 이번 주는 어려워요')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '수락' })).not.toBeInTheDocument();
  });

  it('수락된 컨택 방은 입력창이 열려 있고 액션 버튼이 없다', () => {
    hooks.chatRoom.mockReturnValue({ data: contactRoomDetail('accepted', 'from'), isPending: false, isError: false, refetch: vi.fn() });

    renderWithClient(<ChatRoomPageClient roomId="room-contact" />);

    expect(screen.getByLabelText('메시지 입력')).not.toBeDisabled();
    expect(screen.getByText('수락됨')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '수락' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '컨택 철회' })).not.toBeInTheDocument();
  });
});

describe('ChatListPageClient — 팀컨택 필터·배지', () => {
  const contactRoom = (status: 'requested' | 'accepted', mySide: 'from' | 'to') => ({
    roomId: `room-${status}-${mySide}`,
    roomType: 'team_contact' as const,
    title: '가팀 ↔ 나팀',
    status: 'active',
    teamContact: {
      contactId: 'c1', status, expiresAt: new Date(Date.now() + 86400000).toISOString(), declineReason: null, mySide,
      fromTeam: { id: 'team-a', name: '가팀' }, toTeam: { id: 'team-b', name: '나팀' },
    },
    linkedTarget: { type: 'team_contact' as const, id: 'c1', title: '가팀', route: '/teams/team-a' },
    lastMessage: null, unreadCount: 1, pinned: false, muted: false, mutedUntil: null,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    navigation.search = '';
    hooks.updateChatRoomMe.mockReturnValue({ isPending: false, variables: undefined, mutate: vi.fn() });
  });

  it('받는 팀의 미응답 요청은 "답장 필요", 보낸 팀의 요청은 "대기 중" 배지로 보인다', () => {
    hooks.chatRooms.mockReturnValue({
      data: { items: [contactRoom('requested', 'to'), contactRoom('requested', 'from'), contactRoom('accepted', 'to')] },
      isPending: false, isError: false, refetch: vi.fn(),
    });

    renderWithClient(<ChatListPageClient />);

    // 모바일 pane + 데스크톱 pane 두 번 렌더된다 — 개수가 아니라 존재만 본다.
    expect(screen.getAllByText('답장 필요').length).toBeGreaterThan(0);
    expect(screen.getAllByText('대기 중').length).toBeGreaterThan(0);
    expect(screen.getAllByText('수락됨').length).toBeGreaterThan(0);
  });

  it('팀컨택 필터에서 "종료된 컨택 보기"를 켜면 archived 방을 서버에서 받아 별도 섹션에 보여준다', () => {
    navigation.search = 'category=team_contact';
    const ended = { ...contactRoom('accepted', 'to'), roomId: 'room-ended', status: 'archived', teamContact: { ...contactRoom('accepted', 'to').teamContact, status: 'declined' as const } };
    hooks.chatRooms.mockImplementation((_opts: unknown, filters?: { status?: string }) =>
      filters?.status === 'archived'
        ? { data: { items: [ended] }, isPending: false, isError: false, refetch: vi.fn() }
        : { data: { items: [contactRoom('accepted', 'to')] }, isPending: false, isError: false, refetch: vi.fn() },
    );

    renderWithClient(<ChatListPageClient />);

    expect(screen.queryByText(/종료된 컨택 1/)).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: '종료된 컨택 보기' })[0]);

    expect(hooks.chatRooms).toHaveBeenCalledWith({ enabled: true }, { roomType: 'team_contact', status: 'archived', limit: 50 });
    expect(screen.getAllByText(/종료된 컨택 1/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('거절됨').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '종료된 컨택 숨기기' }).length).toBeGreaterThan(0);
  });

  it('활성 컨택 방이 없어도 "종료된 컨택 보기"를 켜면 빈 상태 대신 보관 목록(로딩 중 포함)을 보여준다', () => {
    navigation.search = 'category=team_contact';
    hooks.chatRooms.mockImplementation((_opts: unknown, filters?: { status?: string }) =>
      filters?.status === 'archived'
        ? { data: undefined, isPending: true, isError: false, refetch: vi.fn() }
        : { data: { items: [] }, isPending: false, isError: false, refetch: vi.fn() },
    );

    renderWithClient(<ChatListPageClient />);
    expect(screen.getAllByText('팀컨택 채팅방이 없어요').length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: '종료된 컨택 보기' })[0]);

    expect(screen.queryByText('팀컨택 채팅방이 없어요')).not.toBeInTheDocument();
    expect(screen.queryByText(/^채팅방 0$/)).not.toBeInTheDocument();
  });

  it('/chat 에 있는 채로 ?category=team_contact 로 바뀌면 필터가 따라온다', () => {
    hooks.chatRooms.mockReturnValue({ data: { items: [contactRoom('accepted', 'to')] }, isPending: false, isError: false, refetch: vi.fn() });
    const { rerender } = renderWithClient(<ChatListPageClient />);
    expect(screen.getAllByRole('button', { name: /^전체 / })[0]).toHaveAttribute('aria-pressed', 'true');

    navigation.search = 'category=team_contact';
    rerender(<ChatListPageClient />);

    expect(screen.getAllByRole('button', { name: /^팀컨택 / })[0]).toHaveAttribute('aria-pressed', 'true');
  });

  it('?category=team_contact 로 열면 팀컨택 필터가 선택돼 있고, 목록은 서버 roomType 필터로 받는다', () => {
    navigation.search = 'category=team_contact';
    hooks.chatRooms.mockReturnValue({ data: { items: [contactRoom('accepted', 'to')] }, isPending: false, isError: false, refetch: vi.fn() });

    renderWithClient(<ChatListPageClient />);

    const chips = screen.getAllByRole('button', { name: /^팀컨택 / });
    expect(chips[0]).toHaveAttribute('aria-pressed', 'true');
    const allChips = screen.getAllByRole('button', { name: /^전체 / });
    expect(allChips[0]).toHaveAttribute('aria-pressed', 'false');
    // 첫 페이지를 클라이언트에서 거르지 않는다 — 서버에 roomType 필터와 최대 페이지를 요청해야 한다.
    expect(hooks.chatRooms).toHaveBeenCalledWith({ enabled: true }, { roomType: 'team_contact', limit: 50 });
    expect(hooks.chatRooms).toHaveBeenCalledWith(undefined, { limit: 50 });
  });
});
