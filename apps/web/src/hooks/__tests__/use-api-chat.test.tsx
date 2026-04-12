import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@/lib/api', () => {
  const mockApi = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  };

  return { api: mockApi };
});

import { api } from '@/lib/api';
import { useChatMessages, useCreateChatRoom, useMarkChatRead } from '../use-api';
import type { ChatMessage, CursorPage } from '@/types/api';

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
};

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return { Wrapper, queryClient };
}

describe('chat api hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses chat messages as a cursor page and uses nextCursor for pagination', async () => {
    const firstPage: CursorPage<ChatMessage> = {
      data: [
        {
          id: 'msg-2',
          roomId: 'room-1',
          senderId: 'user-2',
          content: 'latest',
          createdAt: '2026-04-11T10:00:00.000Z',
        },
      ],
      nextCursor: 'cursor-1',
      hasMore: true,
    };
    const secondPage: CursorPage<ChatMessage> = {
      data: [
        {
          id: 'msg-1',
          roomId: 'room-1',
          senderId: 'user-1',
          content: 'older',
          createdAt: '2026-04-11T09:00:00.000Z',
        },
      ],
      nextCursor: null,
      hasMore: false,
    };

    mockApi.get
      .mockResolvedValueOnce({ status: 'success', data: firstPage })
      .mockResolvedValueOnce({ status: 'success', data: secondPage });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useChatMessages('room-1'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.get).toHaveBeenCalledWith('/chat/rooms/room-1/messages?limit=20');
    expect(result.current.data?.pages[0]).toEqual(firstPage);

    await result.current.fetchNextPage();

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(mockApi.get).toHaveBeenCalledWith('/chat/rooms/room-1/messages?limit=20&before=cursor-1');
    expect(result.current.data?.pages[1]).toEqual(secondPage);
  });

  it('marks chat read with PATCH and messageId payload', async () => {
    mockApi.patch.mockResolvedValueOnce({
      status: 'success',
      data: { lastReadAt: '2026-04-11T10:00:00.000Z' },
    });

    const { Wrapper, queryClient } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useMarkChatRead(), { wrapper: Wrapper });

    result.current.mutate({ roomId: 'room-1', messageId: 'msg-2' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.patch).toHaveBeenCalledWith('/chat/rooms/room-1/read', {
      messageId: 'msg-2',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['chat', 'rooms'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['chat', 'unread-count'] });
  });

  it('creates chat rooms with the canonical CreateRoomDto fields', async () => {
    mockApi.post.mockResolvedValueOnce({
      status: 'success',
      data: { id: 'room-1', name: '매치 채팅', type: 'team_match' },
    });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreateChatRoom(), { wrapper: Wrapper });

    result.current.mutate({ type: 'team_match', teamMatchId: 'tm-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.post).toHaveBeenCalledWith('/chat/rooms', {
      type: 'team_match',
      teamMatchId: 'tm-1',
    });
  });
});
