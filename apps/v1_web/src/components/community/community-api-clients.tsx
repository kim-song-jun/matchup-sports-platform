'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { trackEvent } from '@/lib/analytics';
import { normalizeNotificationHref } from '@/lib/notification-route';
import { useV1ChatRoomSocket } from '@/hooks/use-v1-realtime-socket';
import {
  useV1ChatMessages,
  useV1ChatRoom,
  useV1ChatRooms,
  useV1Notifications,
  useV1ReadAllNotifications,
  useV1ReadNotification,
  useV1SendChatMessage,
  useV1UpdateChatRoomMe,
  useV1UpdateMyChatRoom,
} from '@/hooks/use-v1-api';
import type { V1ChatMessage, V1ChatRoom, V1Notification } from '@/types/api';
import { ChatListPageView, ChatRoomPageView, NotificationsPageView } from './community-page';
import { formatChatListTimestamp } from './chat-message-time';
import type { ChatListViewModel, ChatRoomModel, ChatRoomViewModel, NotificationModel, NotificationsViewModel } from './community.types';
import { getChatRoomViewModel } from './community.view-model';
import { chatRoomTypeLabel } from '@/lib/chat-route';

type ChatCategory = ChatRoomModel['type'] | '전체';

const CHAT_AVATARS = {
  개인매치: '/mock/profile/profile-01.svg',
  팀매치: '/mock/profile/profile-03.svg',
  팀: '/mock/profile/profile-02.svg',
  팀컨택: '/mock/profile/profile-02.svg',
} satisfies Record<ChatRoomModel['type'], string>;

export function ChatListPageClient() {
  const model = useChatListPageModel();

  return <ChatListPageView model={model} />;
}

/** `/chat?category=team_contact` — 마이 메뉴·팀 관리 메뉴의 "받은 컨택" 입구가 팀컨택 필터로 바로 연다. */
function initialChatCategory(category: string | null): ChatCategory {
  return category === 'team_contact' ? '팀컨택' : '전체';
}

const CHAT_LIST_PAGE_SIZE = 50;
const CATEGORY_ROOM_TYPE: Record<Exclude<ChatCategory, '전체'>, V1ChatRoom['roomType']> = {
  개인매치: 'match',
  팀매치: 'team_match',
  팀: 'team',
  팀컨택: 'team_contact',
};

function useChatListPageModel(): ChatListViewModel {
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get('category');
  const [selectedCategory, setSelectedCategory] = useState<ChatCategory>(() => initialChatCategory(categoryParam));
  // 이미 /chat 에 있는 채로 쿼리만 바뀌는 이동(/chat → /chat?category=team_contact)은 컴포넌트가
  // 남아 있어 useState 초기값이 다시 계산되지 않는다 — 파라미터 변화에 맞춰 동기화한다.
  useEffect(() => {
    setSelectedCategory(initialChatCategory(categoryParam));
  }, [categoryParam]);
  // 서버 최대 페이지(50)로 받는다. 카테고리를 고르면 서버 roomType 필터로 다시 받는다 — 첫 페이지를
  // 클라이언트에서 거르면 "받은 컨택 3" 배지를 눌렀는데 목록이 비는 일이 생긴다(최종 리뷰 Important 2).
  const query = useV1ChatRooms(undefined, { limit: CHAT_LIST_PAGE_SIZE });
  const filteredQuery = useV1ChatRooms(
    { enabled: selectedCategory !== '전체' },
    selectedCategory === '전체' ? undefined : { roomType: CATEGORY_ROOM_TYPE[selectedCategory], limit: CHAT_LIST_PAGE_SIZE },
  );
  // 종료된 컨택(archived 방)은 요청했을 때만 받는다 — 기본 목록은 서버가 이미 치운 상태다.
  const [showEnded, setShowEnded] = useState(false);
  const endedEnabled = selectedCategory === '팀컨택' && showEnded;
  const endedQuery = useV1ChatRooms(
    { enabled: endedEnabled },
    endedEnabled ? { roomType: 'team_contact', status: 'archived', limit: CHAT_LIST_PAGE_SIZE } : undefined,
  );
  const updateMe = useV1UpdateChatRoomMe();
  const baseRooms = query.data?.items.map(toChatRoomModel) ?? [];
  const categoryRooms = filteredQuery.data?.items.map(toChatRoomModel);
  const withActions = (room: ChatRoomModel) => ({
    ...room,
    actionPending: updateMe.isPending && updateMe.variables?.roomId === room.id,
    onTogglePin: () => updateMe.mutate({ roomId: room.id, pinned: !room.pinned }),
    // 앱 알림 등록 전까지 채팅방별 알림 설정은 비활성화한다.
    // 앱 푸시 연동 후 아래 콜백과 community-page.tsx의 버튼을 함께 복구한다.
    // onToggleMute: () => updateMe.mutate({ roomId: room.id, mutedUntil: room.muted ? null : mutedUntilIndefinite() }),
  });
  const rooms = baseRooms.map(withActions);
  // 서버 필터 응답이 아직 없거나(첫 로딩) 실패했으면 전체 목록을 클라이언트에서 걸러 보여 주고,
  // 도착하면 서버 결과로 바꾼다 — 카테고리를 고를 때 목록이 스켈레톤으로 비지 않게 한다.
  const visibleRooms =
    selectedCategory === '전체'
      ? rooms
      : categoryRooms
        ? categoryRooms.map(withActions)
        : rooms.filter((room) => room.type === selectedCategory);
  const categories: ChatCategory[] = ['전체', '개인매치', '팀매치', '팀', '팀컨택'];
  const isEmpty = visibleRooms.length === 0;
  const model: ChatListViewModel = {
    categories: categories.map((category) => ({
      label: category,
      // '전체' 와 선택된 카테고리(서버 필터 결과)만 센다. 나머지 칩은 첫 50개 안에서만 센 값이라
      // 눌렀을 때 숫자가 바뀌어 보이므로 아예 보여 주지 않는다(후속 리뷰 Important 1).
      count:
        category === '전체'
          ? rooms.length
          : category === selectedCategory
            ? (categoryRooms ?? rooms.filter((room) => room.type === category)).length
            : undefined,
      active: selectedCategory === category,
      onSelect: () => setSelectedCategory(category),
    })),
    pinnedRooms: visibleRooms.filter((room) => room.pinned),
    rooms: visibleRooms.filter((room) => !room.pinned),
    status: query.isPending ? 'loading' : query.isError ? 'error' : 'ready',
    emptyTitle: query.isError ? '채팅방을 불러오지 못했어요' : isEmpty ? `${selectedCategory} 채팅방이 없어요` : undefined,
    emptyBody: query.isError ? '잠시 후 다시 시도해 주세요.' : isEmpty ? '매치에 참가하거나 팀에 가입하면 채팅방이 생겨요.' : undefined,
    emptyHref: query.isError || selectedCategory === '팀' || selectedCategory === '팀컨택' ? undefined : '/matches',
    onRetry: query.isError ? () => query.refetch() : undefined,
    endedContacts:
      selectedCategory === '팀컨택'
        ? {
            visible: showEnded,
            onToggle: () => setShowEnded((v) => !v),
            rooms: showEnded ? (endedQuery.data?.items.map(toChatRoomModel) ?? []).map(withActions) : [],
            status: !showEnded || endedQuery.data ? 'ready' : endedQuery.isError ? 'error' : 'loading',
          }
        : undefined,
  };

  return model;
}

export function ChatRoomPageClient({ roomId }: { roomId: string }) {
  // 실시간 수신. 이 훅은 만들어져 있었지만 **어디에도 마운트되지 않아** 열어 둔 채팅방에
  // 새 메시지가 실시간으로 들어오지 않았다 -- 30초 stale 이 지난 뒤 창 포커스가 바뀔 때만
  // 갱신됐다. 형제 훅(useV1NotificationSocket)은 notification-socket-bridge 로 마운트돼
  // 있는데 이것만 소비처가 없었다.
  useV1ChatRoomSocket(roomId);
  const listModel = useChatListPageModel();
  const room = useV1ChatRoom(roomId);
  const messages = useV1ChatMessages(roomId, { limit: 50 });
  const send = useV1SendChatMessage(roomId);
  const updateMe = useV1UpdateMyChatRoom(roomId);
  const [draft, setDraft] = useState('');
  const items = useMemo(() => [...(messages.data?.items ?? [])].reverse(), [messages.data]);
  const lastMessageId = items.at(-1)?.messageId ?? null;

  useEffect(() => {
    if (!lastMessageId || updateMe.isPending) return;
    updateMe.mutate({ lastReadMessageId: lastMessageId });
  }, [lastMessageId]);

  const fallback = getChatRoomViewModel();
  const contact = room.data?.teamContact ?? null;
  // 컨택 방은 수락된 뒤에만 대화할 수 있다(서버 TEAM_CONTACT_NOT_ACCEPTED 게이트와 같은 규칙).
  const inputLockedMessage = contact
    ? contact.status === 'requested'
      ? '수락하면 대화할 수 있어요'
      : contact.status !== 'accepted'
        ? '종료된 컨택이에요'
        : undefined
    : undefined;
  const isError = room.isError || messages.isError;
  const isLoading = room.isPending || messages.isPending;
  // fallback은 로딩 중 스켈레톤 배경용 placeholder일 뿐이다 — 조회 실패(isError) 시에도
  // 노출되면 알림으로 들어온 실제 채팅방 대신 엉뚱한 채팅방이 보이는 것처럼 보인다.
  const messageItems = messages.data ? items.map(toChatMessageModel) : isLoading ? fallback.messages : [];
  const model: ChatRoomViewModel = {
    title: room.data?.title ?? (isLoading ? fallback.title : '채팅'),
    context: room.data
      ? {
          title: room.data.linkedTarget.title,
          sub: `${chatRoomTypeLabel(room.data.roomType)} 채팅`,
          href: room.data.linkedTarget.route ?? '/chat',
        }
      : isLoading
        ? fallback.context
        : { title: '', sub: '', href: '/chat' },
    teamContact: contact,
    inputLockedMessage,
    messages: messageItems,
    status: isLoading ? 'loading' : isError ? 'error' : 'ready',
    emptyTitle: isError ? '채팅방을 불러오지 못했어요' : messages.data && items.length === 0 ? '아직 메시지가 없어요' : undefined,
    emptyBody: isError
      ? '네트워크 상태를 확인하고 다시 시도해 주세요.'
      : messages.data && items.length === 0
        ? inputLockedMessage ?? '먼저 말을 걸어 대화를 시작해 보세요'
        : undefined,
    draft,
    sending: send.isPending,
    sendError: send.isError,
    onDraftChange: setDraft,
    onSend: () => {
      const content = draft.trim();
      // 로딩 중 재클릭/재입력 시 중복 제출 방지 — isPending 은 disabled 속성과 동일하게 리렌더
      // 이후에나 반영되는 값이라 동시 클릭까지 막지는 못하지만, 스피너가 보이는 동안의
      // 재클릭/재입력은 막는다(동시 클릭 방지가 필요하면 ref 락을 따로 둔다).
      if (!content || send.isPending) return;
      send.mutate(
        { content },
        {
          onSuccess: () => setDraft(''),
        },
      );
    },
    onRetry: isError
      ? () => {
          room.refetch();
          messages.refetch();
        }
      : undefined,
  };

  return <ChatRoomPageView model={model} listModel={listModel} roomId={roomId} />;
}

export function NotificationsPageClient() {
  const router = useRouter();
  const [readAllToastVisible, setReadAllToastVisible] = useState(false);
  const query = useV1Notifications({ limit: 50 });
  const read = useV1ReadNotification();
  const readAll = useV1ReadAllNotifications();

  const status: NotificationsViewModel['status'] = query.isPending
    ? 'loading'
    : query.isError
      ? 'error'
      : 'ready';

  // 로딩·에러 중에는 빈 배열을 유지하되 EmptyState를 노출하지 않는다.
  // ready 상태에서만 실제 알림이 없는지 판정한다.
  const notifications = status === 'ready' && Array.isArray(query.data?.items)
    ? query.data.items.map(toNotificationModel)
    : [];

  const model: NotificationsViewModel = {
    status,
    onRetry: query.isError ? () => query.refetch() : undefined,
    unreadCount: typeof query.data?.unreadCount === 'number' ? query.data.unreadCount : 0,
    notifications,
    readAllPending: readAll.isPending,
    readAllToastVisible,
    onReadAll: () =>
      readAll.mutate(
        {},
        {
          onSuccess: () => {
            setReadAllToastVisible(true);
            window.setTimeout(() => setReadAllToastVisible(false), 2200);
          },
        },
      ),
    // 카드 탭은 상세 시트를 여는 동작 — 읽음 처리만 하고 이동은 시트 CTA(onNavigate)가 맡는다.
    onOpen: (notification) => {
      trackEvent('notification_click', { type: notification.type });
      if (notification.unread) read.mutate(notification.id);
    },
    onNavigate: (notification) => router.push(notification.href),
  };

  return <NotificationsPageView model={model} />;
}

function toChatRoomModel(room: V1ChatRoom): ChatRoomModel {
  const type = chatRoomTypeLabel(room.roomType);
  return {
    id: room.roomId,
    title: room.title,
    type,
    href: room.linkedTarget.route ?? '/chat',
    contactStatus: room.teamContact?.status,
    contactNeedsReply: room.teamContact?.status === 'requested' && room.teamContact.mySide === 'to',
    last: room.lastMessage?.contentPreview ?? '아직 메시지가 없어요',
    time: room.lastMessage ? formatChatListTimestamp(room.lastMessage.sentAt) : '',
    unread: room.unreadCount,
    pinned: room.pinned,
    muted: room.muted,
    mutedUntil: room.mutedUntil ?? null,
    initials: room.title.slice(0, 1) || '채',
    avatarUrl: CHAT_AVATARS[type],
  };
}

// 앱 푸시 연동 후 채팅방별 알림 끄기 기능을 복구할 때 다시 사용한다.
// function mutedUntilIndefinite() {
//   return '9999-12-31T23:59:59.999Z';
// }

function toChatMessageModel(message: V1ChatMessage): ChatRoomViewModel['messages'][number] {
  if (message.messageType === 'system') {
    return {
      id: message.messageId,
      who: 'system',
      senderId: 'system',
      label: '',
      body: message.content ?? '',
      sentAt: message.sentAt,
    };
  }

  return {
    id: message.messageId,
    who: message.mine ? 'me' : 'other',
    senderId: message.sender.userId,
    unreadCount: message.mine && message.unreadCount ? message.unreadCount : undefined,
    label: message.mine ? '나' : message.sender.displayName,
    body: message.content ?? '삭제된 메시지예요.',
    sentAt: message.sentAt,
  };
}

function toNotificationModel(notification: V1Notification): NotificationModel {
  const href = normalizeNotificationHref(notification.target?.route, notification.type);
  return {
    id: notification.notificationId,
    type: notification.type,
    group: formatNotificationGroup(notification.createdAt),
    title: notification.title,
    body: notification.body ?? '',
    time: formatRelative(notification.createdAt),
    unread: notification.status !== 'read',
    href,
    actionLabel: notification.type === 'chat' ? '채팅 열기' : '보기',
  };
}

function formatNotificationGroup(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return '오늘';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return '어제';

  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
}

function formatRelative(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}
