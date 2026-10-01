'use client';
import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { v1Get, v1Post, retryTransientFailure } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';

export type SharedGoal = { id: string; sideId: string; participantId: string | null; ownGoal: boolean; minute: number | null; subMatchId: string | null };
export type SharedPublicGoalEvent = {
  sideId: string;
  participantName: string | null;
  minute: number | null;
  ownGoal: boolean;
  subMatchId: string | null;
};
export type SharedSubMatch = { id: string; title: string; order: number; scores: { sideId: string; score: number | null }[] };
export type RecordChange = { id: string; version: number; action: string; actorName: string; goalId: string | null; subMatchId: string | null; before: SharedGoal | SharedSubMatch | null; after: SharedGoal | SharedSubMatch | null; at: string };
export type SharedRecord = {
  teamMatchId: string; title: string; startsAt: string | null; phase: 'scheduled' | 'live' | 'official' | 'cancelled' | 'legacy' | 'managed';
  version: number; serverTime: string; canEdit: boolean; participant: boolean; ownSideId: string | null;
  operator: boolean;
  /** 명단 밖 팀장·매니저가 자기 팀 쪽으로 기록·종료 확인 중이다(친선만, H5). */
  teamAuthority?: boolean;
  lineupReady: boolean;
  missingSides: { sideId: string; sideKey: 'HOME' | 'AWAY'; teamName: string }[];
  sides: { id: string; key: 'HOME' | 'AWAY'; name: string; score: number | null }[];
  subMatches: SharedSubMatch[];
  /** `guest` — 계정 없는 출전자(개인 기록에 안 남는다). */
  participants: { id: string; sideId: string; name: string; jerseyNumber: number | null; profileImageUrl: string | null; guest?: boolean }[];
  goals: SharedGoal[]; goalEvents?: SharedPublicGoalEvent[]; history: RecordChange[]; confirmations: { sideId: string; name: string | null; at: string }[]; officialAt: string | null;
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
  const client = useQueryClient();
  const query = useQuery({
    queryKey: key(id), queryFn: () => v1Get<SharedRecord>(`/team-matches/${id}/record`), enabled: !!id && enabled,
    refetchInterval: (query) => query.state.data?.phase === 'live' ? 2000 : query.state.data?.phase === 'scheduled' ? 15000 : false,
    refetchOnWindowFocus: true, retry: retryTransientFailure,
  });
  // 참석명단의 `lateAdditionAllowed`(늦게 온 선수 추가)는 첫 기록·결과 확정으로 서버에서 열리고 닫힌다 — 누가 기록했든
  // (내 저장 응답이든 상대 기록의 폴링이든) 기록 버전이 바뀌면 다시 읽는다. 이 훅을 여러 곳이 써도 요청은 하나만 나간다.
  const version = query.data?.version;
  const seenVersion = useRef(version);
  useEffect(() => {
    if (version === undefined || seenVersion.current === version) return;
    const firstLoad = seenVersion.current === undefined;
    seenVersion.current = version;
    if (!firstLoad) void client.invalidateQueries({ queryKey: v1Keys.teamMatchLineup(id), exact: true }, { cancelRefetch: false });
  }, [client, id, version]);
  return query;
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
