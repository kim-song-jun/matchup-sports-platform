'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { v1Get, v1Post, v1Put } from '@/lib/api-client';

export type MultiFinalRule = { groupId: string; rank: number };
export type MultiFinalDefinition = { name: string; thirdPlace: boolean; rules: MultiFinalRule[]; registrationIds?: string[] | null };
export type MultiFinalGroup = { id: string; name: string; capacity: number; legs: 1 | 2; registrationIds?: string[] };
export type MultiFinalGroupStanding = {
  groupId: string; name: string; complete: boolean;
  rows: Array<{ registrationId: string; teamName: string; position: number | null; points: number;
    wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number; tiedRegistrationIds: string[] }>;
};
export type MultiFinalView = {
  revision: number; groups: MultiFinalGroup[]; generated: boolean; preliminaryFixtureCount?: number;
  groupStandings?: MultiFinalGroupStanding[];
  registrations: Array<{ id: string; team: { id: string; name: string } }>;
  finals: Array<MultiFinalDefinition & { suggestedRegistrationIds: string[]; manual: boolean; unresolved: Array<MultiFinalRule & { state: string; tiedRegistrationIds: string[] }> }>;
};
export type MultiFinalPreview = { plan?: {
  groups: Array<{ key: string; name: string; bracketTrack?: string }>;
  slots: Array<{ key: string; groupKey: string | null; position: number }>;
  fixtures: Array<{ key: string; groupKey: string; fixtureNumber: number; homeSlotKey: string | null; awaySlotKey: string | null }>;
  edges: Array<{ sourceFixtureKey: string; targetFixtureKey: string; targetSide: string; outcome: string }>;
}; revision: number; previewHash: string; counts: { fixtures: number; byes: number; tournaments: number }; finals: MultiFinalDefinition[] };
export function useMultiFinals(id: string, enabled: boolean) {
  const client = useQueryClient(); const path = `/admin/tournaments/${encodeURIComponent(id)}/bracket/multi-finals`;
  const refresh = () => client.invalidateQueries({ predicate: query => query.queryKey.some(key => key === id) });
  const view = useQuery({ queryKey: ['multi-finals', id], queryFn: () => v1Get<MultiFinalView>(path), enabled,
    refetchOnWindowFocus: false, refetchOnReconnect: false });
  const setup = useMutation({ mutationFn: (input: { expectedRevision: number; groups: Array<Omit<MultiFinalGroup, 'id'> & { registrationIds?: string[] }>; finals: MultiFinalDefinition[] }) => v1Post<MultiFinalView>(`${path}/setup`, input), onSuccess: refresh });
  const select = useMutation({ mutationFn: (input: { expectedRevision: number; finals: MultiFinalDefinition[] }) => v1Put<MultiFinalView>(`${path}/selection`, input), onSuccess: refresh });
  const updatePreliminary = useMutation({ mutationFn: (input: Parameters<typeof setup.mutateAsync>[0]) => v1Put<MultiFinalView>(`${path}/preliminary`, input), onSuccess: refresh });
  const reset = useMutation({ mutationFn: (input: { expectedRevision: number }) => v1Post<MultiFinalView>(`${path}/reset`, input), onSuccess: refresh });
  const preview = useMutation({ mutationFn: () => v1Post<MultiFinalPreview>(`${path}/preview`, {}) });
  const generate = useMutation({ mutationFn: (input: { expectedRevision: number; previewHash: string; requestId: string }) => v1Post<{ revision: number }>(`${path}/generate`, input), onSuccess: refresh });
  return { view, setup, select, updatePreliminary, reset, preview, generate };
}
