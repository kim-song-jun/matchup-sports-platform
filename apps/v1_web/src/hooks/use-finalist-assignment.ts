'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { v1Get, v1Post } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';
import type { FinalistAssignmentInput, FinalistPreview } from '@/types/finalist-assignment';

export function useFinalistPreview(tournamentId: string) {
  return useQuery({ queryKey: ['finalist-assignment', tournamentId],
    queryFn: () => v1Get<FinalistPreview>(`/admin/tournaments/${tournamentId}/bracket/finalist-preview`),
    staleTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false, retry: false });
}
export function useApplyFinalists(tournamentId: string) {
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: FinalistAssignmentInput) => v1Post<{ assignments: { slotId: string; registrationId: string }[] }>(
    `/admin/tournaments/${tournamentId}/bracket/finalist-assignments`, input),
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: v1Keys.adminTournamentBracket(tournamentId) }),
      client.invalidateQueries({ queryKey: v1Keys.tournament(tournamentId) }),
      client.invalidateQueries({ queryKey: ['finalist-assignment', tournamentId] }),
      client.invalidateQueries({ queryKey: ['cross-group-round12', tournamentId] }),
    ]) });
}
