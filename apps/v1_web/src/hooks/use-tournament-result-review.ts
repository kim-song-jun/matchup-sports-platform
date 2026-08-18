'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { v1Get, v1Post } from '@/lib/api-client';
import { randomUuid } from '@/lib/uuid';
import type {
  V1GameResultCards,
  V1GameResultParticipantInput,
  V1GameResultParticipantRow,
  V1GameResultRevision,
  V1GameResultRevisionState,
  V1GameResultScore,
  V1GameResultScoreInput,
  V1GameRevisionMutationResult,
  V1GameSide,
} from '@/types/api';

/**
 * Task 23 -- tournament result review / correction UI data layer.
 *
 * This hook talks directly to the ALREADY SHIPPED Task 22 REST surface
 * (`apps/v1_api/src/tournament-operations/results/tournament-result-review.controller.ts`),
 * the Task 6 `GamesController` read/list endpoints, and the Task 18
 * `TournamentOperationsBoardController` list endpoint. No new backend route is
 * invented here.
 *
 * Task 19's shared tournament-ops shell HAS landed
 * (`apps/v1_web/src/app/tournament-ops/layout.tsx`,
 * `components/tournament-ops/tournament-ops-shell.tsx`,
 * `components/tournament-ops/role-context.tsx`), and so has the shared
 * `apps/v1_web/src/lib/query-keys.ts` registry -- an earlier version of this
 * comment claimed none of them existed, which was false. What is still absent
 * is a shared board-fetch hook (`hooks/use-tournament-operations.ts` does not
 * exist), so this hook keeps its own query-key builders locally rather than
 * extending a registry Task 23 does not own. `useTournamentEndedFixtures`'s
 * board fetch is the one seam a future refactor would want to fold into a
 * shared board hook once that hook exists.
 *
 * Server-shape types below are ALIASES of the shared `@/types/api` contract
 * wherever the shapes are identical. Re-declaring them locally as narrowed
 * copies is what caused the `assists`/`fouls` data loss documented on
 * `GameResultParticipantInput` -- a local copy silently drifts from the
 * contract, and `tsc` cannot tell you it drifted.
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

export type GameResultRevisionState = V1GameResultRevisionState;

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

export type GameResultCards = V1GameResultCards;

export type GameResultParticipantRecord = V1GameResultParticipantRow;

/**
 * Input shape for `SupersedeAndSubmitGameResultRevisionDto`/
 * `CreateGameResultCorrectionDto`'s `changes.actualParticipants`.
 *
 * 예전에는 이 타입을 로컬에 다시 선언해 두고 주석으로 "서버
 * `GameResultParticipantDto`(`apps/v1_api/src/games/dto/game-result.dto.ts`)를
 * field-for-field 미러"라고 적었는데 **사실이 아니었다** -- 그 로컬 복제본에는
 * `assists`/`fouls`가 빠져 있었다(서버 DTO 에는 `assists?`/`fouls?` 가 있고,
 * `tournament-result-review.service.ts`는 미전달 시 `?? 0`으로 채운다). 그래서 정정
 * 폼이 두 필드를 실어 보내지 않아 **점수만 고치는 정정 한 번에 선수 개개인의
 * 어시스트·파울이 전부 0으로 초기화**됐고, 확정 후 어시스트를 고칠 유일한 통로가
 * 이 정정 경로(직접 수정은 409 `RESULT_ALREADY_OFFICIAL`)라서 복구 수단도 없었다.
 * 지금은 공용 계약(`V1GameResultParticipantInput`)의 alias 다 -- 계약이 늘어나면
 * 필드를 빼먹은 폼이 조용히 통과하지 못하고 `tsc` 에서 걸린다.
 */
export type GameResultParticipantInput = V1GameResultParticipantInput;

export type GameResultRevision = V1GameResultRevision;

export type TournamentGameSide = V1GameSide;

/** 이 화면이 읽는 `GET /games/:gameId` 응답의 부분집합 -- 공용 `V1Game` 의 alias 로
 * 둘 수 없다. `V1Game.actorRole` 은 `string`(team-match 액터까지 포함하는 느슨한
 * 선언)이라 alias 하면 `ACTOR_ROLE_LABELS[role]` 인덱싱이 깨지고, `V1Game` 에는
 * 아래 `isKnockoutFixture` 가 없다. */
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
  /**
   * `V1TournamentGroup.phase !== 'group'` -- 서버가 `GET /games/:gameId` 응답에
   * 이미 싣는 필드다(`GamesService.getGame()` 이
   * `isKnockoutFixture(tx, tournamentFixtureId)` 결과를 그대로 넣는다). 운영 콘솔의
   * "승부차기 시작" 버튼 표시용으로 추가됐고(`types/game-operations.ts` 의
   * `GameDetail.isKnockoutFixture`), 이 lane 은 정정 폼의 사전 경고에 쓴다 --
   * 결선 경기의 정규시간 무승부는 승부차기 없이 저장되지 않으므로(409
   * `TOURNAMENT_PENALTY_REQUIRED`) 저장 버튼을 누르기 전에 알려야 한다.
   * 픽스처가 대회 픽스처가 아니거나 조에 배정되지 않았으면 보수적으로 `false`.
   */
  isKnockoutFixture: boolean;
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

export type GameRevisionMutationResult = V1GameRevisionMutationResult;

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
