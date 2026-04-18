'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import type {
  MyTeam,
  SportTeam,
  TeamHub,
  TeamInvitation,
  TeamApplication,
  CreateTeamInput,
} from '@/types/api';
import { extractData } from './shared';
import { queryKeys } from './query-keys';

// ── Teams ──
export function useTeams(params?: Record<string, string>) {
  return useQuery<import('@/types/api').PaginatedResponse<SportTeam>>({
    queryKey: queryKeys.teams.list(params),
    queryFn: async () => {
      const res = await api.get('/teams', { params });
      return extractData<import('@/types/api').PaginatedResponse<SportTeam>>(res);
    },
    staleTime: 3 * 60 * 1000,
  });
}

export function useTeam(id: string) {
  return useQuery<SportTeam>({
    queryKey: queryKeys.teams.detail(id),
    queryFn: async () => {
      const res = await api.get(`/teams/${id}`);
      return extractData<SportTeam>(res);
    },
    enabled: !!id,
  });
}

export function useTeamHub(id: string) {
  return useQuery<TeamHub>({
    queryKey: queryKeys.teams.hub(id),
    queryFn: async () => {
      const res = await api.get(`/teams/${id}/hub`);
      return extractData<TeamHub>(res);
    },
    enabled: !!id,
    retry: 0,
  });
}

// Backend returns Array<TeamMembership & { team: SportTeam }>.
// We flatten to MyTeam[] so callers always get { id, name, role, sportType, ... }.
interface RawMembership {
  id: string;
  teamId: string;
  userId: string;
  role: 'owner' | 'manager' | 'member';
  status: string;
  joinedAt: string;
  team: SportTeam;
}

export function useMyTeams() {
  const { isAuthenticated } = useAuthStore();
  return useQuery({
    queryKey: queryKeys.teams.me,
    queryFn: async () => {
      const raw = await api.get('/teams/me').then(extractData<RawMembership[]>);
      return raw.map((m): MyTeam => ({
        id: m.team.id,
        name: m.team.name,
        sportType: m.team.sportTypes?.[0] ?? m.team.sportType,
        sportTypes: m.team.sportTypes ?? [m.team.sportType],
        description: m.team.description,
        city: m.team.city,
        district: m.team.district,
        memberCount: m.team.memberCount,
        level: m.team.level,
        isRecruiting: m.team.isRecruiting,
        logoUrl: m.team.logoUrl,
        role: m.role,
        joinedAt: m.joinedAt,
      }));
    },
    enabled: isAuthenticated,
  });
}

export function useCreateTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateTeamInput) => {
      const res = await api.post('/teams', data);
      return extractData<SportTeam>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teams.all });
    },
  });
}

export function useUpdateTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CreateTeamInput }) => {
      const res = await api.patch(`/teams/${id}`, data);
      return extractData<SportTeam>(res);
    },
    onSuccess: (_team, { id }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.teams.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.teams.hub(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.teams.list() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.teams.me });
    },
  });
}

export function useDeleteTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/teams/${id}`);
      return { id };
    },
    onSuccess: ({ id }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.teams.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.teams.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.teams.me });
    },
  });
}

// ── Team Members ──
export interface TeamMember {
  id: string;
  userId: string;
  teamId: string;
  role: 'owner' | 'manager' | 'member';
  status: string;
  joinedAt: string;
  user: {
    id: string;
    nickname: string;
    profileImageUrl: string | null;
    mannerScore?: number;
  };
}

export function useTeamMembers(teamId: string) {
  return useQuery<TeamMember[]>({
    queryKey: queryKeys.teamMembers.list(teamId),
    queryFn: async () => {
      const res = await api.get(`/teams/${teamId}/members`);
      return extractData<TeamMember[]>(res);
    },
    enabled: !!teamId,
  });
}

export function useAddTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ teamId, userId, role }: { teamId: string; userId: string; role?: string }) => {
      const res = await api.post(`/teams/${teamId}/members`, { userId, role });
      return extractData<TeamMember>(res);
    },
    onSuccess: (_, { teamId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMembers.list(teamId) });
    },
  });
}

export function useUpdateTeamMemberRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ teamId, userId, role }: { teamId: string; userId: string; role: string }) => {
      const res = await api.patch(`/teams/${teamId}/members/${userId}`, { role });
      return extractData<TeamMember>(res);
    },
    onSuccess: (_, { teamId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMembers.list(teamId) });
    },
  });
}

export function useRemoveTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ teamId, userId }: { teamId: string; userId: string }) => {
      await api.delete(`/teams/${teamId}/members/${userId}`);
      return { userId };
    },
    onSuccess: (_, { teamId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMembers.list(teamId) });
    },
  });
}

export function useLeaveTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (teamId: string) => {
      await api.post(`/teams/${teamId}/leave`);
      return { teamId };
    },
    onSuccess: (_, teamId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teams.me });
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMembers.list(teamId) });
    },
  });
}

export function useTransferTeamOwnership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      teamId,
      toUserId,
      demoteTo,
    }: {
      teamId: string;
      toUserId: string;
      demoteTo: 'manager' | 'member';
    }) => {
      // POST /teams/:id/transfer-ownership — backend expects { toUserId, demoteTo }
      const res = await api.post(`/teams/${teamId}/transfer-ownership`, {
        toUserId,
        demoteTo,
      });
      return extractData<{ success: boolean }>(res);
    },
    onSuccess: (_, { teamId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMembers.list(teamId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.teams.detail(teamId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.teams.me });
    },
  });
}

// ── Team Applications (membership join requests) ──

export function useTeamApplications(teamId: string | undefined, opts?: { enabled?: boolean }) {
  return useQuery<TeamApplication[]>({
    queryKey: queryKeys.teamApplications.byTeam(teamId ?? ''),
    queryFn: async () => {
      const res = await api.get(`/teams/${teamId}/applications`);
      return extractData<TeamApplication[]>(res);
    },
    enabled: Boolean(teamId) && (opts?.enabled ?? true),
    staleTime: 30_000,
  });
}

export function useAcceptTeamApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ teamId, applicantUserId }: { teamId: string; applicantUserId: string }) => {
      const res = await api.patch(`/teams/${teamId}/applications/${applicantUserId}/accept`);
      return extractData<{ success: boolean }>(res);
    },
    onSuccess: (_, { teamId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamApplications.byTeam(teamId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMembers.list(teamId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.teams.detail(teamId) });
    },
  });
}

export function useRejectTeamApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ teamId, applicantUserId }: { teamId: string; applicantUserId: string }) => {
      const res = await api.patch(`/teams/${teamId}/applications/${applicantUserId}/reject`);
      return extractData<{ success: boolean }>(res);
    },
    onSuccess: (_, { teamId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamApplications.byTeam(teamId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMembers.list(teamId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.teams.detail(teamId) });
    },
  });
}

// ── Team Invitations ──
export function useTeamInvitations(teamId: string) {
  return useQuery<TeamInvitation[]>({
    queryKey: queryKeys.invitations.byTeam(teamId),
    queryFn: async () => {
      const res = await api.get(`/teams/${teamId}/invitations`);
      return extractData<TeamInvitation[]>(res);
    },
    enabled: !!teamId,
  });
}

export function useMyInvitations() {
  const { isAuthenticated } = useAuthStore();
  return useQuery<TeamInvitation[]>({
    queryKey: queryKeys.invitations.mine,
    queryFn: async () => {
      const res = await api.get('/users/me/invitations');
      return extractData<TeamInvitation[]>(res);
    },
    enabled: isAuthenticated,
  });
}

export function useInviteTeamMember(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { inviteeId: string; role?: string }) => {
      const res = await api.post(`/teams/${teamId}/invitations`, data);
      return extractData<TeamInvitation>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invitations.byTeam(teamId) });
    },
  });
}

export function useAcceptInvitation(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const res = await api.patch(`/teams/${teamId}/invitations/${invitationId}/accept`);
      return extractData<TeamInvitation>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invitations.mine });
      queryClient.invalidateQueries({ queryKey: queryKeys.teams.me });
    },
  });
}

export function useDeclineInvitation(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const res = await api.patch(`/teams/${teamId}/invitations/${invitationId}/decline`);
      return extractData<TeamInvitation>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invitations.mine });
    },
  });
}
