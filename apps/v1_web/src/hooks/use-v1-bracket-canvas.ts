'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { resultReviewKeys } from '@/hooks/use-tournament-result-review';
import { v1Patch, v1Post, v1Put } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';
import { randomUuid } from '@/lib/uuid';
import type {
  V1ApplyBracketTemplatePayload,
  V1ApplyBracketTemplateResult,
  V1AssignSlotResult,
  V1QuickResultResult,
  V1QuickResultScore,
  V1RandomFillResult,
} from '@/types/api';

export type BracketCompetitionScope = 'tournament' | 'league';

/** 대진이 바뀌면 어드민 화면과 공개 화면 캐시를 같이 털어야 한다. 리그는 상세 키 하나가 전부다. */
function invalidateCompetitionViews(queryClient: QueryClient, competitionId: string, scope: BracketCompetitionScope) {
  const keys =
    scope === 'league'
      ? [v1Keys.adminLeagueMatch(competitionId)]
      : [v1Keys.adminTournamentBracket(competitionId), v1Keys.tournament(competitionId)];
  return Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

/** `POST /admin/tournaments/:id/bracket/template` — 평탄한 kind 별 필드 + `replaceExisting`. */
export function useV1ApplyBracketTemplate(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: V1ApplyBracketTemplatePayload) =>
      v1Post<V1ApplyBracketTemplateResult>(`/admin/tournaments/${tournamentId}/bracket/template`, payload),
    onSuccess: async () => {
      await Promise.all([
        invalidateCompetitionViews(queryClient, tournamentId, 'tournament'),
        queryClient.invalidateQueries({ queryKey: v1Keys.adminTournament(tournamentId) }),
      ]);
    },
  });
}

/** `PUT /admin/tournament-slots/:slotId/assignment` — registrationId null 이면 자리를 비운다. */
export function useV1AssignTournamentSlot(competitionId: string, scope: BracketCompetitionScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slotId, registrationId }: { slotId: string; registrationId: string | null }) =>
      v1Put<V1AssignSlotResult>(`/admin/tournament-slots/${encodeURIComponent(slotId)}/assignment`, { registrationId }),
    onSuccess: () => invalidateCompetitionViews(queryClient, competitionId, scope),
  });
}

/** `POST /admin/tournaments/:id/slots/random-fill` — 리그도 같은 경로(id = 리그 id). */
export function useV1RandomFillSlots(competitionId: string, scope: BracketCompetitionScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => v1Post<V1RandomFillResult>(`/admin/tournaments/${competitionId}/slots/random-fill`),
    onSuccess: () => invalidateCompetitionViews(queryClient, competitionId, scope),
  });
}

/**
 * `POST /admin/games/:gameId/quick-result` — 점수만 넣어 바로 확정한다.
 * 서버가 `Idempotency-Key` 와 본문 `clientCommandId` 의 일치를 검사하므로 한 번 호출에 한 id 를 둘 다에 쓴다.
 */
export function useV1QuickResult(competitionId: string, scope: BracketCompetitionScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ gameId, expectedVersion, score }: { gameId: string; expectedVersion: number; score: V1QuickResultScore }) => {
      const clientCommandId = randomUuid();
      return v1Post<V1QuickResultResult>(
        `/admin/games/${encodeURIComponent(gameId)}/quick-result`,
        { clientCommandId, expectedVersion, score },
        { headers: { 'Idempotency-Key': clientCommandId } },
      );
    },
    onSuccess: async (_result, { gameId }) => {
      await Promise.all([
        invalidateCompetitionViews(queryClient, competitionId, scope),
        queryClient.invalidateQueries({ queryKey: resultReviewKeys.game(gameId) }),
        queryClient.invalidateQueries({ queryKey: resultReviewKeys.revisions(gameId) }),
      ]);
    },
  });
}

/** `PATCH /admin/fixtures/:id/bracket-sources` — 둘 다 null 이면 연결을 모두 해제한다. */
export function useV1SetBracketSources(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      fixtureId,
      homeSourceFixtureId,
      awaySourceFixtureId,
    }: {
      fixtureId: string;
      homeSourceFixtureId: string | null;
      awaySourceFixtureId: string | null;
    }) => v1Patch(`/admin/fixtures/${encodeURIComponent(fixtureId)}/bracket-sources`, { homeSourceFixtureId, awaySourceFixtureId }),
    onSuccess: () => invalidateCompetitionViews(queryClient, tournamentId, 'tournament'),
  });
}
