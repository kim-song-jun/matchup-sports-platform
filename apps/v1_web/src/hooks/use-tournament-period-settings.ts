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
  /** 조별리그 조 하나만 따로 정한 경기 시간. 정규 리그는 항상 비어 있다. */
  groupOverrides: Array<{
    groupId: string;
    name: string;
    competitionConfigVersionId: string;
    periods: TournamentPeriodSetting[] | null;
    legacyPeriodCount: number | null;
  }>;
  /** GET 응답에서만 제공 — 이 대회·리그에서 경기 시간을 따로 정한 경기 수. */
  matchOverrideCount?: number;
  /** 저장(PATCH) 응답에만 있다 — 새 피리어드로 옮긴 시작 전 경기 수. */
  fixturesRepointed?: number;
}

export type TournamentPeriodPhase =
  | 'group' | 'round64' | 'round32' | 'round16' | 'round12'
  | 'quarter' | 'semi' | 'final' | 'third_place';

/** 경기 하나의 경기 시간 — 지금 쓰는 값과, 따로 정하지 않았다면 이어받을 위 설정. */
export interface TournamentMatchPeriodsResponse {
  tournamentId: string;
  teamMatchId: string;
  expectedVersion: string;
  overridden: boolean;
  /** 시작했거나 끝난 경기는 false — 바꿀 수 없다. */
  editable: boolean;
  periods: TournamentPeriodSetting[] | null;
  legacyPeriodCount: number | null;
  inherited: {
    source: 'group' | 'stage' | 'default';
    phase: TournamentPeriodPhase | null;
    groupName: string | null;
    periods: TournamentPeriodSetting[] | null;
    legacyPeriodCount: number | null;
  };
}

export interface UpdateTournamentPeriodSettingsPayload {
  expectedVersion: string;
  /** phase·groupId·teamMatchId 중 하나만 보낸다. 없으면 대회 기본값이다. */
  phase?: TournamentPeriodPhase;
  groupId?: string;
  teamMatchId?: string;
  inheritDefault?: boolean;
  periods?: Array<{ durationMinutes: number }>;
}

const periodSettingsKey = (tournamentId: string) =>
  [...v1Keys.adminTournament(tournamentId), 'period-settings'] as const;

export function useTournamentPeriodSettings(tournamentId: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: periodSettingsKey(tournamentId),
    queryFn: () => v1Get<TournamentPeriodSettingsResponse>(`/admin/tournaments/${tournamentId}/periods`),
    enabled: Boolean(tournamentId) && (options.enabled ?? true),
  });
}

/** 경기 수정 화면용. teamMatchId 가 없으면 부르지 않는다. */
export function useTournamentMatchPeriods(tournamentId: string, teamMatchId: string | null) {
  return useQuery({
    queryKey: [...periodSettingsKey(tournamentId), 'match', teamMatchId] as const,
    queryFn: () => v1Get<TournamentMatchPeriodsResponse>(`/admin/tournaments/${tournamentId}/periods/matches/${teamMatchId}`),
    enabled: Boolean(tournamentId && teamMatchId),
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
    // 버전 충돌 뒤 같은 낡은 버전으로 다시 보내지 않게 설정을 다시 읽는다.
    onError: () => queryClient.invalidateQueries({ queryKey: periodSettingsKey(tournamentId) }),
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
