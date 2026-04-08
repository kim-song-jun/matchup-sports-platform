'use client';
import { useEffect, useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import {
  createRealtimeSocket,
  disconnectSocket,
  type RealtimeSocket,
  type NotificationPayload,
  type NotificationReadPayload,
  type NotificationReadAllPayload,
  type ChatMessagePayload,
} from '@/lib/realtime-client';
import { queryKeys } from '@/hooks/use-api';
import {
  upsertNotificationList,
  markNotificationReadInList,
  markAllNotificationsReadInList,
  unreadNotificationCount,
} from '@/lib/notification-center';
import type { Notification } from '@/types/api';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

interface RealtimeState {
  socket: RealtimeSocket | null;
  connected: boolean;
  connectionState: ConnectionState;
  error: Error | null;
}

/**
 * Manages the Socket.IO connection lifecycle.
 * Connects when the user is authenticated, disconnects on logout or token change.
 */
export function useRealtime(): RealtimeState {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [state, setState] = useState<RealtimeState>({
    socket: null,
    connected: false,
    connectionState: 'disconnected',
    error: null,
  });

  useEffect(() => {
    if (!accessToken || typeof window === 'undefined') {
      setState({ socket: null, connected: false, connectionState: 'disconnected', error: null });
      return;
    }

    const socket = createRealtimeSocket(accessToken);
    setState((prev) => ({ ...prev, socket, connectionState: 'connecting' }));

    function onConnect() {
      setState({ socket, connected: true, connectionState: 'connected', error: null });
    }

    function onDisconnect() {
      setState((prev) => ({ ...prev, connected: false, connectionState: 'disconnected' }));
    }

    function onConnectError(err: Error) {
      setState((prev) => ({ ...prev, connected: false, connectionState: 'error', error: err }));
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);

    socket.connect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
    };
  }, [accessToken]);

  return state;
}

/**
 * Subscribes to `notification:new` events from the realtime socket.
 */
export function useNotificationSocket(onNew: (notification: NotificationPayload) => void) {
  const { socket } = useRealtime();

  useEffect(() => {
    if (!socket) return;
    socket.on('notification:new', onNew);
    return () => {
      socket.off('notification:new', onNew);
    };
  }, [socket, onNew]);
}

/**
 * Joins a chat room on the socket and subscribes to incoming messages.
 * Emits chat:leave on cleanup.
 */
export function useChatRoomSocket(
  roomId: string | null,
  onMessage: (payload: ChatMessagePayload) => void,
) {
  const { socket, connected } = useRealtime();
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  });

  useEffect(() => {
    if (!socket || !connected || !roomId) return;

    const handler = (p: ChatMessagePayload) => onMessageRef.current(p);

    socket.emit('chat:join', roomId);
    socket.on('chat:message', handler);

    return () => {
      socket.off('chat:message', handler);
      socket.emit('chat:leave', roomId);
    };
  }, [socket, connected, roomId]);
}

/**
 * Listens to all incoming chat:message WS events and invalidates the chat rooms
 * query so useChatUnreadTotal() picks up new unread counts across all rooms.
 * Mount once at the app level (e.g. providers.tsx).
 */
export function useChatUnreadSync() {
  const { socket, connected } = useRealtime();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket || !connected) return;

    function handleMessage() {
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.rooms });
    }

    socket.on('chat:message', handleMessage);
    return () => {
      socket.off('chat:message', handleMessage);
    };
  }, [socket, connected, queryClient]);
}

/**
 * Keeps the notification center and unread badge synchronized with websocket events.
 * Mount once at the app level.
 */
export function useNotificationSync() {
  const { socket, connected } = useRealtime();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket || !connected) return;

    const refreshNotifications = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount });
    };

    const handleVisibilityRefresh = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      refreshNotifications();
    };

    // Backfill notifications created before the socket finished connecting.
    refreshNotifications();

    function handleNew(payload: NotificationPayload) {
      const previousUnreadCount = queryClient.getQueryData<{ count: number }>(queryKeys.notifications.unreadCount);
      const nextAll = upsertNotificationList(
        queryClient.getQueryData<Notification[]>(queryKeys.notifications.list(undefined)),
        payload,
      );
      const nextUnread = payload.isRead
        ? queryClient.getQueryData<Notification[]>(queryKeys.notifications.list(false))
        : upsertNotificationList(
          queryClient.getQueryData<Notification[]>(queryKeys.notifications.list(false)),
          payload,
        );

      queryClient.setQueryData(queryKeys.notifications.list(undefined), nextAll);
      queryClient.setQueryData(queryKeys.notifications.list(false), nextUnread);
      queryClient.setQueryData(queryKeys.notifications.unreadCount, {
        count: nextAll || nextUnread
          ? unreadNotificationCount(nextAll ?? nextUnread)
          : Math.max(0, (previousUnreadCount?.count ?? 0) + (payload.isRead ? 0 : 1)),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all, refetchType: 'inactive' });
    }

    function handleRead(payload: NotificationReadPayload) {
      const previousUnreadCount = queryClient.getQueryData<{ count: number }>(queryKeys.notifications.unreadCount);
      const nextAll = markNotificationReadInList(
        queryClient.getQueryData<Notification[]>(queryKeys.notifications.list(undefined)),
        payload.notificationId,
      );
      const nextUnread = markNotificationReadInList(
        queryClient.getQueryData<Notification[]>(queryKeys.notifications.list(false)),
        payload.notificationId,
      )?.filter((notification) => !notification.isRead);
      const countSource = nextAll ?? nextUnread;

      queryClient.setQueryData(queryKeys.notifications.list(undefined), nextAll);
      queryClient.setQueryData(queryKeys.notifications.list(false), nextUnread);
      queryClient.setQueryData(queryKeys.notifications.unreadCount, {
        count: countSource
          ? unreadNotificationCount(countSource)
          : Math.max(0, (previousUnreadCount?.count ?? 0) - 1),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all, refetchType: 'inactive' });
    }

    function handleReadAll(_payload: NotificationReadAllPayload) {
      queryClient.setQueryData(
        queryKeys.notifications.list(undefined),
        (current: Notification[] | undefined) => markAllNotificationsReadInList(current),
      );
      queryClient.setQueryData<Notification[]>(queryKeys.notifications.list(false), []);
      queryClient.setQueryData(queryKeys.notifications.unreadCount, { count: 0 });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all, refetchType: 'inactive' });
    }

    socket.on('notification:new', handleNew);
    socket.on('notification:read', handleRead);
    socket.on('notification:read-all', handleReadAll);
    window.addEventListener('focus', refreshNotifications);
    document.addEventListener('visibilitychange', handleVisibilityRefresh);

    return () => {
      socket.off('notification:new', handleNew);
      socket.off('notification:read', handleRead);
      socket.off('notification:read-all', handleReadAll);
      window.removeEventListener('focus', refreshNotifications);
      document.removeEventListener('visibilitychange', handleVisibilityRefresh);
    };
  }, [socket, connected, queryClient]);
}

export { disconnectSocket };
