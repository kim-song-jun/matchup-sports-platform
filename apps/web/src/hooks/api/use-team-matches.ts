'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import type {
  TeamMatch,
  TeamMatchApplication,
  MyTeamMatchApplication,
  PaginatedResponse,
  TeamMatchRefereeSchedule,
  CreateTeamMatchInput,
  ApplyTeamMatchInput,
  TeamMatchEvaluationInput,
  SubmitTeamMatchResultInput,
  TeamMatchCheckInInput,
  UpdateTeamMatchInput,
} from '@/types/api';
import { extractData } from './shared';
import { queryKeys } from './query-keys';

// ── Team Matches ──
export function useTeamMatches(params?: Record<string, string>) {
  return useQuery<PaginatedResponse<TeamMatch>>({
    queryKey: queryKeys.teamMatches.list(params),
    queryFn: async () => {
      const res = await api.get('/team-matches', { params });
      return extractData<PaginatedResponse<TeamMatch>>(res);
    },
    staleTime: 3 * 60 * 1000,
  });
}

export function useTeamMatch(id: string) {
  return useQuery<TeamMatch>({
    queryKey: queryKeys.teamMatches.detail(id),
    queryFn: async () => {
      const res = await api.get(`/team-matches/${id}`);
      return extractData<TeamMatch>(res);
    },
    enabled: !!id,
  });
}

export function useTeamMatchRefereeSchedule(id: string) {
  return useQuery<TeamMatchRefereeSchedule>({
    queryKey: queryKeys.teamMatches.referee(id),
    queryFn: async () => {
      const res = await api.get(`/team-matches/${id}/referee-schedule`);
      return extractData<TeamMatchRefereeSchedule>(res);
    },
    enabled: !!id,
  });
}

export function useCreateTeamMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateTeamMatchInput) => {
      const res = await api.post('/team-matches', data);
      return extractData<TeamMatch>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMatches.all });
    },
  });
}

export function useUpdateTeamMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateTeamMatchInput }) => {
      const res = await api.patch(`/team-matches/${id}`, data);
      return extractData<TeamMatch>(res);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMatches.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMatches.all });
    },
  });
}

export function useApplyTeamMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ApplyTeamMatchInput }) => {
      const res = await api.post(`/team-matches/${id}/apply`, data);
      return extractData<{ id: string }>(res);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMatches.detail(id) });
    },
  });
}

export function useRespondTeamMatchApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, applicationId, action }: { id: string; applicationId: string; action: 'approve' | 'reject' }) => {
      const res = await api.patch(`/team-matches/${id}/applications/${applicationId}/${action}`);
      return extractData<{ id: string }>(res);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMatches.detail(id) });
    },
  });
}

export function useSubmitTeamMatchEvaluation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: TeamMatchEvaluationInput }) => {
      const res = await api.post(`/team-matches/${id}/evaluate`, data);
      return extractData<{ id: string }>(res);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMatches.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMatches.all });
    },
  });
}

export function useSubmitTeamMatchResult() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: SubmitTeamMatchResultInput }) => {
      const res = await api.post(`/team-matches/${id}/result`, data);
      return extractData<{ id: string }>(res);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMatches.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMatches.all });
    },
  });
}

export function useTeamMatchArrival() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: TeamMatchCheckInInput }) => {
      const res = await api.post(`/team-matches/${id}/check-in`, data);
      return extractData<{ id: string }>(res);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMatches.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMatches.all });
    },
  });
}

// ── Team Match Applications (host view) ──
export function useTeamMatchApplications(matchId: string) {
  return useQuery<TeamMatchApplication[]>({
    queryKey: queryKeys.teamMatchApplications.byMatch(matchId),
    queryFn: async () => {
      const res = await api.get(`/team-matches/${matchId}/applications`);
      return extractData<TeamMatchApplication[]>(res);
    },
    enabled: !!matchId,
  });
}

export function useApproveTeamMatchApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ matchId, applicationId }: { matchId: string; applicationId: string }) => {
      const res = await api.patch(`/team-matches/${matchId}/applications/${applicationId}/approve`);
      return extractData<{ id: string }>(res);
    },
    onSuccess: (_, { matchId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMatchApplications.byMatch(matchId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMatches.detail(matchId) });
    },
  });
}

export function useRejectTeamMatchApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ matchId, applicationId }: { matchId: string; applicationId: string }) => {
      const res = await api.patch(`/team-matches/${matchId}/applications/${applicationId}/reject`);
      return extractData<{ id: string }>(res);
    },
    onSuccess: (_, { matchId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMatchApplications.byMatch(matchId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMatches.detail(matchId) });
    },
  });
}

// ── My Team Match Applications (applicant view) ──
export function useMyTeamMatchApplications() {
  const { isAuthenticated } = useAuthStore();
  return useQuery<MyTeamMatchApplication[]>({
    queryKey: queryKeys.teamMatchApplications.mine,
    queryFn: async () => {
      const res = await api.get('/team-matches/me/applications');
      return extractData<MyTeamMatchApplication[]>(res);
    },
    enabled: isAuthenticated,
  });
}
