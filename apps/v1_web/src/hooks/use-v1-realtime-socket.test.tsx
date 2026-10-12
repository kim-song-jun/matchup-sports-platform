import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { v1Keys } from '@/lib/query-keys';
import { V1ApiError } from '@/lib/api-client';

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

describe('채팅 재동기화와 안전 이벤트', () => {
  function observe(queryClient: QueryClient, queryKey: readonly unknown[], reads: Record<string, number>, name: string) {
    const observer = new QueryObserver(queryClient, {
      queryKey,
      queryFn: async () => ({ revision: (reads[name] = (reads[name] ?? 0) + 1) }),
      staleTime: Infinity,
    });
    return observer.subscribe(() => {});
  }
  const setVisibility = (state: DocumentVisibilityState) =>
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function setupRoom() {
    const { useV1ChatRoomSocket } = await import('./use-v1-realtime-socket');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const reads: Record<string, number> = {};
    const stops = [
      observe(queryClient, [...v1Keys.chatRooms(), 'list', { limit: 50 }], reads, 'list'),
      observe(queryClient, v1Keys.chatRoom('room-1'), reads, 'detail'),
      observe(queryClient, [...v1Keys.chatMessages('room-1'), { limit: 50 }], reads, 'messages'),
    ];
    const { unmount } = renderHook(() => useV1ChatRoomSocket('room-1'), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(reads).toEqual({ list: 1, detail: 1, messages: 1 }));
    vi.useFakeTimers();
    return { reads, cleanup: () => { unmount(); stops.forEach((stop) => stop()); } };
  }

  it('소켓이 이미 붙어 있을 때 방을 열면(앱 안 이동) 방 목록·메시지를 한 번씩만 요청한다', async () => {
    const { reads, cleanup } = await setupRoom();

    await vi.advanceTimersByTimeAsync(5000);
    expect(reads).toEqual({ list: 1, detail: 1, messages: 1 });

    cleanup();
  });

  it('REST 읽기 뒤 첫 연결은 방 목록·상세·메시지를 한 번만 다시 받는다', async () => {
    const { reads, cleanup } = await setupRoom();

    listeners.connect(undefined);
    listeners.connect(undefined);
    listeners.connect(undefined);
    await vi.advanceTimersByTimeAsync(2000);
    expect(reads).toEqual({ list: 2, detail: 2, messages: 2 });

    cleanup();
  });

  async function setupErroredQuery(statusCode: number, kind: 'messages' | 'detail' | 'list' = 'messages') {
    const { useV1ChatRoomSocket } = await import('./use-v1-realtime-socket');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const counter = { reads: 0 };
    const observer = new QueryObserver(queryClient, {
      queryKey: kind === 'detail' ? v1Keys.chatRoom('room-1')
        : kind === 'list' ? v1Keys.chatRooms()
          : [...v1Keys.chatMessages('room-1'), { limit: 50 }],
      queryFn: async () => {
        counter.reads += 1;
        throw new V1ApiError({ status: 'error', statusCode, code: 'X', message: 'fail', timestamp: '2026-10-12T00:00:00Z' });
      },
    });
    const stop = observer.subscribe(() => {});
    const { unmount } = renderHook(() => useV1ChatRoomSocket('room-1'), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(observer.getCurrentResult().isError).toBe(true));
    vi.useFakeTimers();
    return { counter, cleanup: () => { unmount(); stop(); } };
  }

  it.each(['messages', 'detail', 'list'] as const)('4xx 로 끝난 %s 조회는 연결·재연결·탭 복귀에도 다시 받지 않는다', async (kind) => {
    const { counter, cleanup } = await setupErroredQuery(404, kind);
    listeners.connect(undefined);
    await vi.advanceTimersByTimeAsync(2000);
    listeners.connect(undefined);
    await vi.advanceTimersByTimeAsync(2000);
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(counter.reads).toBe(1);
    cleanup();
  });

  it.each(['messages', 'detail', 'list'] as const)('5xx 로 끝난 %s 조회는 재연결 때 다시 받는다', async (kind) => {
    const { counter, cleanup } = await setupErroredQuery(503, kind);
    listeners.connect(undefined);
    await vi.advanceTimersByTimeAsync(2000);
    expect(counter.reads).toBe(2);
    cleanup();
  });

  it('방금 다시 받은 직후 재연결해도 목록과 메시지를 또 다시 받는다', async () => {
    const { reads, cleanup } = await setupRoom();

    listeners.connect(undefined);
    await vi.advanceTimersByTimeAsync(2000);
    expect(reads).toEqual({ list: 2, detail: 2, messages: 2 });

    listeners.connect(undefined);
    await vi.advanceTimersByTimeAsync(2000);
    expect(reads).toEqual({ list: 3, detail: 3, messages: 3 });

    cleanup();
  });

  it('탭이 다시 보이면 열린 방 메시지만 다시 받고(목록은 포커스 갱신 몫), 숨겨질 때는 받지 않는다', async () => {
    const { useV1ChatRoomSocket } = await import('./use-v1-realtime-socket');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const reads: Record<string, number> = {};
    const stops = [
      observe(queryClient, [...v1Keys.chatRooms(), 'list', { limit: 50 }], reads, 'list'),
      observe(queryClient, [...v1Keys.chatMessages('room-1'), { limit: 50 }], reads, 'messages'),
    ];
    const { unmount } = renderHook(() => useV1ChatRoomSocket('room-1'), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(reads).toEqual({ list: 1, messages: 1 }));
    vi.useFakeTimers();

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(reads).toEqual({ list: 1, messages: 1 });

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(reads).toEqual({ list: 1, messages: 2 });

    unmount();
    stops.forEach((stop) => stop());
  });

  it('전역 브리지·방·목록 훅이 함께 떠 있어도 안전 이벤트 핸들러는 한 번만 등록한다', async () => {
    const { useV1ChatListSocket, useV1ChatRoomSocket, useV1NotificationSocket } = await import('./use-v1-realtime-socket');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { unmount } = renderHook(() => {
      useV1NotificationSocket();
      useV1ChatRoomSocket('room-1');
      useV1ChatListSocket();
    }, { wrapper: createWrapper(queryClient) });

    const registered = (event: string) => mockSocket.on.mock.calls.filter(([name]) => name === event).length;
    expect(registered('chat:safety-changed')).toBe(1);
    expect(registered('connect')).toBe(1);

    unmount();
    expect(mockSocket.off.mock.calls.filter(([name]) => name === 'chat:safety-changed')).toHaveLength(1);
  });

  it('차단이 바뀌면 열려 있는 방의 메시지는 다시 받는 동안에도 보이지 않는다(느리거나 실패해도 남지 않는다)', async () => {
    const { useV1ChatRoomSocket } = await import('./use-v1-realtime-socket');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let reads = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const key = [...v1Keys.chatMessages('room-1'), { limit: 50 }];
    const observer = new QueryObserver(queryClient, {
      queryKey: key,
      queryFn: async () => {
        reads += 1;
        if (reads > 1) await gate;
        return { revision: reads };
      },
    });
    const stop = observer.subscribe(() => {});
    const { unmount } = renderHook(() => useV1ChatRoomSocket('room-1'), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(observer.getCurrentResult().data).toEqual({ revision: 1 }));

    listeners['chat:safety-changed']({});
    await waitFor(() => expect(observer.getCurrentResult().isFetching).toBe(true));

    expect(observer.getCurrentResult().data).toBeUndefined();
    release();
    await waitFor(() => expect(observer.getCurrentResult().data).toEqual({ revision: 2 }));
    unmount();
    stop();
  });
});
