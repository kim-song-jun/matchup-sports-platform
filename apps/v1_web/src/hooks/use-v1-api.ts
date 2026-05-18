'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { v1Get, v1Patch, v1Post } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';
import type {
  CursorPage,
  V1AdminLog,
  V1AdminOverview,
  V1ChatMessage,
  V1ChatRoom,
  V1Home,
  V1Match,
  V1Notification,
  V1NotificationPreferences,
  V1Notice,
  V1Profile,
  V1Region,
  V1Settings,
  V1Sport,
  V1Team,
  V1TeamMatch,
  V1User,
} from '@/types/api';

type ListFilters = Record<string, string | number | boolean | null | undefined>;

export function useV1AuthMe() {
  return useQuery({
    queryKey: v1Keys.authMe(),
    queryFn: () => v1Get<V1User>('/auth/me'),
  });
}

export function useV1Onboarding() {
  return useQuery({
    queryKey: v1Keys.onboarding(),
    queryFn: () => v1Get<unknown>('/onboarding'),
  });
}

export function useV1SaveOnboardingPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => v1Patch<unknown>('/onboarding/preferences', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: v1Keys.onboarding() }),
  });
}

export function useV1CompleteOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => v1Post<unknown>('/onboarding/complete'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: v1Keys.authMe() }),
  });
}

export function useV1MasterSports() {
  return useQuery({
    queryKey: v1Keys.masterSports(),
    queryFn: () => v1Get<V1Sport[]>('/master/sports'),
  });
}

export function useV1MasterRegions() {
  return useQuery({
    queryKey: v1Keys.masterRegions(),
    queryFn: () => v1Get<V1Region[]>('/master/regions'),
  });
}

export function useV1Home(filters?: ListFilters) {
  return useQuery({
    queryKey: v1Keys.home(filters),
    queryFn: () => v1Get<V1Home>('/home', filters),
  });
}

export function useV1Notices() {
  return useQuery({
    queryKey: v1Keys.notices(),
    queryFn: () => v1Get<V1Notice[]>('/notices'),
  });
}

export function useV1Notice(noticeId: string) {
  return useQuery({
    queryKey: v1Keys.notice(noticeId),
    queryFn: () => v1Get<V1Notice>(`/notices/${noticeId}`),
    enabled: Boolean(noticeId),
  });
}

export function useV1Matches(filters?: ListFilters) {
  return useQuery({
    queryKey: v1Keys.matches(filters),
    queryFn: () => v1Get<CursorPage<V1Match>>('/matches', filters),
  });
}

export function useV1Match(matchId: string) {
  return useQuery({
    queryKey: v1Keys.match(matchId),
    queryFn: () => v1Get<V1Match>(`/matches/${matchId}`),
    enabled: Boolean(matchId),
  });
}

export function useV1CreateMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => v1Post<V1Match>('/matches', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: v1Keys.matches() }),
  });
}

export function useV1UpdateMatch(matchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => v1Patch<V1Match>(`/matches/${matchId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.match(matchId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.matches() });
    },
  });
}

export function useV1Teams(filters?: ListFilters) {
  return useQuery({
    queryKey: v1Keys.teams(filters),
    queryFn: () => v1Get<CursorPage<V1Team>>('/teams', filters),
  });
}

export function useV1Team(teamId: string) {
  return useQuery({
    queryKey: v1Keys.team(teamId),
    queryFn: () => v1Get<V1Team>(`/teams/${teamId}`),
    enabled: Boolean(teamId),
  });
}

export function useV1CreateTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => v1Post<V1Team>('/teams', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: v1Keys.teams() }),
  });
}

export function useV1UpdateTeam(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => v1Patch<V1Team>(`/teams/${teamId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.team(teamId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.teams() });
    },
  });
}

export function useV1MyTeams(filters?: ListFilters) {
  return useQuery({
    queryKey: [...v1Keys.all, 'me', 'teams', filters ?? {}] as const,
    queryFn: () => v1Get<V1Team[]>('/me/teams', filters),
  });
}

export function useV1TeamMatches(filters?: ListFilters) {
  return useQuery({
    queryKey: v1Keys.teamMatches(filters),
    queryFn: () => v1Get<CursorPage<V1TeamMatch>>('/team-matches', filters),
  });
}

export function useV1TeamMatch(teamMatchId: string) {
  return useQuery({
    queryKey: v1Keys.teamMatch(teamMatchId),
    queryFn: () => v1Get<V1TeamMatch>(`/team-matches/${teamMatchId}`),
    enabled: Boolean(teamMatchId),
  });
}

export function useV1CreateTeamMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => v1Post<V1TeamMatch>('/team-matches', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: v1Keys.teamMatches() }),
  });
}

export function useV1UpdateTeamMatch(teamMatchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => v1Patch<V1TeamMatch>(`/team-matches/${teamMatchId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.teamMatch(teamMatchId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.teamMatches() });
    },
  });
}

export function useV1ChatRooms() {
  return useQuery({
    queryKey: v1Keys.chatRooms(),
    queryFn: () => v1Get<CursorPage<V1ChatRoom>>('/chat/rooms'),
  });
}

export function useV1ChatMessages(roomId: string, filters?: ListFilters) {
  return useQuery({
    queryKey: [...v1Keys.chatMessages(roomId), filters ?? {}] as const,
    queryFn: () => v1Get<CursorPage<V1ChatMessage>>(`/chat/rooms/${roomId}/messages`, filters),
    enabled: Boolean(roomId),
  });
}

export function useV1Notifications(filters?: ListFilters) {
  return useQuery({
    queryKey: v1Keys.notifications(filters),
    queryFn: () => v1Get<CursorPage<V1Notification>>('/notifications', filters),
  });
}

export function useV1ReadNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) => v1Patch<V1Notification>(`/notifications/${notificationId}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: v1Keys.notifications() }),
  });
}

export function useV1NotificationPreferences() {
  return useQuery({
    queryKey: v1Keys.notificationPreferences(),
    queryFn: () => v1Get<V1NotificationPreferences>('/notification-preferences'),
  });
}

export function useV1Profile() {
  return useQuery({
    queryKey: v1Keys.profile(),
    queryFn: () => v1Get<V1Profile>('/me/profile'),
  });
}

export function useV1Settings() {
  return useQuery({
    queryKey: v1Keys.settings(),
    queryFn: () => v1Get<V1Settings>('/me/settings'),
  });
}

export function useV1AdminOverview() {
  return useQuery({
    queryKey: v1Keys.adminOverview(),
    queryFn: () => v1Get<V1AdminOverview>('/admin/overview'),
  });
}

export function useV1AdminActionLogs(filters?: ListFilters) {
  return useQuery({
    queryKey: [...v1Keys.adminActionLogs(), filters ?? {}] as const,
    queryFn: () => v1Get<CursorPage<V1AdminLog>>('/admin/action-logs', filters),
  });
}
