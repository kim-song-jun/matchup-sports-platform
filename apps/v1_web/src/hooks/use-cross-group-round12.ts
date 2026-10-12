'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { v1Get, v1Post } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';
import type { CrossGroupApplyInput, CrossGroupPreview } from '@/types/cross-group-round12';

export function useCrossGroupRound12Preview(tournamentId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['cross-group-round12', tournamentId],
    queryFn: () => v1Get<CrossGroupPreview>(`/admin/tournaments/${tournamentId}/bracket/round12-preview`),
    enabled, staleTime: 0, refetchOnWindowFocus: false, retry: false,
  });
}
export function useApplyCrossGroupRound12(tournamentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CrossGroupApplyInput) => v1Post<{ assignments: { slotId: string; registrationId: string }[] }>(
      `/admin/tournaments/${tournamentId}/bracket/round12-assignments`, input),
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: v1Keys.adminTournamentBracket(tournamentId) }),
      client.invalidateQueries({ queryKey: v1Keys.tournament(tournamentId) }),
      client.invalidateQueries({ queryKey: ['cross-group-round12', tournamentId] }),
    ]),
  });
}
