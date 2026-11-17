'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useV1DataSource } from '@/components/providers/v1-data-source';
import { v1Keys } from '@/lib/query-keys';

export type ScheduleTime = { id: string; tournamentId: string; scheduledAt: string; createdAt: string };
export type ScheduleTimeSurface = 'tournaments' | 'league-matches';
export const scheduleTimesKey = (id: string, surface: ScheduleTimeSurface = 'tournaments') => ['v1', 'admin', surface, id, 'schedule-times'] as const;

export function useFixtureScheduleTimes(tournamentId: string, surface: ScheduleTimeSurface = 'tournaments') {
  const { v1Get } = useV1DataSource();
  return useQuery({ queryKey: scheduleTimesKey(tournamentId, surface),
    queryFn: () => v1Get<{ items: ScheduleTime[] }>(`/admin/${surface}/${tournamentId}/schedule-times`),
    enabled: Boolean(tournamentId), refetchOnWindowFocus: 'always' });
}

export function useCreateFixtureScheduleTime(tournamentId: string, surface: ScheduleTimeSurface = 'tournaments') {
  const { v1Post } = useV1DataSource();
  const client = useQueryClient();
  return useMutation({ mutationFn: (scheduledAt: string) => v1Post<{ item: ScheduleTime }>(
    `/admin/${surface}/${tournamentId}/schedule-times`, { scheduledAt }),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: scheduleTimesKey(tournamentId, surface) }); } });
}

export function useUpdateFixtureScheduleTime(tournamentId: string, surface: ScheduleTimeSurface = 'tournaments') {
  const { v1Patch } = useV1DataSource();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: { expectedScheduleTimeId: string | null; expectedFixtureIds?: string[]; expectedScheduledAt: string; scheduledAt: string }) =>
      v1Patch<{ item: ScheduleTime | null; affectedFixtureCount: number }>(`/admin/${surface}/${tournamentId}/schedule-times`, payload),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: scheduleTimesKey(tournamentId, surface) }),
        client.invalidateQueries({ queryKey: v1Keys.adminTournamentBracket(tournamentId) }),
        client.invalidateQueries({ queryKey: v1Keys.adminLeagueMatch(tournamentId) }),
        client.invalidateQueries({ queryKey: v1Keys.tournamentOperationsBoardAll(tournamentId) }),
        client.invalidateQueries({ queryKey: v1Keys.tournament(tournamentId) }),
        client.invalidateQueries({ queryKey: v1Keys.leagueMatch(tournamentId) }),
      ]);
    },
  });
}
