'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { v1Get, v1Patch } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';
import type { LeagueSettings, UpdateLeagueSettings } from '@/types/league-settings';

const settingsKey = (id: string) => [...v1Keys.adminLeagueMatch(id), 'settings'] as const;
const settingsPath = (id: string) => `/admin/league-matches/${encodeURIComponent(id)}/settings`;
export function useLeagueSettings(id: string) {
  return useQuery({ queryKey: settingsKey(id), queryFn: () => v1Get<LeagueSettings>(settingsPath(id)),
    staleTime: 0, refetchOnWindowFocus: false, retry: false });
}
export function useUpdateLeagueSettings(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateLeagueSettings) => v1Patch<LeagueSettings>(settingsPath(id), input),
    onSuccess: async (data) => {
      client.setQueryData(settingsKey(id), data);
      await Promise.all([
        v1Keys.adminLeagueMatch(id), v1Keys.adminLeagueMatchList(),
        v1Keys.leagueMatches(), v1Keys.leagueMatch(id), v1Keys.tournament(id), v1Keys.tournaments(),
      ].map(queryKey => client.invalidateQueries({ queryKey })));
    },
  });
}
