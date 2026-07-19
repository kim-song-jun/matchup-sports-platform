import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

    listeners['chat:message']({ roomId: 'room-1', text: 'hi' });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: v1Keys.chatRoom('room-1') });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: v1Keys.chatMessages('room-1') });

    unmount();

    expect(mockSocket.off).toHaveBeenCalledWith('chat:message', expect.any(Function));
  });
});
