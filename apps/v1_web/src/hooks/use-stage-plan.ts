'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useV1DataSource } from '@/components/providers/v1-data-source';
import type { StagePlan, StagePlanView } from '@/types/stage-plan';
export function useStagePlan(id: string) {
  const { v1Get, v1Post, v1Put } = useV1DataSource();
  const client = useQueryClient(), path = `/admin/tournaments/${encodeURIComponent(id)}/stages`;
  const refresh = async (data: StagePlanView) => {
    client.setQueryData(['stages', id], data);
    await client.invalidateQueries({ predicate: q => q.queryKey.some(k => k === id) });
  };
  const view = useQuery({ queryKey: ['stages', id], queryFn: () => v1Get<StagePlanView>(path), refetchOnWindowFocus: false, refetchOnReconnect: false });
  const generate = useMutation({ mutationFn: (input: { expectedRevision: number }) => v1Post<StagePlanView>(`${path}/generate`, input), onSuccess: refresh });
  const assign = useMutation({ mutationFn: (input: { expectedRevision: number; poolKey: string; registrationIds: Array<string | null>; sourceVersion: string; reason?: string; acknowledgeStartedCorrection?: boolean; draft?: boolean; overrideCandidates?: boolean }) => v1Put<StagePlanView>(`${path}/assignment`, input), onSuccess: refresh });
  const rename = useMutation({ mutationFn: (input: { expectedRevision: number; poolKey: string; name: string; stageName?: string; overallRankStart?: number | null }) => v1Put<StagePlanView>(`${path}/names`, input), onSuccess: refresh });
  const structure = useMutation({ mutationFn: (input: { expectedRevision: number; plan: StagePlan; reason: string }) => v1Put<StagePlanView>(`${path}/structure`, input), onSuccess: refresh });
  const repair = useMutation({ mutationFn: (input: { expectedRevision: number; fixtureId: string; action: 'remove' | 'restore' | 'replay'; reason: string }) => v1Post<StagePlanView>(`${path}/fixtures/repair`, input), onSuccess: refresh });
  const sixTeam = useMutation({ mutationFn: (input: { expectedRevision: number; poolKey: string; sourceVersion: string; byeRegistrationId: string | null; reason: string }) => v1Put<StagePlanView>(`${path}/six-team`, input), onSuccess: refresh });
  const randomize = useMutation({ mutationFn: (input: { expectedRevision: number }) => v1Post<StagePlanView>(`${path}/randomize`, input), onSuccess: refresh });
  const automation = useMutation({ mutationFn: (input: { expectedRevision: number; enabled: boolean }) => v1Put<StagePlanView>(`${path}/automation`, input), onSuccess: refresh });
  return { view, generate, assign, rename, randomize, automation, structure, repair, sixTeam };
}
