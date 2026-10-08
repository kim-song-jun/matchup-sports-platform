import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { v1Keys } from '@/lib/query-keys';

const listeners: Record<string, (payload: unknown) => void> = {};
const mockSocket = {
  on: vi.fn((event: string, cb: (payload: unknown) => void) => {
    listeners[event] = cb;
  }),
  off: vi.fn(),
  emit: vi.fn(),
};

vi.mock('@/lib/v1-socket', () => ({ getV1Socket: () => mockSocket }));

function createWrapper(queryClient: QueryClient) {
  return function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

afterEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(listeners)) delete listeners[key];
});

describe('useV1NotificationSocket', () => {
  it('invalidates notification queries when notification:new fires, and unsubscribes on unmount', async () => {
    const { useV1NotificationSocket } = await import('./use-v1-realtime-socket');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { unmount } = renderHook(() => useV1NotificationSocket(), {
      wrapper: createWrapper(queryClient),
    });

    expect(mockSocket.on).toHaveBeenCalledWith('notification:new', expect.any(Function));

    // Actually invoke the captured listener, as the server would.
    listeners['notification:new']({ id: 'n1' });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: v1Keys.notificationsRoot() });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: v1Keys.notificationUnreadSummary() });

    unmount();

    expect(mockSocket.off).toHaveBeenCalledWith('notification:new', expect.any(Function));
  });
});

describe('useV1ChatRoomSocket', () => {
  it('one message event refreshes the current detail and nested message query once', async () => {
    // Given active detail and message observers sharing the actual room key prefix.
    const { useV1ChatRoomSocket } = await import('./use-v1-realtime-socket');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let detailReads = 0;
    let messageReads = 0;
    const detail = new QueryObserver(queryClient, {
      queryKey: v1Keys.chatRoom('room-1'),
      queryFn: async () => ({ revision: ++detailReads }),
    });
    const messages = new QueryObserver(queryClient, {
      queryKey: [...v1Keys.chatMessages('room-1'), { limit: 50 }],
      queryFn: async () => ({ revision: ++messageReads }),
    });
    const stopDetail = detail.subscribe(() => {});
    const stopMessages = messages.subscribe(() => {});
    const { unmount } = renderHook(() => useV1ChatRoomSocket('room-1'), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(messages.getCurrentResult().data).toEqual({ revision: 1 }));

    // When one actual socket callback invalidates the open room.
    listeners['chat:message']({ roomId: 'room-1', messageId: 'msg-1', senderUserId: 'user-a' });

    // Then the nested message request is not cancelled and restarted by a redundant second invalidation.
    await waitFor(() => expect(messages.getCurrentResult().data).toEqual({ revision: 2 }));
    expect(detail.getCurrentResult().data).toEqual({ revision: 2 });
    expect({ detailReads, messageReads }).toEqual({ detailReads: 2, messageReads: 2 });
    unmount();
    stopDetail();
    stopMessages();
    queryClient.clear();
  });
  it('clears cached messages when a remote participant changes a block, without the global bridge', async () => {
    const { useV1ChatRoomSocket } = await import('./use-v1-realtime-socket');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(v1Keys.chatMessages('room-1'), { items: [{ content: 'previously visible' }] });
    const { unmount } = renderHook(() => useV1ChatRoomSocket('room-1'), { wrapper: createWrapper(queryClient) });
    listeners['chat:safety-changed']({});
    await waitFor(() => expect(queryClient.getQueryData(v1Keys.chatMessages('room-1'))).toBeUndefined());
    unmount();
  });
  it('invalidates chat room queries for the given room when chat:message fires', async () => {
    const { useV1ChatRoomSocket } = await import('./use-v1-realtime-socket');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { unmount } = renderHook(() => useV1ChatRoomSocket('room-1'), {
      wrapper: createWrapper(queryClient),
    });

    expect(mockSocket.on).toHaveBeenCalledWith('chat:message', expect.any(Function));
    // No client-side room join event should be emitted — the server
    // broadcasts on the per-user room joined in handleConnection.
    expect(mockSocket.emit).not.toHaveBeenCalled();

    listeners['chat:message']({ roomId: 'room-1', messageId: 'msg-1', text: 'hi' });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: v1Keys.chatRooms(), predicate: expect.any(Function) });

    unmount();

    expect(mockSocket.off).toHaveBeenCalledWith('chat:message', expect.any(Function));
  });
});

describe('useV1ChatListSocket', () => {
  it('keeps dedupe bounded and forgets identities when the cached query is removed', async () => {
    // Given a real active query and the actual message listener.
    const { useV1ChatListSocket } = await import('./use-v1-realtime-socket');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let reads = 0;
    const options = { queryKey: v1Keys.chatRooms(), queryFn: async () => ++reads };
    const first = new QueryObserver(queryClient, options);
    const stopFirst = first.subscribe(() => {});
    const { unmount } = renderHook(() => useV1ChatListSocket(), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(first.getCurrentResult().data).toBe(1));
    // When more than the recent identity budget arrives, the newest duplicate still coalesces.
    for (let index = 0; index <= 100; index += 1) {
      listeners['chat:message']({ roomId: 'room-1', messageId: `msg-${index}` });
    }
    await waitFor(() => expect(first.getCurrentResult().data).toBe(102));
    listeners['chat:message']({ roomId: 'room-1', messageId: 'msg-100' });
    expect(reads).toBe(102);
    // Then the oldest identity has been evicted instead of accumulating forever.
    listeners['chat:message']({ roomId: 'room-1', messageId: 'msg-0' });
    await waitFor(() => expect(first.getCurrentResult().data).toBe(103));
    stopFirst();
    queryClient.removeQueries({ queryKey: v1Keys.chatRooms() });
    const second = new QueryObserver(queryClient, options);
    const stopSecond = second.subscribe(() => {});
    await waitFor(() => expect(second.getCurrentResult().data).toBe(104));
    listeners['chat:message']({ roomId: 'room-1', messageId: 'msg-100' });
    await waitFor(() => expect(second.getCurrentResult().data).toBe(105));
    unmount();
    stopSecond();
    queryClient.clear();
  });

  it('refreshes bare and filtered list keys without refetching an open room subtree', async () => {
    const { useV1ChatListSocket } = await import('./use-v1-realtime-socket');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const reads = { base: 0, filtered: 0, room: 0, messages: 0 };
    const keys = {
      base: v1Keys.chatRooms(),
      filtered: [...v1Keys.chatRooms(), 'list', { roomType: 'team', limit: 50 }],
      room: v1Keys.chatRoom('room-1'),
      messages: [...v1Keys.chatMessages('room-1'), { limit: 50 }],
    };
    const names = ['base', 'filtered', 'room', 'messages'] as const;
    const observers = names.map((name) => new QueryObserver(queryClient, {
      queryKey: keys[name], queryFn: async () => ++reads[name],
    }));
    const stops = observers.map((observer) => observer.subscribe(() => {}));
    const { unmount } = renderHook(() => useV1ChatListSocket(), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(reads).toEqual({ base: 1, filtered: 1, room: 1, messages: 1 }));

    listeners['chat:message']({ roomId: 'room-1', messageId: 'msg-1', senderUserId: 'user-a' });

    await waitFor(() => expect(reads).toEqual({ base: 2, filtered: 2, room: 1, messages: 1 }));
    unmount();
    for (const stop of stops) stop();
    queryClient.clear();
    expect(mockSocket.off).toHaveBeenCalledWith('chat:message', expect.any(Function));
  });
});
