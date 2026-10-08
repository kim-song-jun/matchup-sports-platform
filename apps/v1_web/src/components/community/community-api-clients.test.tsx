import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError, V1_OFFLINE_WRITE_MESSAGE } from '@/lib/api-client';
import * as clientErrorReporter from '@/lib/client-error-reporter';
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
  uploadImages: vi.fn(),
  uploadChatFile: vi.fn(),
  // 공유 시트는 열 때만 부른다 — 기본은 "아직 안 부름".
  mySchedule: vi.fn(() => ({ data: undefined, isPending: true, isError: false, refetch: vi.fn() })),
  myMatches: vi.fn(() => ({ data: undefined, isPending: true, isError: false, refetch: vi.fn() })),
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
    useV1NotificationsInfinite: hooks.notifications,
    useV1ReadNotification: hooks.readNotification,
    useV1ReadAllNotifications: hooks.readAllNotifications,
    useV1ChatRooms: hooks.chatRooms,
    useV1UpdateChatRoomMe: hooks.updateChatRoomMe,
    useV1ChatRoom: hooks.chatRoom,
    useV1ChatMessages: hooks.chatMessages,
    useV1SendChatMessage: hooks.sendChatMessage,
    useV1UploadImages: hooks.uploadImages,
    useV1UploadChatFile: hooks.uploadChatFile,
    useV1MySchedule: hooks.mySchedule,
    useV1MyMatches: hooks.myMatches,
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
        pages: [
          {
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

  it('내보내진 사람의 옛 팀 채팅 주소는 네트워크 탓으로 말하지 않고 재시도 없이 채팅 목록으로 안내한다', () => {
    const forbidden = new V1ApiError({
      status: 'error',
      statusCode: 403,
      code: 'PERMISSION_DENIED',
      message: 'Team chat requires active team membership',
      timestamp: '2026-09-30T00:00:00.000Z',
    });
    hooks.chatRoom.mockReturnValue({ data: undefined, isPending: false, isError: true, error: forbidden, refetch: vi.fn() });
    hooks.chatMessages.mockReturnValue({ data: undefined, isPending: false, isError: true, error: forbidden, refetch: vi.fn() });

    renderWithClient(<ChatRoomPageClient roomId="room-team-left" />);

    expect(screen.getByText('참여 중인 멤버만 볼 수 있어요')).toBeInTheDocument();
    expect(screen.queryByText(/네트워크/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다시 불러오기' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '채팅 목록으로' })).toHaveAttribute('href', '/chat');
  });

  it('서버 오류(5xx)는 여전히 다시 불러오기를 준다', () => {
    const serverError = new V1ApiError({
      status: 'error',
      statusCode: 503,
      code: 'UNAVAILABLE',
      message: 'down',
      timestamp: '2026-09-30T00:00:00.000Z',
    });
    hooks.chatRoom.mockReturnValue({ data: undefined, isPending: false, isError: true, error: serverError, refetch: vi.fn() });
    hooks.chatMessages.mockReturnValue({ data: undefined, isPending: false, isError: true, error: serverError, refetch: vi.fn() });

    renderWithClient(<ChatRoomPageClient roomId="room-503" />);

    expect(screen.getAllByText('채팅방을 불러오지 못했어요').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '다시 불러오기' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: '채팅 목록으로' })).not.toBeInTheDocument();
  });

  it('F62·F63: 경기 채팅방 카드는 "경기 채팅 · 경기 상세 보기"이고, 차단 관리는 방 맨 위가 아니라 ⋯ 채팅방 메뉴 안에 있다', () => {
    hooks.chatRoom.mockReturnValue({
      data: {
        roomId: 'room-league',
        roomType: 'team_match',
        status: 'active',
        title: '(QA0929) 마포 주말 리그 1주차',
        linkedTarget: { type: 'team_match', id: 'tm-1', title: '(QA0929) 마포 주말 리그 1주차', route: '/team-matches/tm-1' },
        me: { participantId: 'participant-me', status: 'active', pinned: false, mutedUntil: null, lastReadMessageId: null },
        participants: [],
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    hooks.chatMessages.mockReturnValue({ data: { items: [], pageInfo: { nextCursor: null } }, isPending: false, isError: false, refetch: vi.fn() });

    renderWithClient(<ChatRoomPageClient roomId="room-league" />);

    expect(screen.getByText('경기 채팅 · 경기 상세 보기')).toBeInTheDocument();
    expect(screen.queryByText(/팀매치 채팅/)).toBeNull();
    expect(screen.queryByRole('button', { name: '채팅 차단 관리' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '채팅방 메뉴' }));
    fireEvent.click(screen.getByRole('button', { name: /채팅 차단 관리/ }));

    expect(screen.queryByRole('dialog', { name: '채팅방 메뉴' })).toBeNull();
    expect(screen.getByRole('dialog', { name: '채팅 차단 관리' })).toBeInTheDocument();
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
    // 채팅방 상단의 연결 화면 카드는 거기서 뒤로가면 이 채팅방으로 돌아오게 출처를 싣는다.
    expect(screen.getAllByRole('link').some((link) => link.getAttribute('href') === '/teams/team-1?from=%2Fchat%2Froom-1')).toBe(true);
  });

  it('불러오는 동안엔 예시 대화·제목·연결 카드 없이 스켈레톤만 보이고, 말풍선은 실제 메시지를 받은 뒤에만 그린다', () => {
    hooks.chatRoom.mockReturnValue({ data: undefined, isPending: true, isError: false, refetch: vi.fn() });
    hooks.chatMessages.mockReturnValue({ data: undefined, isPending: true, isError: false, refetch: vi.fn() });

    const { container } = renderWithClient(<ChatRoomPageClient roomId="room-real-from-notification" />);

    expect(screen.queryByText('주말 풋살 매치')).not.toBeInTheDocument();
    expect(screen.queryByText('오늘 14:00 경기 인원 확인해 주세요')).not.toBeInTheDocument();
    expect(screen.queryByText('개인매치 상세')).not.toBeInTheDocument();
    expect(container.querySelector('.tm-chat-context-card')).toBeNull();
    expect(container.querySelector('.tm-chat-thread .tm-skeleton-page')).not.toBeNull();
    expect(container.querySelector('.tm-chat-bubble, .tm-chat-system-message')).toBeNull();
  });
});

describe('ChatRoomPageClient — 입장 전 대화 안내 (H2)', () => {
  const NOTICE = '들어오기 전 대화는 보이지 않아요';

  function roomOf(roomType: 'team' | 'team_contact' | 'match') {
    return {
      roomId: 'room-1', roomType, status: 'active', title: '성수 풋살 크루', teamContact: null,
      linkedTarget: { type: 'team', id: 'team-1', title: '성수 풋살 크루', route: '/teams/team-1' },
      me: { participantId: 'p-me', status: 'active', pinned: false, mutedUntil: null, lastReadMessageId: null },
      participants: [],
    };
  }

  function renderRoom(roomType: 'team' | 'team_contact' | 'match', hasNext = false) {
    hooks.chatRoom.mockReturnValue({ data: roomOf(roomType), isPending: false, isError: false, refetch: vi.fn() });
    hooks.chatMessages.mockReturnValue({
      data: { items: [], nextCursor: null, pageInfo: { nextCursor: hasNext ? 'older' : null, hasNext } },
      isPending: false, isError: false, refetch: vi.fn(),
    });
    renderWithClient(<ChatRoomPageClient roomId="room-1" />);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    hooks.chatRooms.mockReturnValue({ data: { items: [] }, isPending: false, isError: false, refetch: vi.fn() });
    hooks.updateChatRoomMe.mockReturnValue({ isPending: false, variables: undefined, mutate: vi.fn() });
    hooks.sendChatMessage.mockReturnValue({ isPending: false, isError: false, mutate: vi.fn() });
    hooks.updateMyChatRoom.mockReturnValue({ isPending: false, mutate: vi.fn() });
  });

  it('팀 채팅은 대화 맨 위에 입장 전 대화가 안 보인다고 알린다 — 비어 보여도 이유를 안다', () => {
    renderRoom('team');
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
  });

  it('처음부터 다 보이는 방(팀컨택·매치)에는 붙이지 않는다', () => {
    renderRoom('team_contact');
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('더 오래된 메시지가 남아 있으면 여기가 맨 위가 아니라 붙이지 않는다', () => {
    renderRoom('team', true);
    expect(screen.queryByText(NOTICE)).toBeNull();
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

  // Enter 경로는 버튼의 disabled 가 없어 onSend 가드(공백·전송 중)만이 빈/중복 전송을 막는다 — 여기서 고정한다.
  it('Enter 는 앞뒤 공백을 뺀 내용을 보내고, 공백뿐이면 보내지 않는다', () => {
    const mutate = vi.fn();
    hooks.sendChatMessage.mockReturnValue({ isPending: false, isError: false, mutate });
    hooks.chatRoom.mockReturnValue({ data: contactRoomDetail('accepted', 'from'), isPending: false, isError: false, refetch: vi.fn() });
    renderWithClient(<ChatRoomPageClient roomId="room-contact" />);
    const input = screen.getByLabelText('메시지 입력');

    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mutate).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: ' 안녕\n반가워요 ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ content: '안녕\n반가워요' }, expect.anything());
  });

  describe('사진 보내기 (Task 181)', () => {
    const photos = (count: number) => Array.from({ length: count }, (_, i) => new File([`p${i}`], `p${i}.jpg`, { type: 'image/jpeg' }));
    function arrange(uploadMutateAsync: ReturnType<typeof vi.fn>) {
      const sendMutateAsync = vi.fn().mockResolvedValue({});
      hooks.sendChatMessage.mockReturnValue({ isPending: false, isError: false, mutate: vi.fn(), mutateAsync: sendMutateAsync });
      hooks.uploadImages.mockReturnValue({ mutateAsync: uploadMutateAsync });
      hooks.chatRoom.mockReturnValue({ data: contactRoomDetail('accepted', 'from'), isPending: false, isError: false, refetch: vi.fn() });
      renderWithClient(<ChatRoomPageClient roomId="room-contact" />);
      fireEvent.click(screen.getByRole('button', { name: '보내기 메뉴 열기' }));
      return { sendMutateAsync };
    }

    // 업로드 mock — 받은 파일 이름으로 경로를 돌려준다(사진마다 한 장씩 올린다).
    const uploadEach = () => vi.fn(async ([file]: File[]) => ({ urls: [`/uploads/${file.name}`] }));

    it('사진마다 올리고 바로 보낸다 — 채팅 사진은 메타데이터(EXIF)를 지우는 업로드를 쓴다', async () => {
      const upload = uploadEach();
      const { sendMutateAsync } = arrange(upload);
      const files = photos(2);

      fireEvent.change(screen.getByTestId('chat-album-input'), { target: { files } });

      await waitFor(() => expect(sendMutateAsync).toHaveBeenCalledTimes(2));
      expect(hooks.uploadImages).toHaveBeenCalledWith({ stripMetadata: true });
      expect(upload.mock.calls.map(([batch]) => batch.map((file: File) => file.name))).toEqual([['p0.jpg'], ['p1.jpg']]);
      expect(sendMutateAsync).toHaveBeenNthCalledWith(1, { imageUrl: '/uploads/p0.jpg' });
      expect(sendMutateAsync).toHaveBeenNthCalledWith(2, { imageUrl: '/uploads/p1.jpg' });
    });

    it('6장 이상 고르면 앞 5장만 보내고 알려 준다', async () => {
      const upload = uploadEach();
      arrange(upload);
      const files = photos(6);

      fireEvent.change(screen.getByTestId('chat-album-input'), { target: { files } });

      expect(await screen.findByText('사진은 한 번에 5장까지 보낼 수 있어요. 앞의 5장만 보냈어요.')).toBeInTheDocument();
      // jsdom File 은 모양만 비교되므로 이름으로 본다 — 6번째(p5)는 올리지 않는다.
      expect(upload.mock.calls.map(([batch]) => batch[0].name)).toEqual(['p0.jpg', 'p1.jpg', 'p2.jpg', 'p3.jpg', 'p4.jpg']);
    });

    it('중간에 실패하면 몇 장이 갔는지 알리고 거기서 멈춘다 — 다시 고를 때 앞 사진이 중복되지 않게', async () => {
      const upload = uploadEach();
      const { sendMutateAsync } = arrange(upload);
      sendMutateAsync.mockResolvedValueOnce({}).mockRejectedValueOnce({});

      fireEvent.change(screen.getByTestId('chat-album-input'), { target: { files: photos(3) } });

      expect(await screen.findByText('사진 3장 중 1장만 보냈어요. 사진을 보내지 못했어요. 다시 시도해 주세요.')).toBeInTheDocument();
      // 실패한 2번째 뒤로는 올리지 않는다 — 안 보내질 사진이 저장소에 쌓이지 않는다.
      expect(upload).toHaveBeenCalledTimes(2);
      expect(sendMutateAsync).toHaveBeenCalledTimes(2);
    });

    it('업로드가 실패하면 보내지 않고 서버가 준 이유(용량 초과 등)를 보여 준다', async () => {
      const upload = vi.fn().mockRejectedValue(new V1ApiError({
        status: 'error',
        statusCode: 400,
        code: 'UPLOAD_FILE_TOO_LARGE',
        message: '파일 크기가 5MB를 초과했어요. (p0.jpg)',
        details: null,
        requestId: 'req-1',
        timestamp: '2026-10-01T00:00:00.000Z',
      } as ConstructorParameters<typeof V1ApiError>[0]));
      const { sendMutateAsync } = arrange(upload);

      fireEvent.change(screen.getByTestId('chat-album-input'), { target: { files: photos(1) } });

      expect(await screen.findByText('파일 크기가 5MB를 초과했어요. (p0.jpg)')).toBeInTheDocument();
      expect(sendMutateAsync).not.toHaveBeenCalled();
    });

    it('이유를 모르는 실패는 기본 안내 문구', async () => {
      const upload = vi.fn().mockRejectedValue({});
      arrange(upload);

      fireEvent.change(screen.getByTestId('chat-album-input'), { target: { files: photos(1) } });

      expect(await screen.findByText('사진을 보내지 못했어요. 다시 시도해 주세요.')).toBeInTheDocument();
    });
  });

  describe('파일 보내기 (Task 181 ③)', () => {
    function arrangeFile(upload: ReturnType<typeof vi.fn>) {
      const sendMutateAsync = vi.fn().mockResolvedValue({});
      hooks.sendChatMessage.mockReturnValue({ isPending: false, isError: false, mutate: vi.fn(), mutateAsync: sendMutateAsync });
      hooks.uploadImages.mockReturnValue({ mutateAsync: vi.fn() });
      hooks.uploadChatFile.mockReturnValue({ mutateAsync: upload });
      hooks.chatRoom.mockReturnValue({ data: contactRoomDetail('accepted', 'from'), isPending: false, isError: false, refetch: vi.fn() });
      renderWithClient(<ChatRoomPageClient roomId="room-contact" />);
      fireEvent.click(screen.getByRole('button', { name: '보내기 메뉴 열기' }));
      return { sendMutateAsync };
    }

    it('올린 뒤 fileId 로 보낸다', async () => {
      const upload = vi.fn().mockResolvedValue({ fileId: 'file-1', name: 'a.pdf', size: 10, mimeType: 'application/pdf' });
      const { sendMutateAsync } = arrangeFile(upload);
      const doc = new File(['%PDF-'], 'a.pdf', { type: 'application/pdf' });

      fireEvent.change(screen.getByTestId('chat-file-input'), { target: { files: [doc] } });

      await waitFor(() => expect(sendMutateAsync).toHaveBeenCalledWith({ fileId: 'file-1' }));
      expect(upload).toHaveBeenCalledWith(doc);
    });

    it('10MB 를 넘으면 올리지 않고 알려 준다', async () => {
      const upload = vi.fn();
      arrangeFile(upload);
      const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.pdf', { type: 'application/pdf' });

      fireEvent.change(screen.getByTestId('chat-file-input'), { target: { files: [big] } });

      expect(await screen.findByText('파일은 10MB까지 보낼 수 있어요.')).toBeInTheDocument();
      expect(upload).not.toHaveBeenCalled();
    });

    it('서버가 형식을 거절하면 그 이유를 보여 주고 보내지 않는다', async () => {
      const upload = vi.fn().mockRejectedValue(new V1ApiError({
        status: 'error', statusCode: 400, code: 'UPLOAD_FILE_TYPE_INVALID',
        message: '보낼 수 없는 파일 형식이에요. PDF·워드·엑셀·파워포인트·한글·텍스트·CSV·ZIP 파일만 보낼 수 있어요.',
        timestamp: '2026-10-01T00:00:00.000Z',
      } as ConstructorParameters<typeof V1ApiError>[0]));
      const { sendMutateAsync } = arrangeFile(upload);

      fireEvent.change(screen.getByTestId('chat-file-input'), { target: { files: [new File(['x'], 'a.pdf')] } });

      expect(await screen.findByText(/보낼 수 없는 파일 형식이에요/)).toBeInTheDocument();
      expect(sendMutateAsync).not.toHaveBeenCalled();
    });

    it('받은 파일 메시지는 참여자 인증 받기 경로로 내려받는다', () => {
      hooks.chatRoom.mockReturnValue({ data: contactRoomDetail('accepted', 'from'), isPending: false, isError: false, refetch: vi.fn() });
      hooks.chatMessages.mockReturnValue({
        data: { items: [{
          messageId: 'file-msg-1', messageType: 'file', content: '[파일] 경기 일정표.pdf', status: 'sent', sentAt: '2026-10-01T01:00:00.000Z', mine: false,
          sender: { userId: 'u-2', displayName: '서연', profileImageUrl: null },
          file: { name: '경기 일정표.pdf', size: 1258291, mimeType: 'application/pdf' },
        }] },
        isPending: false, isError: false, refetch: vi.fn(),
      });
      renderWithClient(<ChatRoomPageClient roomId="room-contact" />);

      const link = screen.getByRole('link', { name: '경기 일정표.pdf 파일 받기, 1.2MB' });
      expect(link.getAttribute('href')).toMatch(/\/chat\/rooms\/room-contact\/messages\/file-msg-1\/file$/);
    });
  });

  describe('일정·매치 공유 (Task 181 ②)', () => {
    it('받은 공유 카드는 그 화면으로 가고, 뒤로가기가 이 채팅방으로 돌아오게 출처를 싣는다', () => {
      hooks.chatRoom.mockReturnValue({ data: contactRoomDetail('accepted', 'from'), isPending: false, isError: false, refetch: vi.fn() });
      hooks.chatMessages.mockReturnValue({
        data: { items: [{
          messageId: 'share-1', messageType: 'share', content: '[매치] 수요일 저녁 풋살', status: 'sent', sentAt: '2026-10-01T01:00:00.000Z', mine: false,
          sender: { userId: 'u-2', displayName: '서연', profileImageUrl: null },
          shareCard: { kind: 'match', targetId: 'm-1', title: '수요일 저녁 풋살', startAt: '2026-10-08T11:00:00.000Z', place: '성수 풋살파크', sub: null, route: '/matches/m-1' },
        }] },
        isPending: false, isError: false, refetch: vi.fn(),
      });
      renderWithClient(<ChatRoomPageClient roomId="room-contact" />);

      const href = screen.getByRole('link', { name: /매치 공유/ }).getAttribute('href') ?? '';
      expect(href.startsWith('/matches/m-1?')).toBe(true);
      expect(new URLSearchParams(href.split('?')[1]).get('from')).toContain('/chat');
    });

    it('시트를 열 때만 불러오고, 지난·취소 매치는 빼고 중복 없이 빠른 순 · 고르면 공유로 보낸다', async () => {
      const mutate = vi.fn();
      hooks.sendChatMessage.mockReturnValue({ isPending: false, isError: false, mutate, mutateAsync: vi.fn() });
      hooks.uploadImages.mockReturnValue({ mutateAsync: vi.fn() });
      hooks.chatRoom.mockReturnValue({ data: contactRoomDetail('accepted', 'from'), isPending: false, isError: false, refetch: vi.fn() });
      hooks.mySchedule.mockImplementation(((_filters: unknown, options?: { enabled?: boolean }) => ({
        data: options?.enabled ? { items: [{ id: 'sch-1', title: '토요일 친선', startAt: '2099-10-04T10:00:00.000Z', teamName: '번개 FC' }], nextCursor: null } : undefined,
        isPending: !options?.enabled, isError: false, refetch: vi.fn(),
      })) as never);
      const match = (id: string, startsAt: string, status = 'open') => ({ id, title: `매치 ${id}`, startsAt, placeName: '성수', status });
      hooks.myMatches.mockImplementation(((filters: { mode: string }, options?: { enabled?: boolean }) => ({
        data: options?.enabled
          ? { items: filters.mode === 'joined'
            ? [match('late', '2099-10-09T10:00:00.000Z'), match('past', '2000-01-01T00:00:00.000Z'), match('gone', '2099-10-05T10:00:00.000Z', 'cancelled')]
            : [match('early', '2099-10-02T10:00:00.000Z'), match('late', '2099-10-09T10:00:00.000Z')] }
          : undefined,
        isPending: !options?.enabled, isError: false, refetch: vi.fn(),
      })) as never);

      renderWithClient(<ChatRoomPageClient roomId="room-contact" />);
      // 닫혀 있는 동안은 부르지 않는다.
      expect(hooks.mySchedule).toHaveBeenLastCalledWith(expect.anything(), { enabled: false });

      fireEvent.click(screen.getByRole('button', { name: '보내기 메뉴 열기' }));
      fireEvent.click(screen.getByRole('button', { name: '일정·매치' }));
      const sheet = await screen.findByRole('dialog', { name: '일정·매치 공유' });
      expect(hooks.mySchedule).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'scheduled' }), { enabled: true });

      fireEvent.click(screen.getByRole('tab', { name: '매치' }));
      const titles = Array.from(sheet.querySelectorAll('.tm-chat-share-row-title')).map((node) => node.textContent);
      expect(titles).toEqual(['매치 early', '매치 late']);

      fireEvent.click(screen.getByRole('button', { name: /매치 early/ }));
      expect(mutate).toHaveBeenCalledWith({ share: { kind: 'match', targetId: 'early' } }, expect.anything());
      expect(screen.queryByRole('dialog', { name: '일정·매치 공유' })).not.toBeInTheDocument();
    });
  });

  it('전송 중에는 Enter 를 다시 눌러도 보내지 않는다', () => {
    const mutate = vi.fn();
    hooks.sendChatMessage.mockReturnValue({ isPending: true, isError: false, mutate });
    hooks.chatRoom.mockReturnValue({ data: contactRoomDetail('accepted', 'from'), isPending: false, isError: false, refetch: vi.fn() });
    renderWithClient(<ChatRoomPageClient roomId="room-contact" />);
    const input = screen.getByLabelText('메시지 입력');

    fireEvent.change(input, { target: { value: '안녕' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mutate).not.toHaveBeenCalled();
  });

  // W6-V1: 쓰기 실패는 화면마다 같은 이유를 보여야 한다 — 채팅만 고정 문구로 이유를 버리고 있었다.
  describe('보내기 실패 문구', () => {
    const FALLBACK = '메시지를 전송하지 못했어요. 다시 시도해 주세요.';
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    async function sendAndFail(fetchResult: () => Promise<unknown>) {
      const actual = await vi.importActual<typeof import('@/hooks/use-v1-api')>('@/hooks/use-v1-api');
      hooks.sendChatMessage.mockImplementation(actual.useV1SendChatMessage);
      hooks.chatRoom.mockReturnValue({ data: contactRoomDetail('accepted', 'from'), isPending: false, isError: false, refetch: vi.fn() });
      vi.spyOn(clientErrorReporter, 'reportClientError').mockImplementation(() => {});
      vi.stubGlobal('fetch', vi.fn(fetchResult));
      renderWithClient(<ChatRoomPageClient roomId="room-contact" />);
      const input = screen.getByLabelText('메시지 입력');
      fireEvent.change(input, { target: { value: '안녕' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      return input;
    }

    it('오프라인이면 연결 문구를 보여 주고, 쓴 글은 그대로 남긴다', async () => {
      vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
      const input = await sendAndFail(() => Promise.reject(new TypeError('Failed to fetch')));

      expect(await screen.findByText(V1_OFFLINE_WRITE_MESSAGE)).toBeInTheDocument();
      expect(screen.queryByText(FALLBACK)).not.toBeInTheDocument();
      expect(input).toHaveValue('안녕');
    });

    it('대조군 — 이유를 모르는 실패(본문 없는 502)는 종전 문구다', async () => {
      await sendAndFail(() => Promise.resolve({ ok: false, status: 502, statusText: 'Bad Gateway', json: async () => { throw new SyntaxError('Unexpected token <'); } }));

      expect(await screen.findByText(FALLBACK)).toBeInTheDocument();
    });
  });
});

describe('ChatListPageClient — 취소된 개인매치 배지', () => {
  const matchRoom = (id: string, title: string, linkedTargetCancelled: boolean) => ({
    roomId: id,
    roomType: 'match' as const,
    title,
    status: 'active',
    teamContact: null,
    linkedTarget: { type: 'match' as const, id: `m-${id}`, title, route: `/matches/m-${id}` },
    linkedTargetCancelled,
    lastMessage: null, unreadCount: 0, pinned: false, muted: false, mutedUntil: null,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    navigation.search = '';
    hooks.updateChatRoomMe.mockReturnValue({ isPending: false, variables: undefined, mutate: vi.fn() });
  });

  it('취소된 개인매치 방에만 "취소됨" 배지가 붙고 진행 중인 방에는 없다', () => {
    hooks.chatRooms.mockReturnValue({
      data: { items: [matchRoom('r1', '취소된 매치', true), matchRoom('r2', '진행 중 매치', false)] },
      isPending: false, isError: false, refetch: vi.fn(),
    });

    renderWithClient(<ChatListPageClient />);

    // 모바일·데스크톱 두 pane 이 렌더되므로 행 단위로 좁혀 본다.
    const cancelledRow = screen.getAllByText('취소된 매치')[0].closest('.tm-chat-row-main') as HTMLElement;
    const activeRow = screen.getAllByText('진행 중 매치')[0].closest('.tm-chat-row-main') as HTMLElement;
    expect(within(cancelledRow).getByText('취소됨')).toBeInTheDocument();
    expect(within(activeRow).queryByText('취소됨')).toBeNull();
    // desktop/chat.css 가 1024px 이상에서 tm-chat-pinned-badge 를 숨긴다 — '고정' 전용이라 다른 배지가 쓰면 데스크톱에서 사라진다.
    expect(within(cancelledRow).getByText('취소됨')).not.toHaveClass('tm-chat-pinned-badge');
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
    for (const label of ['답장 필요', '대기 중', '수락됨']) {
      screen.getAllByText(label).forEach((badge) => expect(badge).not.toHaveClass('tm-chat-pinned-badge'));
    }
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

    expect(hooks.chatRooms).toHaveBeenCalledWith({ enabled: true, refetchOnWindowFocus: 'always', staleTime: 0 }, { roomType: 'team_contact', status: 'archived', limit: 50 });
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
    expect(hooks.chatRooms).toHaveBeenCalledWith({ enabled: true, refetchOnWindowFocus: 'always', staleTime: 0 }, { roomType: 'team_contact', limit: 50 });
    expect(hooks.chatRooms).toHaveBeenCalledWith({ refetchOnWindowFocus: 'always' }, { limit: 50 });
  });
});
