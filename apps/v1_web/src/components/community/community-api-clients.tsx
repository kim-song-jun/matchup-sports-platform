'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { normalizeNotificationHref } from '@/lib/notification-route';
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

type ChatCategory = ChatRoomModel['type'] | '전체';

const CHAT_AVATARS = {
  개인매치: '/mock/profile/profile-01.svg',
  팀매치: '/mock/profile/profile-03.svg',
  팀: '/mock/profile/profile-02.svg',
} satisfies Record<ChatRoomModel['type'], string>;

export function ChatListPageClient() {
  const model = useChatListPageModel();

  return <ChatListPageView model={model} />;
}

function useChatListPageModel(): ChatListViewModel {
  const [selectedCategory, setSelectedCategory] = useState<ChatCategory>('전체');
  const query = useV1ChatRooms();
  const updateMe = useV1UpdateChatRoomMe();
  const baseRooms = query.data?.items.map(toChatRoomModel) ?? [];
  const rooms = baseRooms.map((room) => ({
    ...room,
    actionPending: updateMe.isPending && updateMe.variables?.roomId === room.id,
    onTogglePin: () => updateMe.mutate({ roomId: room.id, pinned: !room.pinned }),
    // 앱 알림 등록 전까지 채팅방별 알림 설정은 비활성화한다.
    // 앱 푸시 연동 후 아래 콜백과 community-page.tsx의 버튼을 함께 복구한다.
    // onToggleMute: () => updateMe.mutate({ roomId: room.id, mutedUntil: room.muted ? null : mutedUntilIndefinite() }),
  }));
  const visibleRooms = selectedCategory === '전체' ? rooms : rooms.filter((room) => room.type === selectedCategory);
  const categories: ChatCategory[] = ['전체', '개인매치', '팀매치', '팀'];
  const isEmpty = visibleRooms.length === 0;
  const model: ChatListViewModel = {
    categories: categories.map((category) => ({
      label: category,
      count: category === '전체' ? rooms.length : rooms.filter((room) => room.type === category).length,
      active: selectedCategory === category,
      onSelect: () => setSelectedCategory(category),
    })),
    pinnedRooms: visibleRooms.filter((room) => room.pinned),
    rooms: visibleRooms.filter((room) => !room.pinned),
    status: query.isPending ? 'loading' : query.isError ? 'error' : 'ready',
    emptyTitle: query.isError ? '채팅방을 불러오지 못했어요' : isEmpty ? `${selectedCategory} 채팅방이 없어요` : undefined,
    emptyBody: query.isError ? '잠시 후 다시 시도해 주세요.' : isEmpty ? '매치에 참가하거나 팀에 가입하면 채팅방이 생겨요.' : undefined,
    emptyHref: query.isError || selectedCategory === '팀' ? undefined : '/matches',
    onRetry: query.isError ? () => query.refetch() : undefined,
  };

  return model;
}

export function ChatRoomPageClient({ roomId }: { roomId: string }) {
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
  const isError = room.isError || messages.isError;
  const isLoading = room.isPending || messages.isPending;
  const messageItems = messages.data ? items.map(toChatMessageModel) : fallback.messages;
  const model: ChatRoomViewModel = {
    title: room.data?.title ?? fallback.title,
    context: room.data
      ? {
          title: room.data.linkedTarget.title,
          sub: room.data.roomType === 'match' ? '개인매치 채팅' : room.data.roomType === 'team' ? '팀 채팅' : '팀매치 채팅',
          href: room.data.linkedTarget.route ?? '/chat',
        }
      : fallback.context,
    messages: messages.data ? messageItems : isLoading ? [] : fallback.messages,
    status: isLoading ? 'loading' : isError ? 'error' : 'ready',
    emptyTitle: isError ? '채팅방을 불러오지 못했어요' : messages.data && items.length === 0 ? '아직 메시지가 없어요' : undefined,
    emptyBody: isError ? '네트워크 상태를 확인하고 다시 시도해 주세요.' : messages.data && items.length === 0 ? '먼저 말을 걸어 대화를 시작해 보세요' : undefined,
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
    onOpen: (notification) => {
      if (!notification.unread) {
        router.push(notification.href);
        return;
      }
      read.mutate(notification.id, {
        onSettled: () => router.push(notification.href),
      });
    },
  };

  return <NotificationsPageView model={model} />;
}

function toChatRoomModel(room: V1ChatRoom): ChatRoomModel {
  const type = room.roomType === 'match' ? '개인매치' : room.roomType === 'team' ? '팀' : '팀매치';
  return {
    id: room.roomId,
    title: room.title,
    type,
    href: room.linkedTarget.route ?? '/chat',
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
