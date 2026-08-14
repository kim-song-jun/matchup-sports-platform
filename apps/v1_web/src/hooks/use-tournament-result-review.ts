'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { v1Get, v1Post } from '@/lib/api-client';
import { randomUuid } from '@/lib/uuid';
import type { V1GameResultScore, V1GameResultScoreInput } from '@/types/api';

/**
 * Task 23 -- tournament result review / correction UI data layer.
 *
 * This hook talks directly to the ALREADY SHIPPED Task 22 REST surface
 * (`apps/v1_api/src/tournament-operations/results/tournament-result-review.controller.ts`),
 * the Task 6 `GamesController` read/list endpoints, and the Task 18
 * `TournamentOperationsBoardController` list endpoint. No new backend route is
 * invented here.
 *
 * Task 19 (`apps/v1_web/src/app/tournament-ops/layout.tsx`,
 * `apps/v1_web/src/hooks/use-tournament-operations.ts`) has not landed in this
 * worktree yet -- there is no shared tournament-ops shell/hook to build on top
 * of. This hook is therefore self-contained: it keeps its own query-key
 * builders locally instead of extending the shared `apps/v1_web/src/lib/
 * query-keys.ts` registry (which Task 23 does not own), so it never has to
 * touch a path outside this lane's declared ownership. When Task 19 lands,
 * `useTournamentEndedFixtures`'s board fetch is the one seam a future
 * refactor would want to fold into a shared board hook.
 */

// ── Shared server-shape types ───────────────────────────────────────────────

export type TournamentStaffActorRole =
  | 'platform_ops'
  | 'tournament_director'
  | 'field_operator'
  | 'support_readonly';

/** `GamesService.getGame()`'s `actorRole` also covers team-match actors; a
 * tournament-fixture game (the only kind this lane ever reads) only ever
 * resolves to one of `TournamentStaffActorRole` -- see
 * `GamesService.resolveActor()`'s `TOURNAMENT_FIXTURE` branch. */
export type GameActorRole = TournamentStaffActorRole;

export type GameResultRevisionState =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'CHANGE_REQUESTED'
  | 'SUPPLEMENT_REQUESTED'
  | 'REJECTED'
  | 'OFFICIAL'
  | 'VOID';

/**
 * `GET /games/:gameId/result-revisions`/the operations board 가 실제로 돌려주는
 * 스코어는 **두 형태의 union**이다 -- 이 화면이 새로 만드는 결과는 평평한
 * `{home, away, penalties?}`, 레거시 백필 경로로 들어온 결과는 중첩된
 * `{regulation:{home,away}|null, penalty, goals, incomplete, provenance}`다(알파
 * 실측: 백필된 경기가 `undefined:undefined`로 표시됐다). 예전에는 이 타입을 항상
 * 평평한 형태로만(잘못) 선언해서 `.home`/`.away`를 직접 읽는 소비처가 컴파일은
 * 통과하면서 런타임에만 깨졌다. 정확한 계약은 `@/types/api`의
 * `V1GameResultScore`이므로 그걸 그대로 재사용한다 -- 읽는 쪽은 반드시
 * `lib/game-result-score.ts`의 `readGameResultScore`/`formatGameResultScore`로
 * 분기해야 한다.
 */
export type GameResultScore = V1GameResultScore;

/** 결과 제출(정정/재제출) 시 **보내는** 스코어 -- 서버 `GameScoreDto`가
 * `whitelist: true, forbidNonWhitelisted: true` 아래서 `home`/`away`/`penalties?`만
 * 받으므로, 위 `GameResultScore`(서버가 돌려주는 스냅샷)를 그대로 보내면 여분
 * 필드(`goals`/`penalty`/`incomplete`/`provenance`/`regulation`) 때문에
 * `400 VALIDATION_ERROR`가 난다(알파 실측). 두 방향이 이 타입을 공유하지 않도록
 * 분리해 뒀다 -- `@/types/api`의 `V1GameResultScoreInput`을 그대로 재사용한다. */
export type GameResultScoreInput = V1GameResultScoreInput;

export type GameResultCards = { yellow: number; red: number };

export type GameResultParticipantRecord = {
  id: string;
  resultRevisionId: string;
  participantId: string;
  sideId: string;
  started: boolean;
  minutesPlayed: number | null;
  goals: number;
  assists: number;
  fouls: number;
  cards: GameResultCards;
  goalkeeper: boolean;
};

/** Input shape for `SupersedeAndSubmitGameResultRevisionDto`/
 * `CreateGameResultCorrectionDto`'s `changes.actualParticipants` -- mirrors
 * `GameResultParticipantDto` in `apps/v1_api/src/games/dto/game-result.dto.ts`
 * field-for-field (that file is outside this lane's ownership; this type is a
 * standalone client-side mirror, not an import). */
export type GameResultParticipantInput = {
  participantId: string;
  sideId: string;
  started: boolean;
  minutesPlayed?: number;
  goals: number;
  cards: GameResultCards;
  goalkeeper: boolean;
};

export type GameResultRevision = {
  id: string;
  gameId: string;
  revision: number;
  state: GameResultRevisionState;
  score: GameResultScore;
  eventsHash: string;
  missingScorer: boolean;
  mvpParticipantId: string | null;
  reason: string | null;
  createdByActorType: 'USER' | 'SYSTEM';
  createdByUserId: string | null;
  createdBySystemActor: string | null;
  supersedesId: string | null;
  submittedAt: string | null;
  officialAt: string | null;
  createdAt: string;
  updatedAt: string;
  resultParticipants: GameResultParticipantRecord[];
};

export type TournamentGameSide = {
  id: string;
  gameId: string;
  sideKey: 'HOME' | 'AWAY';
  teamId: string | null;
  displayNameSnapshot: string;
};

export type TournamentGameDetail = {
  id: string;
  sourceType: 'TEAM_MATCH' | 'TOURNAMENT_FIXTURE';
  state: 'SCHEDULED' | 'LIVE' | 'PAUSED' | 'ENDED' | 'CANCELLED';
  version: number;
  lastSequence: number;
  competitionConfigVersionId: string;
  currentOfficialRevisionId: string | null;
  sides: TournamentGameSide[];
  actorRole: GameActorRole;
};

export type TournamentOperationsBoardWarning =
  | 'NO_FIELD_ASSIGNED'
  | 'MISSING_SCORER'
  | 'RESULT_REVIEW_OVERDUE';

export type TournamentOperationsBoardItem = {
  fixtureId: string;
  tournamentId: string;
  round: string;
  fixtureNumber: number;
  gameId: string | null;
  gameState: string | null;
  fieldId: string | null;
  fieldName: string | null;
  homeRegistrationId: string | null;
  awayRegistrationId: string | null;
  scheduledAt: string | null;
  currentScore: GameResultScore | null;
  warnings: TournamentOperationsBoardWarning[];
  version: number | null;
  revisionId: string | null;
  stableRevision: string;
};

export type TournamentOperationsBoardResponse = {
  items: TournamentOperationsBoardItem[];
  nextCursor: string | null;
  watermark: string;
  liveWarnings: Array<{ fixtureId: string; warnings: string[] }>;
};

export type GameRevisionMutationResult = {
  gameId: string;
  state: string;
  version: number;
  durableCommandId: string;
  replayed: boolean;
  revisionId: string;
  revision: number;
  revisionState: GameResultRevisionState;
};

// ── Query keys (local to this lane -- see module doc comment) ──────────────

const resultReviewKeys = {
  board: (tournamentId: string, status: string) =>
    ['v1', 'tournament-ops', tournamentId, 'operations', { status }] as const,
  game: (gameId: string) => ['v1', 'games', gameId] as const,
  revisions: (gameId: string) => ['v1', 'games', gameId, 'result-revisions'] as const,
};

// ── Reads ────────────────────────────────────────────────────────────────────

/**
 * Ended fixtures for a tournament, via the Task 18 operations board
 * (`GET /tournament-ops/tournaments/:tournamentId/operations?status=ENDED`).
 * A "review" candidate is `gameState === 'ENDED' && revisionId === null`
 * (nothing officialized yet) or carries `RESULT_REVIEW_OVERDUE`; a
 * "correction" candidate is `revisionId !== null` (has an official result).
 * Pages filter this same list for their own purpose -- see
 * `components/tournament-result-review/fixture-picker-list.tsx`.
 */
export function useTournamentEndedFixtures(tournamentId: string) {
  return useQuery({
    queryKey: resultReviewKeys.board(tournamentId, 'ENDED'),
    queryFn: () =>
      v1Get<TournamentOperationsBoardResponse>(
        `/tournament-ops/tournaments/${encodeURIComponent(tournamentId)}/operations`,
        { status: 'ENDED', limit: 100 },
      ),
    enabled: Boolean(tournamentId),
    staleTime: 15_000,
  });
}

export function useTournamentGame(gameId: string | null) {
  return useQuery({
    queryKey: gameId ? resultReviewKeys.game(gameId) : (['v1', 'games', '__none__'] as const),
    queryFn: () => v1Get<TournamentGameDetail>(`/games/${encodeURIComponent(gameId as string)}`),
    enabled: Boolean(gameId),
  });
}

export function useGameResultRevisions(gameId: string | null) {
  return useQuery({
    queryKey: gameId
      ? resultReviewKeys.revisions(gameId)
      : (['v1', 'games', '__none__', 'result-revisions'] as const),
    queryFn: () =>
      v1Get<GameResultRevision[]>(`/games/${encodeURIComponent(gameId as string)}/result-revisions`),
    enabled: Boolean(gameId),
  });
}

function invalidateGame(
  queryClient: ReturnType<typeof useQueryClient>,
  gameId: string,
  tournamentId?: string,
) {
  queryClient.invalidateQueries({ queryKey: resultReviewKeys.game(gameId) });
  queryClient.invalidateQueries({ queryKey: resultReviewKeys.revisions(gameId) });
  if (tournamentId) {
    queryClient.invalidateQueries({ queryKey: resultReviewKeys.board(tournamentId, 'ENDED') });
  }
}

function postGameCommand<T>(path: string, body: Record<string, unknown>) {
  const clientCommandId = randomUuid();
  return v1Post<T>(
    path,
    { ...body, clientCommandId },
    { headers: { 'Idempotency-Key': clientCommandId } },
  );
}

// ── Officialize projection-preview hash ─────────────────────────────────────

/** Mirrors `canonicalize()` in `apps/v1_api/src/games/games.service.ts`
 * field-for-field: recursively sorts object keys with `localeCompare` (arrays
 * and primitives pass through unchanged). Both sides must produce
 * byte-identical `JSON.stringify` output for the SHA-256 digest below to
 * match the server's `canonicalGameCommandPayloadHash()` -- see
 * `TournamentResultReviewService.projectionPreviewHash()`. */
function canonicalizeForPreviewHash(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeForPreviewHash);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalizeForPreviewHash(nested)]),
    );
  }
  return value;
}

/**
 * The client-reconstructable "projection preview" confirmation hash required
 * by `OfficializeGameResultRevisionDto.projectionPreviewHash` -- proves the
 * caller is officializing the EXACT revision content they were shown, not a
 * stale one. Must equal
 * `TournamentResultReviewService.projectionPreviewHash()`'s server-side
 * SHA-256 of `JSON.stringify(canonicalize({score, eventsHash,
 * mvpParticipantId}))`. Any mismatch is rejected server-side with
 * `409 PROJECTION_PREVIEW_MISMATCH` before `OFFICIAL` is ever written -- this
 * function's correctness is therefore load-bearing, not cosmetic.
 */
export async function computeProjectionPreviewHash(input: {
  score: unknown;
  eventsHash: string;
  mvpParticipantId: string | null;
}): Promise<string> {
  const canonical = canonicalizeForPreviewHash({
    score: input.score,
    eventsHash: input.eventsHash,
    mvpParticipantId: input.mvpParticipantId,
  });
  const bytes = new TextEncoder().encode(JSON.stringify(canonical));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

// ── Mutations ────────────────────────────────────────────────────────────────

export type ReviewResultDecisionInput = {
  revisionId: string;
  expectedVersion: number;
  decision: 'reject' | 'request_supplement';
  reason: string;
};

/** `POST /games/:gameId/result-revisions/:revisionId/review-decision` --
 * tournament_director/platform_ops only (enforced server-side); reject and
 * request_supplement are both terminal for the target revision. */
export function useReviewResultDecision(gameId: string, tournamentId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReviewResultDecisionInput) =>
      postGameCommand<GameRevisionMutationResult>(
        `/games/${encodeURIComponent(gameId)}/result-revisions/${encodeURIComponent(input.revisionId)}/review-decision`,
        {
          expectedVersion: input.expectedVersion,
          decision: input.decision,
          reason: input.reason,
        },
      ),
    onSuccess: () => invalidateGame(queryClient, gameId, tournamentId),
  });
}

export type SupersedeAndSubmitInput = {
  revisionId: string;
  expectedVersion: number;
  score: GameResultScoreInput;
  actualParticipants: GameResultParticipantInput[];
  eventsHash: string;
  mvpParticipantId?: string;
  reason: string;
};

/** `POST /games/:gameId/result-revisions/:revisionId/supersede-and-submit` --
 * base revision must be `REJECTED`/`SUPPLEMENT_REQUESTED` (server-enforced,
 * `409 RESULT_RESUBMISSION_NOT_ALLOWED` otherwise); creates+submits a fresh
 * successor atomically with a new review SLA. */
export function useSupersedeAndSubmitResult(gameId: string, tournamentId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SupersedeAndSubmitInput) => {
      const { revisionId, ...body } = input;
      return postGameCommand<GameRevisionMutationResult>(
        `/games/${encodeURIComponent(gameId)}/result-revisions/${encodeURIComponent(revisionId)}/supersede-and-submit`,
        body,
      );
    },
    onSuccess: () => invalidateGame(queryClient, gameId, tournamentId),
  });
}

export type OfficializeResultInput = {
  revisionId: string;
  expectedVersion: number;
  score: unknown;
  eventsHash: string;
  mvpParticipantId: string | null;
};

/** `POST /games/:gameId/result-revisions/:revisionId/officialize` --
 * platform_ops always; tournament_director only while `DIRECTOR_OFFICIALIZE`
 * is `on` (re-checked fresh by the server on every call --
 * `403 DIRECTOR_OFFICIALIZE_DISABLED` otherwise). Computes
 * `projectionPreviewHash` from the exact revision content the caller was
 * shown before submitting. */
export function useOfficializeResultRevision(gameId: string, tournamentId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: OfficializeResultInput) => {
      const projectionPreviewHash = await computeProjectionPreviewHash({
        score: input.score,
        eventsHash: input.eventsHash,
        mvpParticipantId: input.mvpParticipantId,
      });
      return postGameCommand<GameRevisionMutationResult>(
        `/games/${encodeURIComponent(gameId)}/result-revisions/${encodeURIComponent(input.revisionId)}/officialize`,
        { expectedVersion: input.expectedVersion, projectionPreviewHash },
      );
    },
    onSuccess: () => invalidateGame(queryClient, gameId, tournamentId),
  });
}

export type VoidResultInput = {
  revisionId: string;
  expectedVersion: number;
  reason: string;
};

/** `POST /games/:gameId/result-revisions/:revisionId/void` -- platform_ops
 * always; tournament_director only while `DIRECTOR_OFFICIALIZE` is `on`. Only
 * the game's CURRENT official revision may be voided
 * (`409 REVISION_MUST_BE_SUPERSEDED` otherwise), and a downstream bracket
 * fixture that already advanced blocks the void with
 * `409 NEXT_FIXTURE_CONFLICT`. */
export function useVoidResultRevision(gameId: string, tournamentId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: VoidResultInput) =>
      postGameCommand<GameRevisionMutationResult>(
        `/games/${encodeURIComponent(gameId)}/result-revisions/${encodeURIComponent(input.revisionId)}/void`,
        { expectedVersion: input.expectedVersion, reason: input.reason },
      ),
    onSuccess: () => invalidateGame(queryClient, gameId, tournamentId),
  });
}

export type CreateResultCorrectionInput = {
  expectedVersion: number;
  baseRevisionId: string;
  reason: string;
  changes: {
    score: GameResultScoreInput;
    actualParticipants: GameResultParticipantInput[];
    eventsHash: string;
    mvpParticipantId?: string;
  };
};

/** `POST /games/:gameId/corrections` -- platform_ops/tournament_director,
 * NOT flag-gated (only officialize/void are). Creates a same-game
 * superseding `DRAFT` against the game's CURRENT official revision; the
 * prior official pointer stays authoritative until that draft is separately
 * officialized. */
export function useCreateResultCorrection(gameId: string, tournamentId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateResultCorrectionInput) =>
      postGameCommand<GameRevisionMutationResult>(
        `/games/${encodeURIComponent(gameId)}/corrections`,
        input,
      ),
    onSuccess: () => invalidateGame(queryClient, gameId, tournamentId),
  });
}
