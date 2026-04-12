'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import type { PendingReview } from '@/types/api';
import { extractData } from './shared';
import { queryKeys } from './query-keys';

// ── Reviews ──
export function useCreateReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { matchId: string; targetId: string; skillRating: number; mannerRating: number; comment?: string }) => {
      const res = await api.post('/reviews', data);
      return extractData<{ id: string }>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reviews.all });
    },
  });
}

export function usePendingReviews() {
  const { isAuthenticated } = useAuthStore();
  return useQuery<PendingReview[]>({
    queryKey: queryKeys.reviews.pending,
    queryFn: async () => {
      const res = await api.get('/reviews/pending');
      return extractData<PendingReview[]>(res);
    },
    enabled: isAuthenticated,
  });
}

// ── Reports ──
export interface CreateReportInput {
  targetType: string;
  targetId: string;
  reason: string;
  detail?: string;
}

export function useCreateReport() {
  return useMutation({
    mutationFn: async (data: CreateReportInput) => {
      const res = await api.post('/reports', data);
      return extractData<{ id: string }>(res);
    },
  });
}
