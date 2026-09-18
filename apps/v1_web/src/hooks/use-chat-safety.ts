'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { v1Delete, v1Get, v1Post } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';
import type { V1InquiryReportReason } from '@/types/api';

const blockedKey = [...v1Keys.all, 'chat', 'blocked-users'] as const;
export function useChatSafety(roomId: string, manage: boolean) {
  const client = useQueryClient();
  const refresh = async () => {
    await client.cancelQueries({ queryKey: v1Keys.chatRooms() });
    await client.resetQueries({ queryKey: v1Keys.chatRooms() });
    await client.invalidateQueries({ queryKey: blockedKey });
  };
  const blocked = useQuery({
    queryKey: blockedKey,
    queryFn: () => v1Get<{ items: Array<{ userId: string; displayName: string }> }>('/chat/blocked-users'),
    enabled: manage,
  });
  const block = useMutation({
    mutationFn: (messageId: string) => v1Post<{ blocked: true }>(`/chat/rooms/${roomId}/messages/${messageId}/block`, {}),
    onSuccess: refresh,
  });
  const unblock = useMutation({
    mutationFn: (userId: string) => v1Delete(`/chat/blocked-users/${userId}`),
    onSuccess: refresh,
  });
  const report = useMutation({
    mutationFn: ({ messageId, ...body }: { messageId: string; reason: V1InquiryReportReason; detail: string }) =>
      v1Post<{ inquiryId: string }>(`/chat/rooms/${roomId}/messages/${messageId}/report`, body),
  });
  return { blocked, block, unblock, report };
}
