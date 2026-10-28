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
  kind: 'regular_tournament' | 'regular_league';
  competitionConfigVersionId: string | null;
  expectedVersion: string | null;
  periods: TournamentPeriodSetting[] | null;
  legacyPeriodCount: number | null;
  requiresDurationInput: boolean;
  stageOverrides: Array<{
    phase: TournamentPeriodPhase;
    competitionConfigVersionId: string;
    periods: TournamentPeriodSetting[] | null;
    legacyPeriodCount: number | null;
  }>;
  /** 저장(PATCH) 응답에만 있다 — 새 피리어드로 옮긴 시작 전 경기 수. */
  fixturesRepointed?: number;
}

export type TournamentPeriodPhase =
  | 'group' | 'round64' | 'round32' | 'round16' | 'round12'
  | 'quarter' | 'semi' | 'final' | 'third_place';

export interface UpdateTournamentPeriodSettingsPayload {
  expectedVersion: string;
  phase?: TournamentPeriodPhase;
  inheritDefault?: boolean;
  periods?: Array<{ durationMinutes: number }>;
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

/** 대회 생성 마법사용 — 대회 id 가 생성 직후에야 생기므로 변수로 받는다. */
export function useSaveTournamentPeriodSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ tournamentId, ...payload }: UpdateTournamentPeriodSettingsPayload & { tournamentId: string }) =>
      v1Patch<TournamentPeriodSettingsResponse>(`/admin/tournaments/${tournamentId}/periods`, payload),
    onSuccess: async (_data, { tournamentId }) => {
      await queryClient.invalidateQueries({ queryKey: periodSettingsKey(tournamentId) });
    },
  });
}
