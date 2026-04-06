'use client';
import { useEffect, useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import {
  createRealtimeSocket,
  disconnectSocket,
  type RealtimeSocket,
  type NotificationPayload,
  type ChatMessagePayload,
} from '@/lib/realtime-client';
import { queryKeys } from '@/hooks/use-api';

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

export { disconnectSocket };
