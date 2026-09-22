'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { v1Get, v1Post, retryTransientFailure } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';

export type SharedGoal = { id: string; sideId: string; participantId: string | null; ownGoal: boolean; minute: number | null; subMatchId: string | null };
export type SharedSubMatch = { id: string; title: string; order: number; scores: { sideId: string; score: number | null }[] };
export type RecordChange = { id: string; version: number; action: string; actorName: string; goalId: string | null; subMatchId: string | null; before: SharedGoal | SharedSubMatch | null; after: SharedGoal | SharedSubMatch | null; at: string };
export type SharedRecord = {
  teamMatchId: string; title: string; startsAt: string | null; phase: 'scheduled' | 'live' | 'official' | 'cancelled' | 'legacy' | 'managed';
  version: number; serverTime: string; canEdit: boolean; participant: boolean; ownSideId: string | null;
  sides: { id: string; key: 'HOME' | 'AWAY'; name: string; score: number | null }[];
  subMatches: SharedSubMatch[];
  participants: { id: string; sideId: string; name: string; jerseyNumber: number | null }[];
  goals: SharedGoal[]; history: RecordChange[]; confirmations: { sideId: string; name: string | null; at: string }[]; officialAt: string | null;
};
export type RecordCommand = {
  commandId: string;
  expectedVersion: number;
  action: 'add' | 'edit' | 'delete' | 'undo' | 'confirm' | 'reopen' | 'submatch_add' | 'submatch_edit' | 'submatch_delete';
  goalId?: string;
  changeId?: string;
  subMatchId?: string | null;
  title?: string;
  sideId?: string;
  participantId?: string | null;
  ownGoal?: boolean;
  minute?: number | null;
};
const key = (id: string) => [...v1Keys.teamMatch(id), 'shared-record'];
export function useTeamMatchRecord(id: string, enabled = true) {
  return useQuery({
    queryKey: key(id), queryFn: () => v1Get<SharedRecord>(`/team-matches/${id}/record`), enabled: !!id && enabled,
    refetchInterval: (query) => query.state.data?.phase === 'live' ? 2000 : query.state.data?.phase === 'scheduled' ? 15000 : false,
    refetchOnWindowFocus: true, retry: retryTransientFailure,
  });
}
export function useMutateTeamMatchRecord(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (command: RecordCommand) => v1Post<SharedRecord>(`/team-matches/${id}/record`, command),
    retry: retryTransientFailure,
    onSuccess: async (data) => {
      await client.cancelQueries({ queryKey: key(id) });
      client.setQueryData<SharedRecord>(key(id), (current) => current && current.version > data.version ? current : data);
      if (data.phase === 'official') void client.invalidateQueries({ queryKey: v1Keys.teamMatchesAll() });
    },
    onError: () => { void client.invalidateQueries({ queryKey: key(id) }); },
  });
}
