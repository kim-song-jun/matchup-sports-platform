'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useV1ChatMessages,
  useV1ChatRoom,
  useV1ChatRooms,
  useV1LeaveChatRoom,
  useV1Notifications,
  useV1ReadAllNotifications,
  useV1ReadNotification,
  useV1SendChatMessage,
  useV1UpdateChatRoomMe,
  useV1UpdateMyChatRoom,
} from '@/hooks/use-v1-api';
import type { V1ChatMessage, V1ChatRoom, V1Notification } from '@/types/api';
import { ChatListPageView, ChatRoomPageView, NotificationsPageView } from './community-page';
import type { ChatListViewModel, ChatRoomModel, ChatRoomViewModel, NotificationModel, NotificationsViewModel } from './community.types';
import { getChatListViewModel, getChatRoomViewModel } from './community.view-model';

type ChatCategory = ChatRoomModel['type'] | '전체';

export function ChatListPageClient() {
  const [selectedCategory, setSelectedCategory] = useState<ChatCategory>('전체');
  const [leaveTarget, setLeaveTarget] = useState<ChatRoomModel | null>(null);
  const query = useV1ChatRooms();
  const updateMe = useV1UpdateChatRoomMe();
  const leaveRoom = useV1LeaveChatRoom();
  const fallback = getChatListViewModel();
  const baseRooms = query.data?.items.map(toChatRoomModel) ?? fallback.pinnedRooms.concat(fallback.rooms);
  const rooms = baseRooms.map((room) => ({
    ...room,
    actionPending:
      (updateMe.isPending && updateMe.variables?.roomId === room.id) ||
      (leaveRoom.isPending && leaveRoom.variables?.roomId === room.id),
    onTogglePin: () => updateMe.mutate({ roomId: room.id, pinned: !room.pinned }),
    onRequestLeave: () => setLeaveTarget(room),
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
    emptyTitle: query.isError ? '채팅방을 불러오지 못했습니다' : isEmpty ? `${selectedCategory} 채팅방이 없어요` : undefined,
    emptyBody: query.isError ? '잠시 후 다시 시도해주세요.' : isEmpty ? '매치에 참가하거나 팀에 가입하면 채팅방이 생깁니다.' : undefined,
    emptyHref: query.isError ? undefined : '/matches',
    onRetry: query.isError ? () => query.refetch() : undefined,
    leaveConfirm: leaveTarget
      ? {
          title: '채팅방을 나갈까요?',
          body: '나가면 목록에서 사라지고, 새 메시지는 다시 초대되기 전까지 받을 수 없습니다.',
          pending: leaveRoom.isPending,
          onCancel: () => setLeaveTarget(null),
          onConfirm: () =>
            leaveRoom.mutate(
              { roomId: leaveTarget.id, reason: 'user_leave' },
              { onSuccess: () => setLeaveTarget(null) },
            ),
        }
      : undefined,
  };

  return <ChatListPageView model={model} />;
}

export function ChatRoomPageClient({ roomId }: { roomId: string }) {
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
  const model: ChatRoomViewModel = {
    title: room.data?.title ?? fallback.title,
    context: room.data
      ? {
          title: room.data.linkedTarget.title,
          sub: room.data.roomType === 'match' ? '개인매치 채팅' : '팀매치 채팅',
          href: room.data.linkedTarget.route ?? '/chat',
        }
      : fallback.context,
    messages: items.length ? items.map(toChatMessageModel) : fallback.messages,
    draft,
    sending: send.isPending,
    onDraftChange: setDraft,
    onSend: () => {
      const content = draft.trim();
      if (!content) return;
      send.mutate(
        { content },
        {
          onSuccess: () => setDraft(''),
        },
      );
    },
  };

  return <ChatRoomPageView model={model} />;
}

export function NotificationsPageClient() {
  const router = useRouter();
  const query = useV1Notifications({ limit: 50 });
  const read = useV1ReadNotification();
  const readAll = useV1ReadAllNotifications();
  const notifications = Array.isArray(query.data?.items) ? query.data.items.map(toNotificationModel) : [];
  const model: NotificationsViewModel = {
    unreadCount: typeof query.data?.unreadCount === 'number' ? query.data.unreadCount : 0,
    notifications,
    readAllPending: readAll.isPending,
    onReadAll: () => readAll.mutate({}),
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
  const type = room.roomType === 'match' ? '개인매치' : '팀매치';
  return {
    id: room.roomId,
    title: room.title,
    type,
    href: room.linkedTarget.route ?? '/chat',
    last: room.lastMessage?.contentPreview ?? '아직 메시지가 없습니다.',
    time: formatRelative(room.lastMessage?.sentAt),
    unread: room.unreadCount,
    pinned: room.pinned,
    initials: room.title.slice(0, 1) || '채',
  };
}

function toChatMessageModel(message: V1ChatMessage): ChatRoomViewModel['messages'][number] {
  return {
    id: message.messageId,
    who: message.mine ? 'me' : 'other',
    label: message.mine ? '나' : message.sender.displayName,
    body: message.content ?? '삭제된 메시지입니다.',
  };
}

function toNotificationModel(notification: V1Notification): NotificationModel {
  const href = normalizeNotificationHref(notification.target?.route);
  return {
    id: notification.notificationId,
    group: isToday(notification.createdAt) ? '오늘' : '어제',
    title: notification.title,
    body: notification.body ?? '',
    time: formatRelative(notification.createdAt),
    unread: notification.status !== 'read',
    href,
    actionLabel: notification.type === 'chat' ? '채팅 열기' : '보기',
  };
}

function normalizeNotificationHref(route?: string | null) {
  if (!route) return '/notifications';
  if (route.startsWith('/chat/rooms/')) return route.replace('/chat/rooms/', '/chat/');
  return route;
}

function isToday(value: string) {
  const date = new Date(value);
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

function formatRelative(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}
