'use client';

import { useCallback, useMemo } from 'react';
import { usePatchPeriods } from '@/hooks/use-tournament-period-settings';
import { useV1AdminTournament, useV1UpdateTournament } from '@/hooks/use-v1-api';
import type { V1UpdateTournamentPayload } from '@/types/api';

/** 섹션 폼의 저장 단계가 쓰는 호출 — 둘 다 보내기 직전에 최신 버전을 다시 읽는다. */
export interface SaveContext {
  patchTournament(fields: Omit<V1UpdateTournamentPayload, 'expectedVersion'>): Promise<void>;
  patchPeriods: ReturnType<typeof usePatchPeriods>;
}

export function useTournamentSaveContext(tournamentId: string): SaveContext {
  const { refetch } = useV1AdminTournament(tournamentId);
  const { mutateAsync } = useV1UpdateTournament(tournamentId);
  const patchPeriods = usePatchPeriods(tournamentId);

  const patchTournament = useCallback(
    async (fields: Omit<V1UpdateTournamentPayload, 'expectedVersion'>): Promise<void> => {
      const { data } = await refetch({ throwOnError: true });
      if (!data) throw new Error('대회 정보를 다시 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      await mutateAsync({ ...fields, expectedVersion: data.updatedAt });
    },
    [mutateAsync, refetch],
  );

  return useMemo(() => ({ patchTournament, patchPeriods }), [patchTournament, patchPeriods]);
}
