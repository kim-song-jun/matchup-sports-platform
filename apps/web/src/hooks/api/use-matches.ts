'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useToast } from '@/components/ui/toast';
import type {
  Match,
  PaginatedResponse,
  Upload,
  CreateMatchInput,
  UpdateMatchInput,
  CancelMatchPayload,
  ArriveMatchInput,
  ComposeTeamsInput,
  PreviewTeamsResponse,
} from '@/types/api';
import { extractData } from './shared';
import { extractErrorMessage } from '@/lib/utils';
import { queryKeys } from './query-keys';

// ── Matches ──
export function useMatches(params?: Record<string, string>) {
  return useQuery<PaginatedResponse<Match>>({
    queryKey: queryKeys.matches.list(params),
    queryFn: async () => {
      const res = await api.get('/matches', { params });
      return extractData<PaginatedResponse<Match>>(res);
    },
    staleTime: 3 * 60 * 1000,
  });
}

export function useRecommendedMatches() {
  const { isAuthenticated } = useAuthStore();
  return useQuery<Match[]>({
    queryKey: queryKeys.matches.recommended,
    queryFn: async () => {
      const res = await api.get('/matches/recommended');
      return extractData<Match[]>(res);
    },
    enabled: isAuthenticated,
  });
}

export function useMatch(id: string) {
  return useQuery<Match>({
    queryKey: queryKeys.matches.detail(id),
    queryFn: async () => {
      const res = await api.get(`/matches/${id}`);
      return extractData<Match>(res);
    },
    enabled: !!id,
  });
}

export function useCreateMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateMatchInput) => {
      const res = await api.post('/matches', data);
      return extractData<Match>(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.matches.all });
    },
  });
}

export function useJoinMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/matches/${id}/join`);
      return extractData<{ id: string }>(res);
    },
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.matches.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.matches.all });
    },
  });
}

export function useLeaveMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/matches/${id}/leave`);
      return { id };
    },
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.matches.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.matches.all });
    },
  });
}

export function useUpdateMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateMatchInput }) => {
      const res = await api.patch(`/matches/${id}`, data);
      return extractData<Match>(res);
    },
    onSuccess: (_match, { id }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.matches.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.matches.detail(id) });
      void queryClient.invalidateQueries({ queryKey: ['my-matches'] });
    },
  });
}

export function useCancelMatch(matchId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data?: CancelMatchPayload) => {
      const res = await api.post(`/matches/${matchId}/cancel`, data);
      return extractData<Match>(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.matches.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.matches.detail(matchId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.matches.my() });
    },
  });
}

export function useCloseMatch(matchId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await api.post(`/matches/${matchId}/close`);
      return extractData<Match>(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.matches.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.matches.detail(matchId) });
    },
  });
}

export function useArriveMatch(matchId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ArriveMatchInput) => {
      const res = await api.post(`/matches/${matchId}/arrive`, data);
      return extractData<{ arrivedAt: string }>(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.matches.detail(matchId) });
    },
  });
}

// ── My matches ──
export function useMyMatches(params?: Record<string, string>) {
  return useQuery<PaginatedResponse<Match>>({
    queryKey: queryKeys.matches.my(params),
    queryFn: async () => {
      const res = await api.get('/users/me/matches', { params });
      return extractData<PaginatedResponse<Match>>(res);
    },
  });
}

// ── Upload (shared utility used by match creation) ──
export function useUploadImages() {
  return useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      files.forEach((f) => formData.append('files', f));
      const res = await api.post('/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return extractData<Upload[]>(res);
    },
  });
}

export function useDeleteUpload() {
  return useMutation({
    mutationFn: async (uploadId: string) => {
      const res = await api.delete(`/uploads/${uploadId}`);
      return extractData<{ id: string }>(res);
    },
  });
}

// ── Team Balancing (Task 71 / Task 72) ──

/** Axios error shape used for status/header inspection in mutation error handlers. */
interface AxiosLikeError {
  response?: {
    status?: number;
    headers?: Record<string, string>;
    data?: { code?: string; message?: string };
  };
}

/**
 * Dry-run team composition — does NOT persist any data.
 * Returns preview of balanced team assignments with ELO metrics.
 *
 * Task 72 C1: response includes `participantHash` (64-char SHA-256 hex) for stale-detection.
 * Task 72 C3: 429 from preview rate limiting fires info toast and exposes `retryAfterSeconds`
 *   so Track C can disable the re-roll button during the countdown.
 *
 * @returns Mutation result extended with `retryAfterSeconds: number | null`.
 */
export function usePreviewTeams(matchId: string) {
  const { toast } = useToast();
  const [retryAfterSeconds, setRetryAfterSeconds] = useState<number | null>(null);

  const mutation = useMutation<PreviewTeamsResponse, Error, ComposeTeamsInput>({
    mutationFn: async (input) => {
      const res = await api.post(`/matches/${matchId}/teams/preview`, input);
      return extractData<PreviewTeamsResponse>(res);
    },
    onSuccess: () => {
      setRetryAfterSeconds(null);
    },
    onError: (err: unknown) => {
      const axiosErr = err as AxiosLikeError;
      if (axiosErr?.response?.status === 429) {
        const retryAfterHeader = axiosErr.response?.headers?.['retry-after'];
        const seconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 60;
        const parsed = Number.isFinite(seconds) ? seconds : 60;
        setRetryAfterSeconds(parsed);
        toast('info', extractErrorMessage(err, '잠시 후 다시 시도해 주세요 (분당 최대 20회)'));
      }
      // All other errors: surface via mutation.error for Track C to display.
    },
  });

  return { ...mutation, retryAfterSeconds };
}

/**
 * Options for useComposeTeams — callers supply a callback invoked when the server
 * detects participant churn (409 PARTICIPANTS_CHANGED).
 */
export interface UseComposeTeamsOptions {
  /** Called with stale-hash-stripped input when server returns 409 PARTICIPANTS_CHANGED. */
  onParticipantsChanged?: (input: ComposeTeamsInput) => void;
}

/**
 * Persist team assignments — creates Team records and updates MatchParticipant.teamId.
 * Invalidates match detail and participant list so the page reflects new teams immediately.
 *
 * Task 72 C2: include `participantHash` from the most recent preview to enable server-side
 *   stale detection. On 409 PARTICIPANTS_CHANGED, fires info toast and calls
 *   `onParticipantsChanged` (which should re-trigger `usePreviewTeams.mutate`).
 *
 * @param matchId - The match to assign teams for.
 * @param options - Optional callbacks for special error handling.
 */
export function useComposeTeams(matchId: string, options?: UseComposeTeamsOptions) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<PreviewTeamsResponse, Error, ComposeTeamsInput>({
    mutationFn: async (input) => {
      const res = await api.post(`/matches/${matchId}/teams`, input);
      return extractData<PreviewTeamsResponse>(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.matches.detail(matchId) });
      void queryClient.invalidateQueries({ queryKey: ['match-participants', matchId] });
    },
    onError: (err: unknown, variables) => {
      const axiosErr = err as AxiosLikeError;
      const status = axiosErr?.response?.status;
      const code = axiosErr?.response?.data?.code;

      if (status === 409 && code === 'PARTICIPANTS_CHANGED') {
        // Suppress default error display; fire info toast and re-trigger preview.
        toast('info', extractErrorMessage(err, '참가자가 변경되어 다시 계산했어요'));
        if (options?.onParticipantsChanged) {
          // Drop stale hash so preview re-runs against current participant set.
          const { participantHash: _dropped, ...inputWithoutHash } = variables;
          options.onParticipantsChanged(inputWithoutHash);
        }
        return;
      }

      // All other errors: surface via mutation.error for Track C to display.
    },
  });
}
