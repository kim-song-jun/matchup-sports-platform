'use client';

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CursorPage } from '@/types/api';
import type {
  Dispute,
  DisputeEvent,
  DisputeActorRole,
  SellerRespondInput,
  AddDisputeMessageInput,
  WithdrawDisputeInput,
} from '@/types/dispute';
import { extractData, extractCursorPage } from './shared';
import { queryKeys } from './query-keys';
import { extractErrorMessage } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';

// ── My disputes (buyer/seller) ──

export function useMyDisputes(role?: 'buyer' | 'seller' | 'all') {
  return useInfiniteQuery<CursorPage<Dispute>, Error, InfiniteData<CursorPage<Dispute>>, ReturnType<typeof queryKeys.disputes.mine>, string | null>({
    queryKey: queryKeys.disputes.mine(role),
    queryFn: async ({ pageParam }) => {
      const params: Record<string, string> = {};
      if (role) params.role = role;
      if (pageParam) params.cursor = pageParam;
      const res = await api.get('/disputes/me', { params });
      return extractCursorPage<Dispute>(res);
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? null,
  });
}

// ── Dispute detail ──

export function useDispute(id: string) {
  return useQuery<Dispute>({
    queryKey: queryKeys.disputes.detail(id),
    queryFn: async () => {
      const res = await api.get(`/disputes/${id}`);
      return extractData<Dispute>(res);
    },
    enabled: !!id,
  });
}

// ── Seller responds to dispute ──

export function useSellerRespond() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: SellerRespondInput }) => {
      const res = await api.post(`/disputes/${id}/respond`, data);
      return extractData<Dispute>(res);
    },
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.disputes.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.disputes.all });
    },
  });
}

// ── Add message to dispute thread (optimistic update) ──

export function useAddDisputeMessage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: AddDisputeMessageInput }) => {
      const res = await api.post(`/disputes/${id}/messages`, data);
      return extractData<DisputeEvent>(res);
    },
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.disputes.detail(id) });
      const previous = queryClient.getQueryData<Dispute>(queryKeys.disputes.detail(id));
      if (previous) {
        // Derive actor role: admin if user has admin role, otherwise match against sellerId.
        // Both marketplace and team_match disputes use buyerId/sellerId, so this works uniformly.
        const actorRole: DisputeActorRole =
          previous.sellerId === user?.id ? 'seller' : 'buyer';
        const optimisticEvent: DisputeEvent = {
          id: `optimistic-${Date.now()}`,
          disputeId: id,
          actorUserId: user?.id ?? null,
          actorRole,
          message: data.body,
          attachmentUrls: data.attachmentUrls ?? [],
          createdAt: new Date().toISOString(),
        };
        queryClient.setQueryData<Dispute>(queryKeys.disputes.detail(id), {
          ...previous,
          events: [...(previous.events ?? []), optimisticEvent],
        });
      }
      return { previous };
    },
    onError: (_err, { id }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.disputes.detail(id), context.previous);
      }
    },
    onSettled: (_, __, { id }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.disputes.detail(id) });
    },
  });
}

// ── Buyer withdraws dispute ──

export function useWithdrawDispute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data?: WithdrawDisputeInput }) => {
      const res = await api.post(`/disputes/${id}/withdraw`, data ?? {});
      return extractData<Dispute>(res);
    },
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.disputes.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.disputes.all });
    },
  });
}

// Expose extractErrorMessage for hook consumers (re-export pattern consistent with use-chat.ts)
export { extractErrorMessage };
