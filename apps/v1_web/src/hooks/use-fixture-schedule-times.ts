'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useV1DataSource } from '@/components/providers/v1-data-source';

export type ScheduleTime = { id: string; tournamentId: string; scheduledAt: string; createdAt: string };
export const scheduleTimesKey = (id: string) => ['v1', 'admin', 'tournaments', id, 'schedule-times'] as const;

export function useFixtureScheduleTimes(tournamentId: string) {
  const { v1Get } = useV1DataSource();
  return useQuery({ queryKey: scheduleTimesKey(tournamentId),
    queryFn: () => v1Get<{ items: ScheduleTime[] }>(`/admin/tournaments/${tournamentId}/schedule-times`),
    enabled: Boolean(tournamentId), refetchOnWindowFocus: 'always' });
}

export function useCreateFixtureScheduleTime(tournamentId: string) {
  const { v1Post } = useV1DataSource();
  const client = useQueryClient();
  return useMutation({ mutationFn: (scheduledAt: string) => v1Post<{ item: ScheduleTime }>(
    `/admin/tournaments/${tournamentId}/schedule-times`, { scheduledAt }),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: scheduleTimesKey(tournamentId) }); } });
}
