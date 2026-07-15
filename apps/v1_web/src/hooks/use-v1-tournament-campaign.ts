import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { v1Get, v1Patch, v1Post } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';
import type {
  V1ChangeTournamentCampaignStatusPayload,
  V1CreateTournamentCampaignPayload,
  V1AdminTournamentCampaignPreview,
  V1PublicTournamentCampaign,
  V1TournamentCampaign,
  V1TournamentCampaignList,
  V1TournamentCampaignStatusChangeResult,
  V1UpdateTournamentCampaignPayload,
} from '@/types/tournament-campaign';

const adminTournamentCampaignPreviewKey = (id: string) =>
  [...v1Keys.adminTournamentCampaign(id), 'preview'] as const;

export function useV1TournamentCampaigns(params?: {
  cursor?: string;
  limit?: number;
  sportCode?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params?.cursor) searchParams.set('cursor', params.cursor);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.sportCode) searchParams.set('sportCode', params.sportCode);
  const qs = searchParams.toString();
  return useQuery({
    queryKey: v1Keys.tournamentCampaigns(params ?? {}),
    queryFn: () => v1Get<V1TournamentCampaignList>(
      `/tournaments/campaigns${qs ? `?${qs}` : ''}`,
    ),
    staleTime: 60_000,
  });
}

export function useV1TournamentCampaign(slug: string) {
  return useQuery({
    queryKey: v1Keys.tournamentCampaign(slug),
    queryFn: () => v1Get<V1PublicTournamentCampaign>(`/tournaments/campaigns/${slug}`),
    enabled: !!slug,
  });
}

export function useV1AdminTournamentCampaign(id: string) {
  return useQuery({
    queryKey: v1Keys.adminTournamentCampaign(id),
    queryFn: () => v1Get<V1TournamentCampaign>(`/admin/tournaments/${id}/campaign`),
    enabled: !!id,
  });
}

export function useV1AdminTournamentCampaignPreview(id: string) {
  return useQuery({
    queryKey: adminTournamentCampaignPreviewKey(id),
    queryFn: () => v1Get<V1AdminTournamentCampaignPreview>(
      `/admin/tournaments/${id}/campaign/preview`,
    ),
    enabled: !!id,
  });
}

export function useV1CreateTournamentCampaign(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1CreateTournamentCampaignPayload) =>
      v1Post<V1TournamentCampaign>(`/admin/tournaments/${id}/campaign`, body),
    onSuccess: (campaign) => {
      queryClient.setQueryData(v1Keys.adminTournamentCampaign(id), campaign);
      queryClient.invalidateQueries({ queryKey: adminTournamentCampaignPreviewKey(id) });
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTournament(id) });
    },
  });
}

export function useV1UpdateTournamentCampaign(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1UpdateTournamentCampaignPayload) =>
      v1Patch<V1TournamentCampaign>(`/admin/tournaments/${id}/campaign`, body),
    onSuccess: (campaign) => {
      queryClient.setQueryData(v1Keys.adminTournamentCampaign(id), campaign);
      queryClient.invalidateQueries({ queryKey: adminTournamentCampaignPreviewKey(id) });
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTournament(id) });
      queryClient.invalidateQueries({ queryKey: v1Keys.tournament(id) });
      queryClient.invalidateQueries({ queryKey: v1Keys.tournaments() });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.all, 'tournaments', 'campaigns'] });
    },
  });
}

export function useV1ChangeTournamentCampaignStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1ChangeTournamentCampaignStatusPayload) =>
      v1Post<V1TournamentCampaignStatusChangeResult>(
        `/admin/tournaments/${id}/campaign/status`,
        body,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTournamentCampaign(id) });
      queryClient.invalidateQueries({ queryKey: adminTournamentCampaignPreviewKey(id) });
      queryClient.invalidateQueries({ queryKey: v1Keys.adminTournament(id) });
      queryClient.invalidateQueries({ queryKey: v1Keys.tournament(id) });
      queryClient.invalidateQueries({ queryKey: v1Keys.tournaments() });
      queryClient.invalidateQueries({ queryKey: [...v1Keys.all, 'tournaments', 'campaigns'] });
    },
  });
}
