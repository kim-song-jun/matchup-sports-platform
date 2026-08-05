/**
 * Task 21 — types for the live tournament operations console.
 *
 * These mirror the frozen REST/realtime contract in
 * `.omo/plans/teameet-team-tournament-operations-v1.md` ("Frozen REST and
 * idempotency contract" / "Frozen realtime contract") and the shipped
 * `apps/v1_api/src/games/**` DTOs/service responses (Task 18/20). Kept as a
 * dedicated domain file (not folded into `types/api.ts`) because this is a
 * large, self-contained surface.
 */

export type GameSourceType = 'TEAM_MATCH' | 'TOURNAMENT_FIXTURE';
export type GameState = 'SCHEDULED' | 'LIVE' | 'PAUSED' | 'ENDED' | 'CANCELLED';
export type GameSideKey = 'HOME' | 'AWAY';
export type GamePeriodState = 'SCHEDULED' | 'LIVE' | 'ENDED';
export type GameLineupState = 'DRAFT' | 'SUBMITTED' | 'LOCKED';

/**
 * The October minimum event set is GOAL/CARD; SUBSTITUTION and the
 * PERIOD_START / PERIOD_END / PAUSE / RESUME lifecycle markers are
 * backend-emitted, not operator-composed from this console. (Written out
 * rather than as a `PERIOD_*` glob on purpose: the `*` followed by `/` would
 * close this block comment early and everything below it would parse as code.)
 * CORRECTION is reused (per the
 * `V1GameEventType` enum — there is no dedicated FOUL type and the schema is
 * frozen, see Task 4) as the extensible bucket for a foul note: it is
 * captured for the record but is NOT read by `deriveTournamentRevision()`'s
 * score/card tally, unlike GOAL/CARD.
 *
 * Known debt (Task 21 review): this reuse is real wire-level overload, not
 * just a UI label choice. `GamesService.reverseEvent()` (the only OTHER
 * writer of `CORRECTION`) always sets `reversesEventId` to the event it
 * undoes; a foul note sent from this console goes through the generic
 * `appendEvent()`/`POST /games/:gameId/events` path instead, so its
 * `reversesEventId` is always `null`. The two are told apart ONLY by
 * `payload.kind === 'FOUL'` (see `EventCaptureModal.commitFoul` and
 * `queue-status-panel.tsx`'s `eventLabel()`) — any future code that reads a
 * game's raw event stream (audit, export, a correction/reversal review UI)
 * MUST check `payload.kind`, never assume `type === 'CORRECTION'` means a
 * real reversal. The correct fix is a dedicated `V1GameEventType.FOUL` enum
 * value, which needs a Prisma migration; that is out of this task's scope
 * (the plan's own Task 20 text calls FOUL a "next enabled type" once schema
 * work adds it) and is not done here.
 */
export type GameEventType =
  | 'GOAL'
  | 'CARD'
  | 'SUBSTITUTION'
  | 'PERIOD_START'
  | 'PERIOD_END'
  | 'PAUSE'
  | 'RESUME'
  | 'CORRECTION';

/** `payload.card` is the established backend convention (see
 * `apps/v1_api/src/games/games.service.ts`'s `deriveTournamentRevision()` /
 * result-invariant mapping) — not `cardType`. */
export type GameCardColor = 'YELLOW' | 'RED';

export type GameActorRole =
  | 'team_manager'
  | 'team_owner'
  | 'opponent_manager'
  | 'platform_ops'
  | 'tournament_director'
  | 'field_operator'
  | 'support_readonly';

export interface GameSide {
  id: string;
  gameId: string;
  sideKey: GameSideKey;
  teamId: string | null;
  displayNameSnapshot: string;
  createdAt: string;
  updatedAt: string;
}

export interface GamePeriod {
  id: string;
  gameId: string;
  number: number;
  state: GamePeriodState;
  startedAt: string | null;
  endedAt: string | null;
}

export interface GameLineupParticipant {
  id: string;
  gameId: string;
  sideId: string;
  lineupId: string;
  displayNameSnapshot: string;
  jerseyNumber: number | null;
  position: string | null;
  /** 피치 배치 좌표, 0~100 퍼센트(자기 진영 기준: y=0 골라인, y=100 하프라인). 둘 다 있거나 둘 다 없다. */
  positionX: number | null;
  positionY: number | null;
  /** 선발(true)/후보(false). 새로고침 시 후보 상태가 소실되던 결함을 고치는 컬럼(2026-08). */
  started: boolean;
  createdAt: string;
  updatedAt: string;
}

/** `GET .../lineup` response row — Task 21 added the `participants` array
 * (see `docs/api/domains/games.md`'s Task 21 addition note). */
export interface GameLineup {
  id: string;
  gameId: string;
  sideId: string;
  revision: number;
  state: GameLineupState;
  version: number;
  submittedAt: string | null;
  supersedesId: string | null;
  /** 포메이션 프리셋 라벨("4-4-2" 등), null이면 자유 배치. */
  formation: string | null;
  createdAt: string;
  updatedAt: string;
  participants: GameLineupParticipant[];
}

/** `GET /tournament-ops/tournaments/:tournamentId/fixtures/:fixtureId/lineup`
 * response — Task 21 changed this from a bare `GameLineup[]` to `{gameId,
 * lineups}` so a caller can resolve the fixture's `gameId` before any
 * lineup has ever been saved (see `docs/api/domains/tournament-operations.
 * md`'s Task 21 note). */
export interface FixtureLineupResponse {
  gameId: string;
  lineups: GameLineup[];
}

export interface GameDetail {
  id: string;
  sourceType: GameSourceType;
  state: GameState;
  version: number;
  lastSequence: number;
  competitionConfigVersionId: string;
  currentOfficialRevisionId: string | null;
  sides: GameSide[];
  periods: GamePeriod[];
  lineups: GameLineup[];
  actorRole: GameActorRole;
}

export interface GameEventRecord {
  id: string;
  gameId: string;
  sequence: number;
  clientEventId: string;
  payloadHash: string;
  type: GameEventType;
  sideId: string | null;
  participantId: string | null;
  period: number;
  clockMs: number;
  occurredAt: string;
  receivedAt: string;
  actorUserId: string;
  reversesEventId: string | null;
  payload: Record<string, unknown>;
}

export interface GameEventGap {
  expectedSequence: number;
  availableFrom: number;
}

export interface GameEventsBackfill {
  events: GameEventRecord[];
  lastSequence: number;
  gap: GameEventGap | null;
}

export type GameCommandName = 'start' | 'pause' | 'resume' | 'end';

export interface GameCommandRequest {
  expectedVersion: number;
  clientCommandId: string;
  takeoverToken: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

export interface GameMutationResult {
  gameId: string;
  state: GameState;
  version: number;
  durableCommandId: string;
  replayed: boolean;
}

export interface GameRevisionMutationResult extends GameMutationResult {
  revisionId: string;
  revision: number;
  revisionState: string;
}

/** The event payload actually appended (REST `POST .../events` /
 * WS `game.event.append`) — matches `AppendGameEventDto`. */
export interface GameEventAppendInput {
  expectedVersion: number;
  clientEventId: string;
  takeoverToken: string;
  type: GameEventType;
  sideId?: string;
  participantId?: string;
  period: number;
  clockMs: number;
  occurredAt: string;
  payload: Record<string, unknown>;
}

export interface GameEventAppendResult extends GameMutationResult {
  clientEventId: string;
  sequence: number;
}

export interface GameTakeoverGrant {
  gameId: string;
  takeoverToken: string;
  version: number;
  lastSequence: number;
  expiresAt: string;
}
