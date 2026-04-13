'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import type {
  Lesson,
  LessonTicket,
  PreparedLessonTicketPurchase,
  PaginatedResponse,
  CreateLessonInput,
  ConfirmLessonTicketPaymentInput,
} from '@/types/api';
import { extractData } from './shared';
import { queryKeys } from './query-keys';

// ── Lessons ──
export function useLessons(params?: Record<string, string>) {
  return useQuery<PaginatedResponse<Lesson>>({
    queryKey: queryKeys.lessons.list(params),
    queryFn: async () => {
      const res = await api.get('/lessons', { params });
      return extractData<PaginatedResponse<Lesson>>(res);
    },
    staleTime: 3 * 60 * 1000,
  });
}

export function useLesson(id: string) {
  return useQuery<Lesson>({
    queryKey: queryKeys.lessons.detail(id),
    queryFn: async () => {
      const res = await api.get(`/lessons/${id}`);
      return extractData<Lesson>(res);
    },
    enabled: !!id,
  });
}

export function useCreateLesson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateLessonInput) => {
      const res = await api.post('/lessons', data);
      return extractData<Lesson>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.lessons.all });
    },
  });
}

export function useMyLessonTickets() {
  const { isAuthenticated } = useAuthStore();

  return useQuery<LessonTicket[]>({
    queryKey: queryKeys.lessons.myTickets,
    queryFn: async () => {
      const res = await api.get('/lessons/tickets/me');
      return extractData<LessonTicket[]>(res);
    },
    enabled: isAuthenticated,
  });
}

export function usePurchaseLessonTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (planId: string) => {
      const res = await api.post(`/lessons/plans/${planId}/purchase`);
      return extractData<PreparedLessonTicketPurchase>(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lessons.myTickets });
    },
  });
}

export function useUpdateLesson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await api.patch(`/lessons/${id}`, data);
      return extractData<Lesson>(res);
    },
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lessons.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.lessons.detail(id) });
    },
  });
}

export function useDeleteLesson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/lessons/${id}`);
      return { id };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lessons.all });
    },
  });
}

export function useConfirmLessonTicketPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ticketId, paymentKey }: ConfirmLessonTicketPaymentInput) => {
      const res = await api.post(`/lessons/tickets/${ticketId}/confirm`, { paymentKey });
      return extractData<LessonTicket>(res);
    },
    onSuccess: (ticket) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lessons.myTickets });
      void queryClient.invalidateQueries({ queryKey: queryKeys.lessons.detail(ticket.lessonId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.lessons.all });
    },
  });
}
