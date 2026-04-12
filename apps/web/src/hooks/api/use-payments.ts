'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import type {
  Payment,
  PaginatedResponse,
  PreparedPayment,
  PreparePaymentInput,
  ConfirmPaymentInput,
  RefundPaymentInput,
} from '@/types/api';
import { extractData } from './shared';
import { queryKeys } from './query-keys';

// ── Payments ──
export function usePayments() {
  const { isAuthenticated } = useAuthStore();
  return useQuery<PaginatedResponse<Payment>>({
    queryKey: queryKeys.payments.all,
    queryFn: async () => {
      const res = await api.get('/payments/me');
      const data = extractData<PaginatedResponse<Payment> | Payment[]>(res);
      if (Array.isArray(data)) {
        return { items: data, nextCursor: null };
      }
      return data;
    },
    enabled: isAuthenticated,
  });
}

export function usePayment(id: string) {
  return useQuery<Payment>({
    queryKey: queryKeys.payments.detail(id),
    queryFn: async () => {
      const res = await api.get(`/payments/${id}`);
      return extractData<Payment>(res);
    },
    enabled: !!id,
  });
}

export function usePreparePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: PreparePaymentInput) => {
      const res = await api.post('/payments/prepare', data);
      return extractData<PreparedPayment>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
    },
  });
}

export function useConfirmPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: ConfirmPaymentInput) => {
      const res = await api.post('/payments/confirm', data);
      return extractData<Payment>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
    },
  });
}

export function useRefundPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: RefundPaymentInput }) => {
      const res = await api.post(`/payments/${id}/refund`, data);
      return extractData<Payment>(res);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.detail(id) });
    },
  });
}
