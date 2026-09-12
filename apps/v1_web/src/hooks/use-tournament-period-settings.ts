'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { v1Get, v1Patch } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';

export interface TournamentPeriodSetting {
  code: string;
  label: string;
  durationMinutes: number;
  extraTime: boolean;
}

export interface TournamentPeriodSettingsResponse {
  tournamentId: string;
  competitionConfigVersionId: string | null;
  expectedVersion: string | null;
  periods: TournamentPeriodSetting[] | null;
  legacyPeriodCount: number | null;
  requiresDurationInput: boolean;
}

export interface UpdateTournamentPeriodSettingsPayload {
  expectedVersion: string;
  periods: Array<{ durationMinutes: number }>;
}

const periodSettingsKey = (tournamentId: string) =>
  [...v1Keys.adminTournament(tournamentId), 'period-settings'] as const;

export function useTournamentPeriodSettings(tournamentId: string) {
  return useQuery({
    queryKey: periodSettingsKey(tournamentId),
    queryFn: () => v1Get<TournamentPeriodSettingsResponse>(`/admin/tournaments/${tournamentId}/periods`),
    enabled: Boolean(tournamentId),
  });
}

export function useUpdateTournamentPeriodSettings(tournamentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateTournamentPeriodSettingsPayload) =>
      v1Patch<TournamentPeriodSettingsResponse>(`/admin/tournaments/${tournamentId}/periods`, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: periodSettingsKey(tournamentId) });
      await queryClient.invalidateQueries({ queryKey: v1Keys.adminTournament(tournamentId) });
    },
  });
}
