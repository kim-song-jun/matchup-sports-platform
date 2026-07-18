import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const listeners: Record<string, (payload: unknown) => void> = {};
const mockSocket = {
  on: vi.fn((event: string, cb: (payload: unknown) => void) => {
    listeners[event] = cb;
  }),
  off: vi.fn(),
  emit: vi.fn(),
};

vi.mock('@/lib/v1-socket', () => ({ getV1Socket: () => mockSocket }));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

afterEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(listeners)) delete listeners[key];
});

describe('useV1NotificationSocket', () => {
  it('subscribes to notification:new and unsubscribes on unmount', async () => {
    const { useV1NotificationSocket } = await import('./use-v1-realtime-socket');
    const { unmount } = renderHook(() => useV1NotificationSocket(), { wrapper });

    expect(mockSocket.on).toHaveBeenCalledWith('notification:new', expect.any(Function));

    unmount();

    expect(mockSocket.off).toHaveBeenCalledWith('notification:new', expect.any(Function));
  });
});

describe('useV1ChatRoomSocket', () => {
  it('joins the room and subscribes to chat:message', async () => {
    const { useV1ChatRoomSocket } = await import('./use-v1-realtime-socket');
    renderHook(() => useV1ChatRoomSocket('room-1'), { wrapper });

    expect(mockSocket.emit).toHaveBeenCalledWith('chat:join', { roomId: 'room-1' });
    expect(mockSocket.on).toHaveBeenCalledWith('chat:message', expect.any(Function));
  });
});
