import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { getV1Socket } from '@/lib/v1-socket';
import { v1Keys } from '@/lib/query-keys';

type ChatMessageIdentity = { readonly roomId: string; readonly messageId: string };
const MAX_RECENT_CHAT_MESSAGES = 100;
// Query removal (including logout) releases identities; each cache entry keeps a bounded recent set.
const refreshedChatMessages = new WeakMap<QueryClient, WeakMap<object, Set<string>>>();

function chatMessageIdentity(payload: unknown): ChatMessageIdentity | null {
  if (typeof payload !== 'object' || payload === null
    || !('roomId' in payload) || typeof payload.roomId !== 'string'
    || !('messageId' in payload) || typeof payload.messageId !== 'string') return null;
  return { roomId: payload.roomId, messageId: payload.messageId };
}

export function invalidateV1ChatMessageQueries(
  queryClient: QueryClient,
  message: ChatMessageIdentity,
  scope: 'list' | 'room' | 'all' = 'all',
): void {
  const refreshedQueries = refreshedChatMessages.get(queryClient) ?? new WeakMap<object, Set<string>>();
  refreshedChatMessages.set(queryClient, refreshedQueries);
  const root = v1Keys.chatRooms();
  const refresh = new Set<object>();
  for (const query of queryClient.getQueryCache().findAll({ queryKey: root })) {
    const isList = query.queryKey.length === root.length
      || (query.queryKey.length === root.length + 2 && query.queryKey[root.length] === 'list'
        && typeof query.queryKey[root.length + 1] === 'object');
    const isRoom = query.queryKey[root.length] === message.roomId;
    if (!((scope !== 'room' && isList) || (scope !== 'list' && isRoom))) continue;
    const recent = refreshedQueries.get(query) ?? new Set<string>();
    // A failed read remains visible and retryable; an in-flight/successful read coalesces the POST/event.
    if (recent.has(message.messageId)
      && !(query.state.status === 'error' && query.state.fetchStatus === 'idle')) continue;
    recent.add(message.messageId);
    if (recent.size > MAX_RECENT_CHAT_MESSAGES) {
      const oldest = recent.values().next().value;
      if (oldest !== undefined) recent.delete(oldest);
    }
    refreshedQueries.set(query, recent);
    // TanStack otherwise joins a cold request whose snapshot can predate this committed message.
    if (query.state.data === undefined && query.state.fetchStatus === 'fetching') {
      void queryClient.cancelQueries({ queryKey: query.queryKey, exact: true });
    }
    refresh.add(query);
  }
  // TanStack evaluates the predicate for invalidation and again for refetching; keep it pure.
  void queryClient.invalidateQueries({ queryKey: root, predicate: (query) => refresh.has(query) });
}

export function useV1NotificationSocket(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getV1Socket();
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.notificationsRoot() });
      queryClient.invalidateQueries({ queryKey: v1Keys.notificationUnreadSummary() });
    };
    const safetyHandler = () => {
      void queryClient.cancelQueries({ queryKey: v1Keys.chatRooms() }).then(() => queryClient.resetQueries({ queryKey: v1Keys.chatRooms() }));
      void queryClient.invalidateQueries({ queryKey: [...v1Keys.all, 'chat', 'blocked-users'] });
    };
    socket.on('chat:safety-changed', safetyHandler);
    socket.on('notification:new', handler);
    return () => {
      socket.off('chat:safety-changed', safetyHandler);
      socket.off('notification:new', handler);
    };
  }, [queryClient]);
}

export function useV1ChatRoomSocket(roomId: string): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getV1Socket();
    const handler = (payload: unknown) => {
      const message = chatMessageIdentity(payload);
      if (message?.roomId === roomId) invalidateV1ChatMessageQueries(queryClient, message, 'room');
    };
    // The global bridge may have mounted before login; the active room must
    // also clear cached content when either participant changes a block.
    const safetyHandler = () => {
      void queryClient.cancelQueries({ queryKey: v1Keys.chatRooms() }).then(() => queryClient.resetQueries({ queryKey: v1Keys.chatRooms() }));
    };
    socket.on('chat:safety-changed', safetyHandler);
    socket.on('chat:message', handler);
    return () => {
      socket.off('chat:safety-changed', safetyHandler);
      socket.off('chat:message', handler);
    };
  }, [queryClient, roomId]);
}

export function useV1ChatListSocket(enabled = true): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    const socket = getV1Socket();
    const handler = (payload: unknown) => {
      const message = chatMessageIdentity(payload);
      if (message) invalidateV1ChatMessageQueries(queryClient, message, 'list');
    };
    socket.on('chat:message', handler);
    return () => { socket.off('chat:message', handler); };
  }, [queryClient, enabled]);
}
