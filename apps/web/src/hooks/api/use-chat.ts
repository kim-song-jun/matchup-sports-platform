'use client';

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import type {
  ChatRoom,
  ChatMessage,
  ChatRoomType,
  CursorPage,
  PaginatedResponse,
  CreateChatRoomInput,
  SendMessageInput,
} from '@/types/api';
import { extractData, extractCursorPage } from './shared';
import { queryKeys } from './query-keys';

// ── Chat ──
export function useChatRooms() {
  const { isAuthenticated } = useAuthStore();
  return useQuery<ChatRoom[]>({
    queryKey: queryKeys.chat.rooms,
    queryFn: async () => {
      const res = await api.get('/chat/rooms');
      const data = extractData<ChatRoom[] | PaginatedResponse<ChatRoom>>(res);
      if (Array.isArray(data)) {
        return data;
      }

      const paginated = data as PaginatedResponse<ChatRoom> & { data?: ChatRoom[] };
      return paginated.items ?? paginated.data ?? [];
    },
    enabled: isAuthenticated,
    staleTime: 30 * 1000,
  });
}

export function useChatUnreadTotal(): number {
  const { isAuthenticated } = useAuthStore();
  const { data } = useQuery<{ unreadCount: number }>({
    queryKey: queryKeys.chat.unreadCount,
    queryFn: async () => {
      const res = await api.get('/chat/unread-count');
      return extractData<{ unreadCount: number }>(res);
    },
    enabled: isAuthenticated,
    staleTime: 30 * 1000,
    refetchInterval: isAuthenticated ? 60 * 1000 : false,
    refetchIntervalInBackground: false,
  });
  return data?.unreadCount ?? 0;
}

export function useChatMessages(roomId: string) {
  return useInfiniteQuery<CursorPage<ChatMessage>>({
    queryKey: queryKeys.chat.messages(roomId),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const url = `/chat/rooms/${roomId}/messages?limit=20${pageParam ? `&before=${pageParam}` : ''}`;
      const res = await api.get(url);
      return extractCursorPage<ChatMessage>(res);
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!roomId,
  });
}

export function useCreateChatRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateChatRoomInput) => {
      const res = await api.post('/chat/rooms', data);
      return extractData<ChatRoom>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.rooms });
    },
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ roomId, data }: { roomId: string; data: SendMessageInput }) => {
      const res = await api.post(`/chat/rooms/${roomId}/messages`, data);
      return extractData<ChatMessage>(res);
    },
    onSuccess: () => {
      // New messages arrive via WebSocket — only refresh rooms list for preview update
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.rooms });
    },
  });
}

// Opens or reuses a direct (1:1) chat room with another user.
// Returns the ChatRoom so the caller can redirect to /chat/:id.
export function useStartDirectChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ withUserId }: { withUserId: string }) => {
      const res = await api.post('/chat/rooms', {
        type: 'direct' as ChatRoomType,
        participantIds: [withUserId],
      });
      return extractData<ChatRoom>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.rooms });
    },
  });
}

export function useMarkChatRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ roomId, messageId }: { roomId: string; messageId: string }) => {
      const res = await api.patch(`/chat/rooms/${roomId}/read`, { messageId });
      return extractData<{ lastReadAt?: string }>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.rooms });
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.unreadCount });
    },
  });
}
