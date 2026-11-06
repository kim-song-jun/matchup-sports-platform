'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { v1Get, v1Post } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';

export interface LeagueConversionEntry {
  teamId: string; teamName: string; position: number; points: number; suggestedTier: number;
}
export interface LeagueConversionPreview {
  entries: LeagueConversionEntry[];
  boundaryTies: Array<{ teamIds: string[] }>;
  fingerprint: string;
}
export interface LeagueConversionCommit {
  title: string; tierSizes: number[]; startsOn: string; endsOn: string; fingerprint: string;
  entries: Array<{ teamId: string; tier: number; reason?: string }>;
}
export function useLeagueConversionStatus(leagueId: string) {
  return useQuery({ queryKey: [...v1Keys.adminLeagueMatch(leagueId), 'series-conversion'], queryFn: () => v1Get<{ seriesId: string | null }>(`/admin/league-matches/${leagueId}/series-conversion`) });
}
export function useLeagueConversionPreview(leagueId: string) {
  return useMutation({ mutationFn: (tierSizes: number[]) => v1Post<LeagueConversionPreview>(`/admin/league-matches/${leagueId}/series-conversion/preview`, { tierSizes }) });
}
export function useLeagueConversionCommit(leagueId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: LeagueConversionCommit) => v1Post<{ seriesId: string }>(`/admin/league-matches/${leagueId}/series-conversion/commit`, body),
    onSuccess: async () => { await Promise.all([client.invalidateQueries({ queryKey: v1Keys.adminLeagueSeriesList() }), client.invalidateQueries({ queryKey: v1Keys.adminLeagueMatch(leagueId) }), client.invalidateQueries({ queryKey: v1Keys.adminLeagueMatchList() })]); },
  });
}
