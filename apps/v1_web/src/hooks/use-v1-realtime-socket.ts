import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { QueryClient, Query } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
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

const RESYNC_DEBOUNCE_MS = 1000;

function isChatListQuery(query: Query): boolean {
  const root = v1Keys.chatRooms();
  return query.queryKey.length === root.length || query.queryKey[root.length] === 'list';
}

function isChatMessagesQuery(query: Query): boolean {
  const root = v1Keys.chatRooms();
  return query.queryKey.length > root.length + 1 && query.queryKey[root.length + 1] === 'messages';
}

// Block changes must not leave the other side's messages readable, even while the refetch is slow or fails:
// message caches are reset (an open room falls back to its skeleton), the rest is dropped when unmounted
// and refetched in place otherwise.
function refreshChatAfterSafetyChange(queryClient: QueryClient): void {
  const root = v1Keys.chatRooms();
  void queryClient.cancelQueries({ queryKey: root }).then(() => {
    queryClient.removeQueries({ queryKey: root, type: 'inactive' });
    void queryClient.resetQueries({ queryKey: root, predicate: isChatMessagesQuery });
    void queryClient.invalidateQueries({ queryKey: root, predicate: (query) => !isChatMessagesQuery(query) });
  });
  void queryClient.invalidateQueries({ queryKey: [...v1Keys.all, 'chat', 'blocked-users'] });
}

type RetainedChatSync = { count: number; release: () => void };
const retainedChatSync = new WeakMap<QueryClient, WeakMap<Socket, RetainedChatSync>>();

/**
 * Registers the socket-level chat listeners (block changes, resync after reconnect / tab return) once per
 * socket and query client, however many hooks ask for them. The returned function releases one hold.
 */
function retainChatSync(queryClient: QueryClient, socket: Socket): () => void {
  const sockets = retainedChatSync.get(queryClient) ?? new WeakMap<Socket, RetainedChatSync>();
  retainedChatSync.set(queryClient, sockets);
  let entry = sockets.get(socket);
  if (!entry) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A reconnect storm or quick tab switching collapses into one refetch.
    let includeLists = false;
    const scheduleResync = (lists: boolean) => {
      includeLists ||= lists;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const withLists = includeLists;
        includeLists = false;
        void queryClient.invalidateQueries({
          queryKey: v1Keys.chatRooms(),
          predicate: (query) => isChatMessagesQuery(query) || (withLists && isChatListQuery(query)),
        });
      }, RESYNC_DEBOUNCE_MS);
    };
    // Messages emitted while the socket was down are never replayed, so every connect resyncs — including a
    // first connect that arrives after the REST reads (a socket already connected here emits no first connect).
    const onConnect = () => scheduleResync(true);
    // Lists refetch themselves on window focus (refetchOnWindowFocus: 'always'); only messages need this.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') scheduleResync(false);
    };
    const onSafety = () => refreshChatAfterSafetyChange(queryClient);
    socket.on('connect', onConnect);
    socket.on('chat:safety-changed', onSafety);
    document.addEventListener('visibilitychange', onVisibility);
    entry = {
      count: 0,
      release: () => {
        clearTimeout(timer);
        socket.off('connect', onConnect);
        socket.off('chat:safety-changed', onSafety);
        document.removeEventListener('visibilitychange', onVisibility);
        sockets.delete(socket);
      },
    };
    sockets.set(socket, entry);
  }
  entry.count += 1;
  const held = entry;
  return () => {
    held.count -= 1;
    if (held.count === 0) held.release();
  };
}

export function useV1NotificationSocket(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getV1Socket();
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.notificationsRoot() });
      queryClient.invalidateQueries({ queryKey: v1Keys.notificationUnreadSummary() });
    };
    socket.on('notification:new', handler);
    const releaseChatSync = retainChatSync(queryClient, socket);
    return () => {
      socket.off('notification:new', handler);
      releaseChatSync();
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
    socket.on('chat:message', handler);
    // The global bridge is absent when the session began after page load; the room must still react itself.
    const releaseChatSync = retainChatSync(queryClient, socket);
    return () => {
      socket.off('chat:message', handler);
      releaseChatSync();
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
    const releaseChatSync = retainChatSync(queryClient, socket);
    return () => {
      socket.off('chat:message', handler);
      releaseChatSync();
    };
  }, [queryClient, enabled]);
}
