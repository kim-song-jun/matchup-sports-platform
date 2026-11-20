'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { V1ApiError, v1Delete, v1Get, v1Post, v1Put } from '@/lib/api-client';

/** 서버가 사람에게 보여 줄 문장을 준 경우에만 그대로 쓰고, 아니면 fallback. */
export function internalMatchErrorMessage(err: unknown, fallback: string): string {
  return err instanceof V1ApiError && err.displayableMessage ? err.message : fallback;
}

/* 팀 내 경기(자체전) — 팀원끼리 N팀으로 나눠 뛴 경기와 기록. 서버가 팀원만 읽고 팀장·매니저만 쓰게 막는다.
 * docs/api/domains/team-internal-matches.md */

export type InternalMatchSideSummary = { sideNumber: number; name: string; score: number | null; playerCount: number };
export type InternalMatchListItem = {
  id: string;
  playedAt: string;
  resultRecorded: boolean;
  sides: InternalMatchSideSummary[];
  /** 내가 뛴 팀 번호. 안 뛰었으면 null. */
  viewerSideNumber: number | null;
};
export type InternalMatchPlayer = { userId: string; name: string; isMe?: boolean };
export type InternalMatchDetail = {
  id: string;
  teamId: string;
  playedAt: string;
  resultRecorded: boolean;
  canManage: boolean;
  sides: Array<{ sideNumber: number; name: string; score: number | null; players: InternalMatchPlayer[] }>;
  goals: Array<{ sideNumber: number; scorer: InternalMatchPlayer; assist: InternalMatchPlayer | null }>;
};
export type InternalMatchPreview = {
  seed: number;
  sides: Array<{ sideNumber: number; name: string; players: InternalMatchPlayer[] }>;
};
export type InternalMatchGoalInput = { sideNumber: number; scorerUserId: string; assistUserId?: string };

const keys = {
  all: (teamId: string) => ['v1', 'team', teamId, 'internal-matches'] as const,
  list: (teamId: string, limit: number) => [...keys.all(teamId), 'list', limit] as const,
  detail: (teamId: string, matchId: string) => [...keys.all(teamId), 'detail', matchId] as const,
};

export function useTeamInternalMatches(teamId: string, limit: number, enabled = true) {
  return useQuery({
    queryKey: keys.list(teamId, limit),
    queryFn: () => v1Get<{ items: InternalMatchListItem[]; hasMore: boolean }>(`/teams/${teamId}/internal-matches`, { limit }),
    enabled: enabled && Boolean(teamId),
    retry: false,
  });
}

export function useTeamInternalMatch(teamId: string, matchId: string) {
  return useQuery({
    queryKey: keys.detail(teamId, matchId),
    queryFn: () => v1Get<InternalMatchDetail>(`/teams/${teamId}/internal-matches/${matchId}`),
    enabled: Boolean(teamId && matchId),
    retry: false,
  });
}

export function usePreviewInternalMatch(teamId: string) {
  return useMutation({
    mutationFn: (body: { userIds: string[]; teamCount: number; seed: number }) =>
      v1Post<InternalMatchPreview>(`/teams/${teamId}/internal-matches/preview`, body),
  });
}

export function useCreateInternalMatch(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { playedAt: string; sides: Array<{ userIds: string[] }> }) =>
      v1Post<InternalMatchDetail>(`/teams/${teamId}/internal-matches`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all(teamId) }),
  });
}

export function useRecordInternalMatchResult(teamId: string, matchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { scores: number[]; goals: InternalMatchGoalInput[] }) =>
      v1Put<InternalMatchDetail>(`/teams/${teamId}/internal-matches/${matchId}/result`, body),
    onSuccess: (detail) => {
      queryClient.setQueryData(keys.detail(teamId, matchId), detail);
      void queryClient.invalidateQueries({ queryKey: [...keys.all(teamId), 'list'] });
    },
  });
}

export function useDeleteInternalMatch(teamId: string, matchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => v1Delete<{ id: string; deleted: true }>(`/teams/${teamId}/internal-matches/${matchId}`),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: keys.detail(teamId, matchId) });
      void queryClient.invalidateQueries({ queryKey: [...keys.all(teamId), 'list'] });
    },
  });
}
