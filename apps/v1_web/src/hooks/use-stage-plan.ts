'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useV1DataSource } from '@/components/providers/v1-data-source';
import type { StagePlanView } from '@/types/stage-plan';
export function useStagePlan(id: string) {
  const { v1Get, v1Post, v1Put } = useV1DataSource();
  const client = useQueryClient(), path = `/admin/tournaments/${encodeURIComponent(id)}/stages`;
  const refresh = async (data: StagePlanView) => {
    client.setQueryData(['stages', id], data);
    await client.invalidateQueries({ predicate: q => q.queryKey.some(k => k === id) });
  };
  const view = useQuery({ queryKey: ['stages', id], queryFn: () => v1Get<StagePlanView>(path), refetchOnWindowFocus: false, refetchOnReconnect: false });
  const generate = useMutation({ mutationFn: (input: { expectedRevision: number }) => v1Post<StagePlanView>(`${path}/generate`, input), onSuccess: refresh });
  const assign = useMutation({ mutationFn: (input: { expectedRevision: number; poolKey: string; registrationIds: string[]; sourceVersion: string; reason?: string }) => v1Put<StagePlanView>(`${path}/assignment`, input), onSuccess: refresh });
  return { view, generate, assign };
}
