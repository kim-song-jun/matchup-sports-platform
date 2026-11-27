'use client';

import { useMutation } from '@tanstack/react-query';
import { useV1DataSource } from '@/components/providers/v1-data-source';

export type BracketResetPreview = {
  snapshot: string; fixtureCount: number; groupCount: number;
  canReset: boolean; blockedReason: string | null; stageBased: boolean; preservesPreliminaryGroups: boolean;
};

export function useBracketReset(tournamentId: string) {
  const { v1Get, v1Post } = useV1DataSource();
  const path = `/admin/tournaments/${encodeURIComponent(tournamentId)}/bracket`;
  const preview = () => v1Get<BracketResetPreview>(`${path}/reset-preview`);
  const reset = useMutation({ mutationFn: (expectedSnapshot: string) =>
    v1Post<{ deletedFixtureCount: number }>(`${path}/reset`, { expectedSnapshot, confirmed: true }) });
  return { preview, reset };
}
